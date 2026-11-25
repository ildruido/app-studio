// Run: node --test scripts/live-check.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkoutStudio, freeLock, judge, judgeRule, loadCatalog, makeRequest, makeResult, parseRequest, readResult, resetApp, takeLock } from "./live-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const studio = join(here, "..");
const catalog = loadCatalog(studio);
const req = { id: "lc-1", branch: "claude/x", commit: "abc1234", where: "branch", scenarios: ["sync-and-idempotent", "backlog-lifecycle"] };

test("a request round-trips through its fixed format, even wrapped in other review text", () => {
  const r = makeRequest(req, catalog);
  assert.ok(r.ok, r.problems);
  const p = parseRequest(`Please run this.\n\n${r.text}\n\nthanks`, catalog);
  assert.deepEqual(p.request, req);
});

test("a request refuses unknown scenarios, a wrong where, bad ids and odd commits", () => {
  const bad = (o) => makeRequest({ ...req, ...o }, catalog);
  assert.match(bad({ scenarios: ["nope"] }).problems.join(), /unknown scenario/);
  assert.match(bad({ scenarios: ["sync-report-once"] }).problems.join(), /is a main scenario/);
  assert.match(bad({ where: "main" }).problems.join(), /branch main/);
  assert.match(bad({ id: "x" }).problems.join(), /id must/);
  assert.match(bad({ commit: "HEAD; rm -rf" }).problems.join(), /commit must/);
  assert.match(bad({ scenarios: [] }).problems.join(), /at least one/);
  assert.match(bad({ scenarios: ["backlog-lifecycle", "backlog-lifecycle"] }).problems.join(), /twice/);
  assert.equal(parseRequest("hello", catalog).ok, false);
  assert.ok(makeRequest({ ...req, where: "main", branch: "main", scenarios: ["sync-report-once"] }, catalog).ok);
});

test("rules: output, pr-state, check and file; missing evidence is a fail, never a pass", () => {
  const j = (rule, ctx) => judgeRule(rule, { readFile: () => undefined, ...ctx }).ok;
  assert.equal(j({ type: "output", matches: "already in step" }, { output: "it is already in step" }), true);
  assert.equal(j({ type: "output", matches: "already in step" }, { output: "changed" }), false);
  assert.equal(j({ type: "output", matches: "x" }, {}), false);
  assert.equal(j({ type: "pr-state", state: "merged" }, { facts: { pr: "merged" } }), true);
  assert.equal(j({ type: "pr-state", state: "merged" }, { facts: { pr: "open" } }), false);
  assert.equal(j({ type: "pr-state", state: "merged" }, {}), false);
  assert.equal(j({ type: "check", name: "check", conclusion: "success" }, { facts: { checks: { check: "success" } } }), true);
  assert.equal(j({ type: "check", name: "check", conclusion: "success" }, { facts: { checks: { check: "failure" } } }), false);
  assert.equal(j({ type: "check", name: "check", conclusion: "success" }, {}), false);
  const f = (rule, files, readFile) => j(rule, { facts: { files }, readFile });
  assert.equal(f({ type: "file", path: "a", exists: false }, { a: null }), true);
  assert.equal(f({ type: "file", path: "a", exists: false }, { a: "x" }), false);
  assert.equal(f({ type: "file", path: "a", contains: "ver" }, { a: "version" }), true);
  assert.equal(f({ type: "file", path: "a", contains: "ver" }, { a: null }), false);
  assert.equal(f({ type: "file", path: "a", exists: true }, {}, () => undefined), false, "no evidence");
  assert.equal(f({ type: "file", path: "a", exists: true }, {}, () => "here"), true, "read from the app dir");
});

test("judge gives one verdict per scenario, with the first failing reason", () => {
  const ok = "RESULT sync-and-idempotent: PASS\nalready in step\nhealthy";
  const v = judge(req, catalog, { outputs: { "sync-and-idempotent": ok, "backlog-lifecycle": "RESULT backlog-lifecycle: PASS" } });
  assert.equal(v["sync-and-idempotent"].pass, true);
  assert.equal(v["backlog-lifecycle"].pass, false, "the second rule has no matching output");
  assert.match(v["backlog-lifecycle"].reason, /does not match/);
  const none = judge(req, catalog, {});
  assert.match(none["sync-and-idempotent"].reason, /no output/);
});

test("the result message: pass, fail, and a run that never started or timed out", () => {
  const pass = makeResult(req, { verdicts: { "sync-and-idempotent": { pass: true }, "backlog-lifecycle": { pass: true } } });
  assert.match(pass, /verdict: pass/);
  assert.deepEqual(readResult(`${pass}`, "lc-1").pass, true);
  const bad = makeResult(req, { verdicts: { "sync-and-idempotent": { pass: true }, "backlog-lifecycle": { pass: false, reason: "no output" } } });
  assert.match(bad, /backlog-lifecycle: FAIL no output/);
  assert.equal(readResult(bad, "lc-1").pass, false);
  const timeout = makeResult(req, { failed: "timed out after 60 minutes" });
  assert.match(timeout, /verdict: fail\nreason: timed out/);
  assert.equal(readResult(timeout, "lc-1").pass, false);
  assert.equal(readResult(pass, "lc-2").mine, false, "another run's result is ignored");
  assert.equal(readResult("just a comment", "lc-1").mine, false);
});

