import { describe, expect, it } from "vitest";
import {
  authMessage,
  changePassword,
  changePasswordMessage,
  login,
  signup,
} from "../../src/web/auth";
import { inviteFromHash } from "../../src/web/route";
import { createWebPlatform, onSignedOut, webDb } from "../../src/platform/web";
import { errorFromResponse } from "../../src/platform/web-http";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("invite links", () => {
  it("reads the token from the hash", () => {
    expect(inviteFromHash("#/invite/abcDEF123_-xyz")).toBe("abcDEF123_-xyz");
    expect(inviteFromHash("#/invite/abcDEF123_-xyz/")).toBe("abcDEF123_-xyz");
  });
  it("ignores everything else", () => {
    for (const h of [
      "",
      "#/invite/",
      "#/invite/short",
      "#/other/abcdefgh12",
      "#/invite/a b c d e f g h",
    ])
      expect(inviteFromHash(h)).toBeNull();
  });
});

describe("lost session", () => {
  it("reloads once when the server says the session ended, not for sign-in calls", async () => {
    let reloads = 0;
    onSignedOut(() => (reloads += 1));
    const gone = (async () =>
      jsonRes({ error: { code: "unauthenticated" } }, 401)) as unknown as typeof fetch;
    await expect(webDb(gone).doc("a/b").get()).rejects.toMatchObject({ code: "not_granted" });
    await expect(webDb(gone).doc("a/b").get()).rejects.toMatchObject({ code: "not_granted" });
    expect(reloads).toBe(1);
    onSignedOut(() => (reloads += 1));
    await login("a@b.co", "pw", gone);
    expect(reloads).toBe(1);
  });
});

describe("change password", () => {
  it("says what the player can do", () => {
    expect(changePasswordMessage(403)).toContain("current password");
    expect(changePasswordMessage(429)).toContain("15 minutes");
    expect(changePasswordMessage(400)).toContain("10 to 200");
    expect(changePasswordMessage(401)).toContain("signed out");
    expect(changePasswordMessage(500)).toContain("Try again");
  });
  it("posts both passwords and reports the result", async () => {
    let body = "";
    const ok = (async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    expect(await changePassword("old pass word", "new pass word", ok)).toEqual({ ok: true });
    expect(JSON.parse(body)).toEqual({ current: "old pass word", password: "new pass word" });
    const bad = (async () => jsonRes({}, 403)) as unknown as typeof fetch;
    expect(await changePassword("a", "b", bad)).toMatchObject({ ok: false });
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await changePassword("a", "b", down)).toMatchObject({
      ok: false,
      message: expect.stringContaining("reach"),
    });
  });
});

describe("sign-in messages", () => {
  it("says what the player can do", () => {
    expect(authMessage("login", 401)).toContain("isn't right");
    expect(authMessage("login", 429)).toContain("15 minutes");
    expect(authMessage("signup", 400)).toContain("invite");
    expect(authMessage("login", 500)).toContain("Reload");
  });
  it("login and signup return the session or the message", async () => {
    const ok = async () => jsonRes({ userId: "u1", email: "a@b.co" });
    expect(await login("a@b.co", "pw", ok as unknown as typeof fetch)).toEqual({
      ok: true,
      session: { userId: "u1", email: "a@b.co" },
    });
    const bad = async () => jsonRes({ error: { code: "unauthenticated" } }, 401);
    expect(await signup("tok", "a@b.co", "pw", bad as unknown as typeof fetch)).toMatchObject({
      ok: false,
    });
    const down = async () => {
      throw new TypeError("offline");
    };
    expect(await login("a", "b", down as unknown as typeof fetch)).toMatchObject({ ok: false });
  });
});

describe("server errors", () => {
  it("maps a signed-out answer onto the page's code", async () => {
    const res = jsonRes({ error: { code: "unauthenticated", message: "sign in first" } }, 401);
    expect(await errorFromResponse(res, {})).toEqual({
      code: "not_granted",
      message: "sign in first",
    });
    expect(await errorFromResponse(new Response("<html>", { status: 502 }), {})).toMatchObject({
      code: "resource_exhausted",
    });
  });
});

describe("web db", () => {
  it("reads, writes and queries with the artifact's shapes", async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body && JSON.parse(String(init.body)),
      });
      if (url.startsWith("/api/db/query")) return jsonRes({ docs: [{ id: "g1", data: { n: 1 } }] });
      if (init.method === "PUT" || init.method === "DELETE")
        return new Response(null, { status: 204 });
      return jsonRes({ exists: true, data: { a: 1 } });
    }) as unknown as typeof fetch;
    const db = webDb(f);
    const snap = await db.doc("data/users/u/current").get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual({ a: 1 });
    expect(snap.id).toBe("current");
    await db.doc("data/users/u/x").set({ b: 2 });
    await db.doc("data/users/u/x").delete();
    const q = await db
      .collection("data/users/u/history/items")
      .where("n", ">", 0)
      .orderBy("n", "desc")
      .limit(5)
      .get();
    expect(q.size).toBe(1);
    expect(q.docs[0]?.data()).toEqual({ n: 1 });
    expect(calls[0]?.url).toBe("/api/db/doc?path=data%2Fusers%2Fu%2Fcurrent");
    expect(calls[1]).toMatchObject({ method: "PUT", body: { data: { b: 2 } } });
    expect(calls[3]?.body).toEqual({
      path: "data/users/u/history/items",
      where: [{ field: "n", op: ">", value: 0 }],
      orderBy: { field: "n", dir: "desc" },
      limit: 5,
    });
  });

  it("maps failures onto the codes the page handles", async () => {
    const f = (async () =>
      jsonRes({ error: { code: "not_granted", message: "no" } }, 403)) as unknown as typeof fetch;
    await expect(webDb(f).doc("a/b").get()).rejects.toMatchObject({ code: "not_granted" });
    const bad = (async () => new Response("", { status: 413 })) as unknown as typeof fetch;
    await expect(webDb(bad).doc("a/b").set({})).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("web platform", () => {
  it("knows who is signed in", async () => {
    let signedIn = true;
    const f = (async (url: string) => {
      if (!signedIn) return jsonRes({ error: { code: "unauthenticated" } }, 401);
      if (url === "/api/auth/me") return jsonRes({ userId: "u1", email: "a@b.co" });
      return jsonRes({}, 404);
    }) as unknown as typeof fetch;
    const p = createWebPlatform(f);
    expect(p.hasRuntime()).toBe(true);
    expect(await (await p.user())?.id()).toBe("u1");
    signedIn = false;
    expect(await (await p.user())?.id()).toBeNull();
  });
});
