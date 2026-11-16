#!/usr/bin/env node
// Builds a scratch app from the stack packs and runs what a new app runs first: install, format,
// lint, typecheck, unit tests, both builds, and the server's typecheck and database-free tests.
// Browser tests are left to the trial app (they need Chromium and Postgres).
//   node scripts/packs-smoke.mjs [web artifact]     which packs to add (default: web artifact)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
// The smoke test checks the packs, not the release: it may install a release awaiting its live check.
run("node", [sync, "install", "--app", ".", "--live-check"]);
run("node", [sync, "pack", "add", ...packs, "--app", ".", "--live-check"]);
run("node", [".claude/studio/studio-sync.mjs", "check"]);
run("npm", ["install", "--no-audit", "--no-fund"]);
run("npm", ["run", "format:check"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "typecheck"]);
// The AI and who is signed in are modules: an app without one must not compile code that calls
// it (issues #89 and #88).
const probes = [
  { method: "sample", module: "ai", has: packs.includes("ai") || packs.includes("ai-web") },
  { method: "user", module: "user", has: packs.includes("user") },
];
for (const { method, module, has } of probes) {
  const probe = join(app, "src", `${method}-probe.ts`);
  writeFileSync(probe, `import { getPlatform } from "./platform";\nexport const probe = () => getPlatform().${method}();\n`);
  const tsc = spawnSync("npx", ["tsc", "--noEmit"], { cwd: app, encoding: "utf8" });
  rmSync(probe);
  const refused = tsc.status !== 0 && new RegExp(`Property '${method}' does not exist`).test(tsc.stdout);
  if (has ? tsc.status !== 0 : !refused) {
    console.error(tsc.stdout, tsc.stderr);
    console.error(`FAILED: a ${method}() call ${has ? "does not compile with" : "compiles without"} the ${module} module`);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  console.log(`A ${method}() call ${has ? "compiles with" : "is refused without"} the ${module} module.`);
}
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
