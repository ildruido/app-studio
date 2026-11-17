import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type pg from "pg";
import {
  addSiteUsage,
  addUsage,
  allowanceFor,
  getSiteUsed,
  getUsed,
  periodResetsAt,
  periodStart,
  resetsAt,
  type CapPeriod,
} from "./ledger.js";
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
  type AiEvent,
  type ModelIds,
} from "./mapping.js";
import { UpstreamError, type AiUpstream } from "./upstream.js";
import { rateLimit } from "../web.js";

/** The owner's site-wide cap: AI tokens all visitors together may use per day or month. */
export interface SiteCap {
  tokens: number;
  period: CapPeriod;
  /** Anonymous visitors: AI tokens one address may use per period (null: no per-address limit). */
  perAddressTokens: number | null;
  /** No-login app: visitors who are not signed in may use the AI, within the cap. */
  allowAnonymous: boolean;
}

export interface AiDeps {
  pool: pg.Pool;
  /** Null when the server has no API key: the routes answer `capability_removed`. */
  upstream: AiUpstream | null;
  models: ModelIds;
  defaultAllowance: number;
  /** Calls running at once per person, so parallel clicks can't slip past the allowance check. */
  maxConcurrent?: number;
  /** Requests per person per minute (default 30). */
  maxPerMinute?: number;
  now?: () => Date;
  /** Off (null) unless the owner sets it. Counts everyone's calls, signed in or not. */
  siteCap?: SiteCap | null;
  /** The visitor's address, for the per-address limit and the rate limit of anonymous visitors. */
  clientIp?: (c: Context) => string;
  /** Calls running at once on the whole site while a site cap is on (default 10). */
  maxSiteConcurrent?: number;
}

const MAX_BODY = 256 * 1024;

type Status = 400 | 401 | 403 | 413 | 429 | 503;
const fail = (c: Context, status: Status, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

export function aiRoutes(
  deps: AiDeps,
  resolveUser: (c: Context) => string | null | Promise<string | null>,
): Hono {
  const { pool, upstream, models } = deps;
  const now = deps.now ?? (() => new Date());
  const maxConcurrent = deps.maxConcurrent ?? 2;
  const running = new Map<string, number>();
  const ai = new Hono<{ Variables: { userId: string; anonymous: boolean } }>();
  const cap = deps.siteCap ?? null;
  const clientIp = deps.clientIp ?? (() => "unknown");
  const maxSiteConcurrent = deps.maxSiteConcurrent ?? 10;
  let siteRunning = 0;
  // Per-address tokens for the current period, in this process (one server instance, see STACK.md).
  const perAddress = new Map<string, { starts: string; tokens: number }>();
  const addressUsed = (key: string): number => {
    const h = perAddress.get(key);
    return h && cap && h.starts === periodStart(now(), cap.period) ? h.tokens : 0;
  };
  const addAddressUsage = (key: string, tokens: number) => {
    if (!cap) return;
    const starts = periodStart(now(), cap.period);
    if (perAddress.size > 10_000)
      for (const [k, h] of perAddress) if (h.starts !== starts) perAddress.delete(k);
    perAddress.set(key, { starts, tokens: addressUsed(key) + tokens });
  };
  const periodWord = cap?.period === "day" ? "today" : "this month";

  ai.use("*", async (c, next) => {
    const userId = await resolveUser(c);
    if (userId) {
      c.set("userId", userId);
      c.set("anonymous", false);
    } else if (cap?.allowAnonymous) {
      c.set("userId", `anon:${clientIp(c)}`);
      c.set("anonymous", true);
    } else return fail(c, 401, "not_granted", "sign in first");
    await next();
  });

  // Starting calls is also capped per minute, on top of the monthly allowance and two at once.
  ai.use(
    "*",
    rateLimit({
      max: deps.maxPerMinute ?? 30,
      windowMs: 60_000,
      key: (c) => `ai:${String(c.get("userId"))}`,
    }),
  );

  ai.get("/limits", (c) =>
    c.json({ maxPromptBytes: MAX_PROMPT_BYTES, tools: { maxCount: MAX_TOOLS } }),
  );

  ai.get("/usage", async (c) => {
    const userId = c.get("userId");
    // Anonymous visitors have no allowance of their own: they see the site-wide figures.
    if (c.get("anonymous") && cap) {
      const used = await getSiteUsed(pool, cap.period, now());
      const addressFull =
        cap.perAddressTokens !== null && addressUsed(userId) >= cap.perAddressTokens;
      return c.json({
        usedTokens: used,
        allowanceTokens: cap.tokens,
        resetsAt: periodResetsAt(now(), cap.period),
        capReached: used >= cap.tokens || addressFull,
      });
    }
    const [used, allowance] = await Promise.all([
      getUsed(pool, userId, now()),
      allowanceFor(pool, userId, deps.defaultAllowance),
    ]);
    const base = { usedTokens: used, allowanceTokens: allowance, resetsAt: resetsAt(now()) };
    if (!cap) return c.json(base);
    return c.json({
      ...base,
      capReached: (await getSiteUsed(pool, cap.period, now())) >= cap.tokens,
    });
  });

  ai.post(
    "/",
    bodyLimit({
      maxSize: MAX_BODY,
      onError: (c) => fail(c, 413, "prompt_too_large", "request too large"),
    }),
    async (c) => {
      if (!upstream) return fail(c, 503, "capability_removed", "the ai is not set up");
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

      const anonymous = c.get("anonymous");
      if (cap) {
        if ((await getSiteUsed(pool, cap.period, now())) >= cap.tokens)
          return fail(c, 429, "rate_limited", `the site's ai limit is used up ${periodWord}`);
        if (
          anonymous &&
          cap.perAddressTokens !== null &&
          addressUsed(userId) >= cap.perAddressTokens
        )
          return fail(c, 429, "rate_limited", `ai limit for your address used up ${periodWord}`);
        if (siteRunning >= maxSiteConcurrent)
          return fail(c, 429, "rate_limited", "the ai is busy, try again shortly");
      }
      if (!anonymous) {
        const allowance = await allowanceFor(pool, userId, deps.defaultAllowance);
        if (allowance <= 0)
          return fail(c, 403, "capability_disabled", "the ai is switched off for you");
        if ((await getUsed(pool, userId, now())) >= allowance)
          return fail(c, 429, "rate_limited", "monthly ai allowance used up");
      }
      if ((running.get(userId) ?? 0) >= maxConcurrent)
        return fail(c, 429, "rate_limited", "too many ai calls at once");

      const params = toUpstream(req, models);
      running.set(userId, (running.get(userId) ?? 0) + 1);
      siteRunning += 1;
      return streamSSE(c, async (stream) => {
        const mapper = new StreamMapper(req.tier);
        const abort = new AbortController();
        stream.onAbort(() => abort.abort());
        const send = (ev: AiEvent) => stream.writeSSE({ data: JSON.stringify(ev) });
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
          console.error("ai upstream failed:", status);
          await send({ type: "error", ...mapUpstreamError(status) }).catch(() => undefined);
        } finally {
          abort.abort();
          running.set(userId, (running.get(userId) ?? 1) - 1);
          siteRunning -= 1;
          const noted = () => console.error("ai usage not recorded");
          if (!anonymous) await addUsage(pool, userId, mapper.tokens, now()).catch(noted);
          if (cap) {
            if (anonymous) addAddressUsage(userId, mapper.tokens);
            await addSiteUsage(pool, cap.period, mapper.tokens, now()).catch(noted);
          }
        }
      });
    },
  );

  return ai as unknown as Hono;
}
