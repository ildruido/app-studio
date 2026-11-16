import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { run } from "../src/admin.js";
import { createApp } from "../src/app.js";
import { loadModules, moduleFiles, type ServerModule } from "../src/module-loader.js";

const pool = {} as pg.Pool;

async function folder(files: Record<string, string>): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), "mods-"));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return new URL(`${pathToFileURL(dir).href}/`);
}

const hello = `export default () => ({ name: "hello" });`;

describe("module loader", () => {
  it("finds no modules in a missing or empty folder", async () => {
    expect(moduleFiles(new URL("file:///nonexistent/modules/"))).toEqual([]);
    expect(await loadModules({ pool, env: {} }, await folder({}))).toEqual([]);
  });

  it("loads module files in name order and skips type files and tests", async () => {
    const dir = await folder({
      "zeta.js": `export default () => ({ name: "zeta" });`,
      "alpha.js": `export default async () => ({ name: "alpha" });`,
      "alpha.d.ts": "export {};",
      "alpha.test.js": "throw new Error('never loaded');",
      "notes.md": "text",
    });
    expect(moduleFiles(dir)).toEqual(["alpha.js", "zeta.js"]);
    expect((await loadModules({ pool, env: {} }, dir)).map((m) => m.name)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("hands each module its pool, the environment and its own override", async () => {
    const dir = await folder({
      "echo.js": `export default ({ env, override }) => ({ name: "echo", seen: [env.X, override.y] });`,
    });
    const [m] = await loadModules({ pool, env: { X: "1" }, overrides: { echo: { y: 2 } } }, dir);
    expect((m as unknown as { seen: unknown[] }).seen).toEqual(["1", 2]);
  });

  it("refuses a file that is not a module or has the wrong name", async () => {
    await expect(
      loadModules({ pool, env: {} }, await folder({ "bad.js": "export const x = 1;" })),
    ).rejects.toThrow(/module factory/);
    await expect(
      loadModules({ pool, env: {} }, await folder({ "other.js": hello })),
    ).rejects.toThrow(/must be "other"/);
  });
});

describe("what a module adds", () => {
  const mod: ServerModule = {
    name: "demo",
    routes: (resolveUser) => {
      const r = new Hono();
      r.get("/who", async (c) => c.json({ user: await resolveUser(c) }));
      return r;
    },
    admin: { ping: { usage: "ping  answers pong", run: async (args) => `pong ${args.join(" ")}` } },
  };

  it("mounts routes at /api/<name>, and nothing at all without modules", async () => {
    const deps = { pool, version: "1", resolveUser: () => "u1" };
    const withMod = createApp({ ...deps, modules: [mod] });
    expect(await (await withMod.request("/api/demo/who")).json()).toEqual({ user: "u1" });
    expect((await createApp(deps).request("/api/demo/who")).status).toBe(400);
  });

  it("adds admin commands to the core ones, and lists them in the help", async () => {
    expect(await run(["ping", "a", "b"], pool, "", [mod])).toBe("pong a b");
    const help = await run([], pool, "", [mod]);
    expect(help).toMatch(/invite/);
    expect(help).toMatch(/ping {2}answers pong/);
    expect(await run(["ping"], pool, "")).not.toMatch(/pong/);
    expect(await run(["constructor"], pool, "", [mod])).toMatch(/invite/);
  });
});
