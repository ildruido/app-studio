import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type pg from "pg";
import { addUsage, allowanceFor, getUsed, resetsAt } from "./ledger.js";
import {
  MAX_PROMPT_BYTES,
  MAX_TOOLS,
  PromptTooLarge,
  RequestError,
  StreamMapper,
  ToolsUnavailable,
  mapUpstreamError,
  parseRequest,
  toUpstream,
  type CoachEvent,
  type ModelIds,
} from "./mapping.js";
import { UpstreamError, type CoachUpstream } from "./upstream.js";
import { rateLimit } from "../web.js";

export interface CoachDeps {
  pool: pg.Pool;
  /** Null when the server has no API key: the routes answer `capability_removed`. */
  upstream: CoachUpstream | null;
  models: ModelIds;
  defaultAllowance: number;
  /** Calls running at once per person, so parallel clicks can't slip past the allowance check. */
  maxConcurrent?: number;
  /** Requests per person per minute (default 30). */
  maxPerMinute?: number;
  now?: () => Date;
}

const MAX_BODY = 256 * 1024;

type Status = 400 | 401 | 403 | 413 | 429 | 503;
const fail = (c: Context, status: Status, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

export function coachRoutes(
  deps: CoachDeps,
  resolveUser: (c: Context) => string | null | Promise<string | null>,
): Hono {
  const { pool, upstream, models } = deps;
  const now = deps.now ?? (() => new Date());
  const maxConcurrent = deps.maxConcurrent ?? 2;
  const running = new Map<string, number>();
  const coach = new Hono<{ Variables: { userId: string } }>();

  coach.use("*", async (c, next) => {
    const userId = await resolveUser(c);
    if (!userId) return fail(c, 401, "not_granted", "sign in first");
    c.set("userId", userId);
    await next();
  });

  // Starting calls is also capped per minute, on top of the monthly allowance and two at once.
  coach.use(
    "*",
    rateLimit({
      max: deps.maxPerMinute ?? 30,
      windowMs: 60_000,
      key: (c) => `coach:${String(c.get("userId"))}`,
    }),
  );

  coach.get("/limits", (c) =>
    c.json({ maxPromptBytes: MAX_PROMPT_BYTES, tools: { maxCount: MAX_TOOLS } }),
  );

  coach.get("/usage", async (c) => {
    const userId = c.get("userId");
    const [used, allowance] = await Promise.all([
      getUsed(pool, userId, now()),
      allowanceFor(pool, userId, deps.defaultAllowance),
    ]);
    return c.json({ usedTokens: used, allowanceTokens: allowance, resetsAt: resetsAt(now()) });
  });

  coach.post(
    "/",
    bodyLimit({
      maxSize: MAX_BODY,
      onError: (c) => fail(c, 413, "prompt_too_large", "request too large"),
    }),
    async (c) => {
      if (!upstream) return fail(c, 503, "capability_removed", "the coach is not set up");
      const userId = c.get("userId");

      let req;
      try {
        req = parseRequest(await c.req.json().catch(() => null));
      } catch (err) {
        if (err instanceof PromptTooLarge)
          return fail(c, 413, "prompt_too_large", "prompt too large");
        if (err instanceof ToolsUnavailable)
          return fail(c, 400, "tools_unavailable", "too many tools");
        if (err instanceof RequestError) return fail(c, 400, "invalid_request", err.message);
        throw err;
      }

      const allowance = await allowanceFor(pool, userId, deps.defaultAllowance);
      if (allowance <= 0)
        return fail(c, 403, "capability_disabled", "the coach is switched off for you");
      if ((await getUsed(pool, userId, now())) >= allowance)
        return fail(c, 429, "rate_limited", "monthly coach allowance used up");
      if ((running.get(userId) ?? 0) >= maxConcurrent)
        return fail(c, 429, "rate_limited", "too many coach calls at once");

      const params = toUpstream(req, models);
      running.set(userId, (running.get(userId) ?? 0) + 1);
      return streamSSE(c, async (stream) => {
        const mapper = new StreamMapper(req.tier);
        const abort = new AbortController();
        stream.onAbort(() => abort.abort());
        const send = (ev: CoachEvent) => stream.writeSSE({ data: JSON.stringify(ev) });
        let sentTool = false;
        try {
          for await (const raw of upstream(params, abort.signal)) {
            for (const ev of mapper.push(raw)) {
              if (ev.type === "tool_call") sentTool = true;
              await send(ev);
              if (ev.type === "error") return;
            }
          }
          // A tool call ends the turn on its own; the page sends the next request.
          if (!sentTool) await send(mapper.finish(false));
        } catch (err) {
          if (abort.signal.aborted) return;
          const status = err instanceof UpstreamError ? err.status : 0;
          // Name and status only: never the request or the answer.
          console.error("coach upstream failed:", status);
          await send({ type: "error", ...mapUpstreamError(status) }).catch(() => undefined);
        } finally {
          abort.abort();
          running.set(userId, (running.get(userId) ?? 1) - 1);
          await addUsage(pool, userId, mapper.tokens, now()).catch(() =>
            console.error("coach usage not recorded"),
          );
        }
      });
    },
  );

  return coach as unknown as Hono;
}
