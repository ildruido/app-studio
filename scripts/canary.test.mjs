// Run: node --test scripts/canary.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { judge, logSince, makeApp, nativeLoad } from "./canary.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const STARTUP = "Studio harness loaded from app-studio. No repo here has the harness yet.";
const REFUSAL = "Blocked: nobody changes app-studio from an app Project, whoever approves it.";
const LOG = ["2026-11-27T05:00:00.000Z loader 0.48.1", "2026-11-27T05:00:01.000Z commit exit=0", "2026-11-27T05:00:02.000Z merge exit=2"];

test("a healthy thread passes", () => {
  assert.deepEqual(judge({ startup: STARTUP, merge: REFUSAL, logLines: LOG }), { ok: true, reasons: [] });
});

test("each missing piece of evidence fails with its own reason", () => {
  assert.equal(judge({ startup: "", merge: REFUSAL, logLines: LOG }).reasons.length, 1);
  assert.equal(judge({ startup: STARTUP, merge: REFUSAL, logLines: [] }).reasons.length, 3);
  assert.equal(judge({ startup: `PreToolUse hook error: ${STARTUP}`, merge: `hook error: ${REFUSAL}`, logLines: LOG }).ok, true);
  assert.match(judge({ startup: STARTUP, merge: "merged!", logLines: LOG }).reasons[0], /not refused/);
  assert.match(judge({ startup: STARTUP, merge: REFUSAL, logLines: LOG.slice(0, 2) }).reasons[0], /merge gate/);
});

test("log lines before the start are ignored", () => {
  assert.equal(logSince(LOG.join("\n"), "2026-11-27T05:00:01.000Z").length, 2);
});

test("the throwaway app makes the real merge gate refuse through the loader, and the log shows it", () => {
  const top = mkdtempSync(join(tmpdir(), "canary-"));
  symlinkSync(root, join(top, "app-studio"));
  const app = makeApp(top);
  assert.ok(existsSync(join(app, ".claude/hooks/check.mjs")));
  const log = join(top, "hooks.log");
  const env = { ...process.env, STUDIO_HOOK_LOG: log };
  const hook = (mode, input) => spawnSync(process.execPath, [join(root, "scripts/studio-env.mjs"), "hook", mode, top], { input: JSON.stringify(input), encoding: "utf8", env });
  assert.equal(hook("commit", { tool_input: { command: "ls" } }).status, 0);
  const m = hook("merge", { tool_name: "mcp__github__merge_pull_request", tool_input: { owner: "ildruido", repo: "app-studio", pullNumber: 1 } });
  assert.equal(m.status, 2);
  const run = (args) => spawnSync(process.execPath, [join(root, "scripts/canary.mjs"), ...args], { encoding: "utf8", env });
  const f = (n, t) => (writeFileSync(join(top, n), t), join(top, n));
  writeFileSync(join(top, "mark"), "2000-01-01T00:00:00.000Z");
  const ok = run(["judge", "--top", top, "--mark", join(top, "mark"), "--log", log, "--startup", f("s", STARTUP), "--merge", f("m", m.stderr)]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(existsSync(app), false, "the throwaway app is removed");
  makeApp(top);
  writeFileSync(join(top, "mark"), "2000-01-01T00:00:00.000Z");
  const bad = run(["judge", "--top", top, "--mark", join(top, "mark"), "--log", join(top, "none.log"), "--startup", f("s2", ""), "--merge", f("m2", "ok")]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /CANARY FAILED/);
  // A mistyped evidence path is a usage error and keeps the mark.
  writeFileSync(join(top, "mark"), "2000-01-01T00:00:00.000Z");
  const typo = run(["judge", "--top", top, "--mark", join(top, "mark"), "--log", log, "--startup", join(top, "nope"), "--merge", f("m4", m.stderr)]);
  assert.equal(typo.status, 2);
  assert.ok(existsSync(join(top, "mark")));
  // No start mark (prepare never ran): never judged against old log lines.
  const nomark = run(["judge", "--top", top, "--mark", join(top, "gone"), "--log", log, "--startup", f("s3", STARTUP), "--merge", f("m3", m.stderr)]);
  assert.equal(nomark.status, 1);
  assert.match(nomark.stdout, /prepare. did not run/);
});

test("native load: reports skills a repo ships when the thread lists them without the launcher", () => {
  const repo = mkdtempSync(join(tmpdir(), "native-"));
  mkdirSync(join(repo, ".claude/skills/build-feature"), { recursive: true });
  assert.deepEqual(nativeLoad("release, build-feature", [repo]), ["build-feature"]);
  assert.deepEqual(nativeLoad("release, update-config", [repo]), []);
});
