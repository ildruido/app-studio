// Run: node --test scripts/behaviour-check.test.mjs
// The behaviour check's plumbing (issue #216), with a stand-in for `claude`: it skips cleanly without a key,
// passes when the model behaves, and fails, naming the problem, when it doesn't. No model is called.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "behaviour-check.mjs");
const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
const fake = join(dir, "claude");
writeFileSync(
  fake,
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("0.0.0 (fake)"); process.exit(0); }
const prompt = args[args.indexOf("-p") + 1];
const bad = process.env.FAKE_BAD === "1";
const out = (o) => console.log(JSON.stringify(o));
const tool = (name, input) => out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t" + Math.random(), name, input }] } });
let text = "READY";
if (/READY/.test(prompt) && !bad) {
  fs.writeFileSync("src/total.mjs", "export const total = (a, b) => a + b;\\n");
  tool("Edit", { file_path: process.cwd() + "/src/total.mjs" });
  text = "Fixed total.";
}
if (/reviewer/.test(prompt)) {
  tool("Task", { subagent_type: "reviewer", prompt: "quote the rules" });
  if (bad) tool("Read", { file_path: process.cwd() + "/CLAUDE.md" });
  const md = fs.readFileSync("CLAUDE.md", "utf8");
  text = /ZEBRA-42/.test(md) ? "Prices are always shown in pounds, never euros (rule ZEBRA-42)." : "none";
}
out({ type: "result", result: text, total_cost_usd: 0.01 });
`,
  { mode: 0o755 },
);
const env = (extra) => {
  const e = { ...process.env, CLAUDE_BIN: fake, ...extra };
  delete e.NODE_TEST_CONTEXT;
  return e;
};
const run = (extra, ...names) => spawnSync(process.execPath, [script, ...names], { encoding: "utf8", env: env(extra), timeout: 120_000 });

test("without ANTHROPIC_API_KEY it skips and exits 0", () => {
  const r = run({ ANTHROPIC_API_KEY: "" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /skipped: no ANTHROPIC_API_KEY/);
});

test("passes when Claude fixes the red test and the agent quotes the profile without opening CLAUDE.md", () => {
  const r = run({ ANTHROPIC_API_KEY: "fake" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok {3}stop-hook-failure/);
  assert.match(r.stdout, /ok {3}agent-sees-profile/);
  assert.match(r.stdout, /2\/2 behaviour checks passed/);
});

test("fails and names the problem when Claude ignores the failure or opens CLAUDE.md", () => {
  const r = run({ ANTHROPIC_API_KEY: "fake", FAKE_BAD: "1" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL stop-hook-failure[\s\S]*unit tests still fail/);
  assert.match(r.stdout, /FAIL agent-sees-profile[\s\S]*CLAUDE\.md was opened/);
});

test("an unknown check name is a usage error", () => {
  assert.equal(run({ ANTHROPIC_API_KEY: "fake" }, "nope").status, 2);
});
