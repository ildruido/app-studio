// The three sign-in modes (SIGN_IN_MODE): invite (today's), open sign-up and no login.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/admin.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/db.js";
import { buildApp } from "../src/wire.js";

const url = process.env.TEST_DATABASE_URL;
const PW = "correct horse battery";

describe("SIGN_IN_MODE", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("is invite when absent, so existing apps see no change", () => {
    expect(loadConfig(base, "1").signIn).toBe("invite");
    expect(loadConfig({ ...base, SIGN_IN_MODE: "" }, "1").signIn).toBe("invite");
  });
  it("takes open and none", () => {
    expect(loadConfig({ ...base, SIGN_IN_MODE: "open" }, "1").signIn).toBe("open");
    expect(loadConfig({ ...base, SIGN_IN_MODE: "none" }, "1").signIn).toBe("none");
  });
  it("stops the server on an unknown mode", () => {
    expect(() => loadConfig({ ...base, SIGN_IN_MODE: "public" }, "1")).toThrow(/SIGN_IN_MODE/);
  });
  it("refuses a stand-in user or test account with no login", () => {
    const none = { ...base, SIGN_IN_MODE: "none" };
    expect(() => loadConfig({ ...none, AUTH_TEST_USER_ID: "u1" }, "1")).toThrow(/need sign-in/);
    expect(() => loadConfig({ ...none, TEST_ACCOUNT_PASSWORD: PW }, "1")).toThrow(/need sign-in/);
  });
});

