#!/usr/bin/env node
// Builds a scratch app from the stack packs and runs what a new app runs first: install, format,
// lint, typecheck, unit tests, both builds, and the server's typecheck and database-free tests.
// Browser tests are left to the trial app (they need Chromium and Postgres).
//   node scripts/packs-smoke.mjs [web artifact]     which packs to add (default: web artifact)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const studio = join(dirname(fileURLToPath(import.meta.url)), "..");
const packs = process.argv.length > 2 ? process.argv.slice(2) : ["web", "artifact"];
const tmp = mkdtempSync(join(tmpdir(), "packs-smoke-"));
const app = join(tmp, "smoke-app");
mkdirSync(app);
symlinkSync(studio, join(tmp, "app-studio"));

function run(cmd, args, cwd = app) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "1" } });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(" ")}`);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}

const sync = join(studio, "scripts", "studio-sync.mjs");
run("git", ["init", "-q", "."]);
run("node", [sync, "install", "--app", "."]);
run("node", [sync, "pack", "add", ...packs, "--app", "."]);
run("node", [".claude/studio/studio-sync.mjs", "check"]);
run("npm", ["install", "--no-audit", "--no-fund"]);
run("npm", ["run", "format:check"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "typecheck"]);
run("npm", ["test"]);
if (packs.includes("artifact")) run("npm", ["run", "build:artifact"]);
if (packs.includes("web")) {
  run("npm", ["run", "build:web"]);
  const server = join(app, "server");
  run("npm", ["install", "--no-audit", "--no-fund"], server);
  run("npm", ["run", "typecheck"], server);
  run("npm", ["test"], server); // database tests skip themselves without TEST_DATABASE_URL
}
rmSync(tmp, { recursive: true, force: true });
console.log(`Packs (${packs.join(", ")}) build a working app.`);
