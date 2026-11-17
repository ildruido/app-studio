import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import type { AiUpstream } from "../src/ai/upstream.js";
import { aiModule } from "../src/modules/ai.js";
import type { SiteCap } from "../src/ai/routes.js";

const url = process.env.TEST_DATABASE_URL;
const schema = `t_${Math.random().toString(36).slice(2, 10)}`;

const textRun = (input: number, output: number) =>
  async function* () {
    yield { type: "message_start", message: { usage: { input_tokens: input, output_tokens: 1 } } };
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } };
    yield {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: output },
    };
    yield { type: "message_stop" };
  };

describe.skipIf(!url)("ai site-wide cap", () => {
  let pool: pg.Pool;
  let calls = 0;
  let user: string | null = null;
  let ip = "1.1.1.1";
  let clock = new Date("2026-10-11T12:00:00Z");

  const upstream: AiUpstream = () => {
    calls++;
    return textRun(20, 5)();
  };
  const appWith = (siteCap: SiteCap | null) =>
    createApp({
      pool,
      version: "1",
      resolveUser: () => user,
      clientIp: () => ip,
      modules: [
        aiModule({
          pool,
          upstream,
          models: { quick: "h", default: "s" },
          defaultAllowance: 100000,
          now: () => clock,
          siteCap,
          clientIp: () => ip,
        }),
      ],
    });
  const post = (app: ReturnType<typeof createApp>) =>
    app.request("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: "hi" }),
    });
  const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await migrate(pool);
  });
  afterAll(async () => {
    await pool.end();
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it("still refuses anonymous visitors when no cap is set", async () => {
    const app = appWith(null);
    expect((await post(app)).status).toBe(401);
    // A cap alone is not enough: the app must also allow visitors without sign-in.
    const closed = appWith({
      tokens: 100,
      period: "day",
      perAddressTokens: null,
      allowAnonymous: false,
    });
    expect((await post(closed)).status).toBe(401);
    expect(calls).toBe(0);
  });

  it("serves anonymous visitors until the site cap is used up, then refuses before calling", async () => {
    const app = appWith({
      tokens: 50,
      period: "day",
      perAddressTokens: null,
      allowAnonymous: true,
    });
    ip = "2.2.2.2";
    for (const n of [1, 2, 3]) {
      const r = await post(app);
      expect(r.status, `call ${n}`).toBe(n < 3 ? 200 : 429);
      await r.text();
    }
    // 25 tokens a call: two calls reach 50, the third is refused without reaching the AI.
    expect(calls).toBe(2);
    const r = await app.request("/api/ai/usage");
    expect(await r.json()).toEqual({
      usedTokens: 50,
      allowanceTokens: 50,
      resetsAt: "2026-10-12T00:00:00.000Z",
      capReached: true,
    });
    // Someone else from another address is refused too: the cap is for the whole site.
    ip = "3.3.3.3";
    const other = await post(app);
    expect(other.status).toBe(429);
    expect(await code(other)).toBe("rate_limited");
  });

  it("starts a new day at zero", async () => {
    const app = appWith({
      tokens: 50,
      period: "day",
      perAddressTokens: null,
      allowAnonymous: true,
    });
    clock = new Date("2026-10-12T00:00:01Z");
    const r = await post(app);
    expect(r.status).toBe(200);
    await r.text();
    clock = new Date("2026-10-11T12:00:00Z");
  });

  it("stops one address at its own limit while others still get the AI", async () => {
    clock = new Date("2026-10-20T12:00:00Z");
    const app = appWith({
      tokens: 1000,
      period: "day",
      perAddressTokens: 25,
      allowAnonymous: true,
    });
    ip = "4.4.4.4";
    const first = await post(app);
    await first.text();
    expect(first.status).toBe(200);
    const second = await post(app);
    expect(second.status).toBe(429);
    expect(
      ((await (await app.request("/api/ai/usage")).json()) as { capReached: boolean }).capReached,
    ).toBe(true);
    ip = "5.5.5.5";
    const other = await post(app);
    await other.text();
    expect(other.status).toBe(200);
  });

  it("counts signed-in people against the site cap too", async () => {
    clock = new Date("2026-10-25T12:00:00Z");
    const app = appWith({
      tokens: 25,
      period: "month",
      perAddressTokens: null,
      allowAnonymous: false,
    });
    user = "u1";
    const r = await post(app);
    await r.text();
    expect(r.status).toBe(200);
    expect((await post(app)).status).toBe(429);
    const usage = (await (await app.request("/api/ai/usage")).json()) as Record<string, unknown>;
    expect(usage.capReached).toBe(true);
    expect(usage.allowanceTokens).toBe(100000);
    user = null;
  });

  it("limits calls running at once on the whole site", async () => {
    clock = new Date("2026-11-02T12:00:00Z");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: AiUpstream = async function* () {
      await gate;
      yield* textRun(1, 1)();
    };
    const app = createApp({
      pool,
      version: "1",
      resolveUser: () => null,
      modules: [
        aiModule({
          pool,
          upstream: slow,
          models: { quick: "h", default: "s" },
          defaultAllowance: 1,
          now: () => clock,
          siteCap: { tokens: 1000, period: "day", perAddressTokens: null, allowAnonymous: true },
          clientIp: () => ip,
          maxSiteConcurrent: 1,
        }),
      ],
    });
    ip = "6.6.6.6";
    const running = post(app);
    await new Promise((r) => setTimeout(r, 50));
    ip = "7.7.7.7";
    expect((await post(app)).status).toBe(429);
    release();
    await (await running).text();
  });
});