describe.skipIf(!url)("sign-in modes against the database", () => {
  const schema = `t_${Math.random().toString(36).slice(2, 10)}`;
  let pool: pg.Pool;
  let addr = "1.1.1.1";

  /** The whole server for one mode; requests carry the address in X-Forwarded-For. */
  const server = (mode: string) => {
    const config = loadConfig(
      { DATABASE_URL: url, SIGN_IN_MODE: mode, TRUST_PROXY: "1", COOKIE_SECURE: "0" },
      "1",
    );
    const app = buildApp(pool, config);
    const call = (path: string, init: RequestInit = {}, cookie?: string) =>
      app.request(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          host: "x.test",
          "x-forwarded-for": addr,
          ...(cookie && { cookie: `{{slug}}-session=${cookie}` }),
        },
      });
    const post = (path: string, body: unknown, cookie?: string) =>
      call(path, { method: "POST", body: JSON.stringify(body) }, cookie);
    const put = (path: string, data: unknown, cookie?: string) =>
      call(`/api/db/doc?path=${path}`, { method: "PUT", body: JSON.stringify({ data }) }, cookie);
    return { call, post, put };
  };
  const cookieOf = (r: Response) =>
    /{{slug}}-session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];

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

  it("health says which mode the server runs in", async () => {
    for (const mode of ["invite", "open", "none"]) {
      const r = await server(mode).call("/api/health");
      expect(await r.json()).toMatchObject({ ok: true, signIn: mode });
    }
  });

  describe("invite", () => {
    it("a visitor without an account can't sign up without an invite or reach any document", async () => {
      const s = server("invite");
      addr = "10.0.0.1";
      const r = await s.post("/api/auth/signup", { email: "x@example.com", password: PW });
      expect(r.status).toBe(400);
      expect((await s.call("/api/db/doc?path=shared/notice")).status).toBe(401);
    });
  });

  describe("open", () => {
    it("anyone signs up without an invite, lands signed in and reaches their own documents", async () => {
      const s = server("open");
      addr = "10.0.1.1";
      const r = await s.post("/api/auth/signup", { email: "Open@Example.com", password: PW });
      expect(r.status).toBe(200);
      const { userId } = (await r.json()) as { userId: string };
      const token = cookieOf(r)!;
      expect((await s.put(`data/users/${userId}/current`, { a: 1 }, token)).status).toBe(204);
      expect((await s.put(`shared/board`, { a: 1 }, token)).status).toBe(204);
      expect((await s.call("/api/auth/me", {}, token)).status).toBe(200);
    });

    it("a visitor without an account still can't reach documents", async () => {
      const s = server("open");
      expect((await s.call("/api/db/doc?path=shared/board")).status).toBe(401);
    });

    it("refuses a second account with the same email", async () => {
      const s = server("open");
      addr = "10.0.1.2";
      const r = await s.post("/api/auth/signup", { email: "open@example.com", password: PW });
      expect(r.status).toBe(400);
    });

    it("limits new accounts to 5 an hour per address, then other addresses still sign up", async () => {
      const s = server("open");
      addr = "10.0.1.3";
      for (let i = 0; i < 5; i++) {
        const r = await s.post("/api/auth/signup", {
          email: `burst${i}@example.com`,
          password: PW,
        });
        expect(r.status).toBe(200);
      }
      const sixth = await s.post("/api/auth/signup", { email: "burst5@example.com", password: PW });
      expect(sixth.status).toBe(429);
      addr = "10.0.1.4";
      const other = await s.post("/api/auth/signup", { email: "burst6@example.com", password: PW });
      expect(other.status).toBe(200);
    });

    it("the admin command disables an account: sessions end, sign-in is refused, and it can be enabled again", async () => {
      const s = server("open");
      addr = "10.0.1.5";
      const r = await s.post("/api/auth/signup", { email: "spam@example.com", password: PW });
      const token = cookieOf(r)!;
      expect(await run(["disable-user", "spam@example.com"], pool, "http://x", [], "open")).toMatch(
        /Disabled/,
      );
      expect((await s.call("/api/auth/me", {}, token)).status).toBe(401);
      const login = await s.post("/api/auth/login", { email: "spam@example.com", password: PW });
      expect(login.status).toBe(403);
      const wrong = await s.post("/api/auth/login", {
        email: "spam@example.com",
        password: "wrong password!",
      });
      expect(wrong.status).toBe(401); // a wrong password never tells that the account is disabled
      expect(await run(["list-users"], pool, "http://x", [], "open")).toMatch(
        /spam@example\.com {2}\(disabled\)/,
      );
      await run(["enable-user", "spam@example.com"], pool, "http://x", [], "open");
      expect(
        (await s.post("/api/auth/login", { email: "spam@example.com", password: PW })).status,
      ).toBe(200);
      await expect(run(["disable-user", "nobody@example.com"], pool, "http://x")).rejects.toThrow(
        /no account/,
      );
    });
  });

  describe("none", () => {
    it("has no sign-in routes", async () => {
      const s = server("none");
      addr = "10.0.2.1";
      expect(
        (await s.post("/api/auth/signup", { email: "n@example.com", password: PW })).status,
      ).toBe(400);
      expect((await s.call("/api/auth/me")).status).toBe(400);
    });

    it("every visitor reads and writes shared documents with no account", async () => {
      const s = server("none");
      addr = "10.0.2.2";
      expect((await s.put("shared/guestbook-e1", { text: "hi" })).status).toBe(204);
      const r = await s.call("/api/db/doc?path=shared/guestbook-e1");
      expect(await r.json()).toEqual({ exists: true, data: { text: "hi" } });
    });

    it("refuses per-person paths, even with a session cookie from another mode", async () => {
      const open = server("open");
      addr = "10.0.2.3";
      const r = await open.post("/api/auth/signup", { email: "carry@example.com", password: PW });
      const { userId } = (await r.json()) as { userId: string };
      const token = cookieOf(r)!;
      const s = server("none");
      const refused = await s.put(`data/users/${userId}/current`, { a: 1 }, token);
      expect(refused.status).toBe(403);
      expect(((await refused.json()) as { error: { message: string } }).error.message).toMatch(
        /no sign-in/,
      );
      expect((await s.call(`/api/db/doc?path=data/users/${userId}/current`)).status).toBe(403);
    });

    it("limits document requests per address", async () => {
      const s = server("none");
      addr = "10.0.2.4";
      let last = 0;
      for (let i = 0; i < 601; i++) last = (await s.call("/api/db/doc?path=shared/x")).status;
      expect(last).toBe(429);
      addr = "10.0.2.5";
      expect((await s.call("/api/db/doc?path=shared/x")).status).toBe(200);
    });

    it("the admin command has no account commands", async () => {
      await expect(run(["invite"], pool, "http://x", [], "none")).rejects.toThrow(/no accounts/);
      await expect(run(["list-users"], pool, "http://x", [], "none")).rejects.toThrow(
        /no accounts/,
      );
    });
  });
});
