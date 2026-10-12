import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import type { CoachUpstream } from "../src/coach/upstream.js";
import { UpstreamError } from "../src/coach/upstream.js";

const url = process.env.TEST_DATABASE_URL;
const schema = `t_${Math.random().toString(36).slice(2, 10)}`;

describe.skipIf(!url)("coach endpoint", () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let user: string | null = "u1";
  let script: () => AsyncGenerator<Record<string, unknown>> = async function* () {};
  const seen: Record<string, unknown>[] = [];
  let calls = 0;
  let clock = new Date("2026-10-11T12:00:00Z");

  const upstream: CoachUpstream = (params) => {
    calls++;
    seen.push(params);
    return script();
  };
  const textRun = (text: string, input = 20, output = 5) =>
    async function* () {
      yield {
        type: "message_start",
        message: { usage: { input_tokens: input, output_tokens: 1 } },
      };
      yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      yield {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: output },
      };
      yield { type: "message_stop" };
    };
  const post = (body: unknown) =>
    app.request("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const events = async (r: Response) =>
    (await r.text())
      .split("\n\n")
      .filter(Boolean)
      .map((b) => JSON.parse(b.replace(/^data: /, "")) as Record<string, unknown>);
  const usage = async () =>
    (await (await app.request("/api/coach/usage")).json()) as Record<string, unknown>;

  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await migrate(pool);
    app = createApp({
      pool,
      version: "1",
      resolveUser: () => user,
      coach: {
        pool,
        upstream,
        models: { quick: "haiku-x", default: "sonnet-x" },
        defaultAllowance: 100,
        now: () => clock,
      },
    });
  });
  afterAll(async () => {
    await pool.end();
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("needs sign-in and reports limits", async () => {
    user = null;
    expect((await post({ messages: "hi" })).status).toBe(401);
    user = "u1";
    expect(await (await app.request("/api/coach/limits")).json()).toEqual({
      maxPromptBytes: 32768,
      tools: { maxCount: 8 },
    });
  });

  it("streams text then done, and records tokens", async () => {
    script = textRun("Hello", 20, 5);
    const r = await post({ messages: "private prompt", modelTier: "quick" });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    expect(await events(r)).toEqual([
      { type: "text", delta: "Hello" },
      { type: "done", truncated: false, modelTierApplied: "quick" },
    ]);
    expect(seen.at(-1)?.model).toBe("haiku-x");
    expect(await usage()).toEqual({
      usedTokens: 25,
      allowanceTokens: 100,
      resetsAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("ends the turn on a tool call and rebuilds it from the echo", async () => {
    script = async function* () {
      yield {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "t1", name: "lookup" },
      };
      yield {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"q":"f"}' },
      };
      yield { type: "content_block_stop" };
      yield {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 3 },
      };
    };
    const tools = [{ name: "lookup", description: "d" }];
    expect(await events(await post({ messages: "q", tools }))).toEqual([
      { type: "tool_call", id: "t1", name: "lookup", input: { q: "f" } },
    ]);
    script = textRun("ok");
    await (
      await post({
        messages: "q",
        tools,
        toolResults: [{ id: "t1", name: "lookup", input: { q: "f" }, output: "answer" }],
      })
    ).text();
    const msgs = seen.at(-1)?.messages as { role: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("refuses before calling upstream once the allowance is used", async () => {
    await pool.query("UPDATE coach_usage SET tokens = 100 WHERE user_id = 'u1'");
    const before = calls;
    const r = await post({ messages: "hi" });
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    expect(calls).toBe(before);
  });

  it("starts a new month at zero", async () => {
    clock = new Date("2026-11-02T00:00:00Z");
    expect((await usage()).usedTokens).toBe(0);
    script = textRun("fresh");
    const r = await post({ messages: "hi" });
    expect(r.status).toBe(200);
    await r.text();
  });

  it("honours a personal allowance, including 0 as off", async () => {
    await pool.query(
      "INSERT INTO users (id, email, password_hash, monthly_allowance) VALUES ('u2','b@x.io','h',0)",
    );
    user = "u2";
    const r = await post({ messages: "hi" });
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      "capability_disabled",
    );
    await pool.query("UPDATE users SET monthly_allowance = 5000 WHERE id = 'u2'");
    expect((await usage()).allowanceTokens).toBe(5000);
    user = "u1";
  });

  it("rejects bad and oversize requests before streaming", async () => {
    expect((await post({ messages: [] })).status).toBe(400);
    expect((await post({ messages: "x".repeat(40_000) })).status).toBe(413);
    const big = await app.request("/api/coach", { method: "POST", body: "x".repeat(300_000) });
    expect(big.status).toBe(413);
  });

  it("sends an error event on upstream failure, logs no prompt text, still records usage", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    script = async function* () {
      yield { type: "message_start", message: { usage: { input_tokens: 7, output_tokens: 0 } } };
      throw new UpstreamError(529);
    };
    const used = Number((await usage()).usedTokens);
    const out = await events(await post({ messages: "SECRET-PROMPT-TEXT" }));
    expect(out).toEqual([
      { type: "error", code: "resource_exhausted", message: "the coach is busy, try again later" },
    ]);
    expect(Number((await usage()).usedTokens)).toBe(used + 7);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET");
    spy.mockRestore();
  });

  it("counts a cut-off stream from its text and reports it", async () => {
    script = async function* () {
      yield { type: "message_start", message: { usage: { input_tokens: 3, output_tokens: 1 } } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "x".repeat(40) } };
    };
    const used = Number((await usage()).usedTokens);
    const out = await events(await post({ messages: "hi" }));
    expect(out.at(-1)).toMatchObject({ type: "error", code: "resource_exhausted" });
    expect(Number((await usage()).usedTokens)).toBe(used + 3 + 10);
  });

  it("limits calls running at once per person", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    script = async function* () {
      await gate;
      yield { type: "message_stop" };
    };
    user = "u3";
    const first = [await post({ messages: "a" }), await post({ messages: "b" })];
    const third = await post({ messages: "c" });
    expect(third.status).toBe(429);
    release();
    await Promise.all(first.map((r) => r.text()));
    script = textRun("ok");
    const again = await post({ messages: "d" });
    expect(again.status).toBe(200);
    await again.text();
    user = "u1";
  });

  it("answers 404 when the coach is not wired in", async () => {
    const bare = createApp({ pool, version: "1", resolveUser: () => "u1" });
    expect((await bare.request("/api/coach", { method: "POST", body: "{}" })).status).toBe(400);
  });
});
