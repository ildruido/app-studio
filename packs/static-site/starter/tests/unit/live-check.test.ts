import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const script = resolve("scripts/live-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "live-check-"));
mkdirSync(join(dir, "dist/en"), { recursive: true });
writeFileSync(join(dir, "dist/en/index.html"), "<html><title>My Site</title></html>");

let title = "My Site";
let headers: Record<string, string> = {};
const server: Server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html", ...headers });
  res.end(`<html><title>${title}</title></html>`);
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

// An async spawn keeps this process free to answer the script's request.
const run = (...args: string[]) =>
  new Promise<number | null>((done) => {
    const p = spawn("node", [script, address, ...args], {
      cwd: dir,
      env: { ...process.env, LIVE_CHECK_ATTEMPTS: "2", LIVE_CHECK_DELAY_MS: "10" },
    });
    p.on("close", done);
  });

describe("live check", () => {
  it("passes when the address shows this site", async () => {
    title = "My Site";
    headers = {};
    expect(await run()).toBe(0);
  });

  it("fails when the address shows someone else's site", async () => {
    title = "Another Company";
    expect(await run()).toBe(1);
  });

  it("fails on a public site that sends noindex, but not for a preview", async () => {
    title = "My Site";
    headers = { "x-robots-tag": "noindex, nofollow" };
    expect(await run("--public")).toBe(1);
    expect(await run()).toBe(0);
  });
});