test("one run at a time: a second run is refused until the first ends or times out", () => {
  const d = mkdtempSync(join(tmpdir(), "lc-"));
  mkdirSync(join(d, ".git"));
  assert.ok(takeLock(d, "lc-1", 1000).ok);
  assert.ok(takeLock(d, "lc-1", 2000).ok, "the same run may retake its lock");
  const busy = takeLock(d, "lc-2", 3000);
  assert.equal(busy.ok, false);
  assert.match(busy.why, /lc-1.*running/);
  assert.ok(takeLock(d, "lc-2", 1000 + 61 * 60000).ok, "a stale lock times out");
  freeLock(d);
  assert.ok(takeLock(d, "lc-3", 4000).ok);
});

test("the app reset refuses any repo that is not studio-scratch", () => {
  const d = mkdtempSync(join(tmpdir(), "lc-app-"));
  spawnSync("git", ["-C", d, "init", "-q"]);
  spawnSync("git", ["-C", d, "remote", "add", "origin", "https://github.com/someone/real-app.git"]);
  const r = resetApp(d);
  assert.equal(r.ok, false);
  assert.match(r.why, /not studio-scratch/);
});

test("command line: request from a release record, prepare dry run, result frees the lock", () => {
  const run = (...a) => spawnSync("node", [join(here, "live-check.mjs"), ...a, "--studio", sd], { encoding: "utf8" });
  const sd = mkdtempSync(join(tmpdir(), "lc-studio-"));
  mkdirSync(join(sd, ".git"));
  mkdirSync(join(sd, "releases"));
  writeFileSync(join(sd, "releases/scenarios.json"), JSON.stringify({ scenarios: catalog }));
  writeFileSync(join(sd, "releases/9.9.9.json"), JSON.stringify({ checks: { branch: ["sync-and-idempotent"], main: [] } }));
  const r = run("request", "--branch", "b", "--commit", "abc1234", "--version", "9.9.9", "--id", "lc-t");
  assert.equal(r.status, 0, r.stderr);
  const f = join(sd, "req.txt");
  writeFileSync(f, r.stdout);
  const p = run("prepare", "--request", f, "--dry-run");
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /### sync-and-idempotent/);
  assert.equal(run("prepare", "--request", f.replace("req", "req"), "--dry-run").status, 0, "same run may prepare again");
  writeFileSync(join(sd, "req2.txt"), r.stdout.replace("lc-t", "lc-other"));
  const busy = run("prepare", "--request", join(sd, "req2.txt"), "--dry-run");
  assert.equal(busy.status, 1);
  assert.match(busy.stderr, /another live check/);
  const res = run("result", "--request", f, "--failed", "never started");
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /verdict: fail/);
  assert.equal(run("prepare", "--request", join(sd, "req2.txt"), "--dry-run").status, 0, "lock freed by the result");
  const none = run("request", "--branch", "b", "--commit", "abc1234", "--version", "9.9.9", "--where", "main");
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no live check to request/);
});

test("the studio checkout moves to the requested commit and refuses a stale request", () => {
  const g = (d, ...a) => spawnSync("git", ["-C", d, ...a], { encoding: "utf8" }).stdout.trim();
  const origin = mkdtempSync(join(tmpdir(), "lc-origin-"));
  g(origin, "init", "-q", "-b", "feat");
  g(origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "one", "-q");
  const first = g(origin, "rev-parse", "HEAD");
  const clone = mkdtempSync(join(tmpdir(), "lc-clone-"));
  spawnSync("git", ["clone", "-q", origin, clone]);
  const ok = checkoutStudio(clone, { branch: "feat", commit: first.slice(0, 9) });
  assert.ok(ok.ok, ok.why);
  assert.equal(g(clone, "rev-parse", "HEAD"), first);
  g(origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "two", "-q");
  const stale = checkoutStudio(clone, { branch: "feat", commit: first.slice(0, 9) });
  assert.equal(stale.ok, false);
  assert.match(stale.why, /stale request/);
  assert.equal(checkoutStudio(clone, { branch: "nope", commit: first }).ok, false);
});

// The first run of a new scenario: the runner's checkout is behind and only the commit under test has it.
test("prepare moves the checkout first, so a scenario that exists only in the commit is found", () => {
  const g = (d, ...a) => spawnSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).stdout.trim();
  const origin = mkdtempSync(join(tmpdir(), "lc-origin-"));
  g(origin, "init", "-q", "-b", "feat");
  mkdirSync(join(origin, "releases"));
  writeFileSync(join(origin, "releases/scenarios.json"), JSON.stringify({ scenarios: catalog }));
  g(origin, "add", "."); g(origin, "commit", "-qm", "one");
  const clone = mkdtempSync(join(tmpdir(), "lc-clone-"));
  spawnSync("git", ["clone", "-q", origin, clone]);
  const fresh = { ...catalog[0], id: "brand-new", prompt: "Do the new thing." };
  writeFileSync(join(origin, "releases/scenarios.json"), JSON.stringify({ scenarios: [...catalog, fresh] }));
  g(origin, "commit", "-qam", "two");
  const sha = g(origin, "rev-parse", "HEAD");
  const f = join(clone, "req.txt");
  writeFileSync(f, `LIVE-CHECK-REQUEST\nid: lc-new\nbranch: feat\ncommit: ${sha}\nwhere: branch\nscenarios: brand-new\n`);
  const r = spawnSync("node", [join(here, "live-check.mjs"), "prepare", "--request", f, "--studio", clone], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /### brand-new[\s\S]*Do the new thing/);
});
