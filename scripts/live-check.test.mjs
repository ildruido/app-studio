// Run: node --test scripts/live-check.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { needsGitHub, runScriptScenario, isScript, captureExec, loadExecs, checkoutStudio, freeLock, judge, judgeRule, loadCatalog, makeRequest, makeResult, parseRequest, readResult, resetApp, takeLock, prState, checkResults, fileText, fetchFacts } from "./live-check.mjs";

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
  const logged = loadCatalog(join(dirname(fileURLToPath(import.meta.url)), "..")).find((c) => c.id === "subagent-model-logged").pass.find((r) => r.type === "file");
  assert.equal(f(logged, { [logged.path]: "t subagent qa model=unknown effort=unknown\n" }), false, "an unknown model is no evidence");
  assert.equal(f(logged, { [logged.path]: "t subagent qa model=claude-sonnet-5-5 effort=medium\n" }), true);
  assert.equal(f({ type: "file", path: "a", exists: true }, {}, () => "here"), true, "read from the app dir");
});

test("judge gives one verdict per scenario, with the first failing reason", () => {
  const run = (stdout) => ({ exit: 0, stdout, stderr: "" });
  const execs = { "sync-and-idempotent": { "sync-first": run("x"), "sync-again": run("already in step"), health: run("healthy") }, "backlog-lifecycle": { next: run("") } };
  const v = judge(req, catalog, { execs });
  assert.equal(v["sync-and-idempotent"].pass, true);
  assert.equal(v["backlog-lifecycle"].pass, false, "the add step was never captured");
  assert.match(v["backlog-lifecycle"].reason, /no captured run of step "add"/);
  const none = judge(req, catalog, {});
  assert.match(none["sync-and-idempotent"].reason, /no captured run/);
});

test("exec rules read what code captured; a missing capture is a fail", () => {
  const dir = mkdtempSync(join(tmpdir(), "lc-exec-"));
  const cap = (step, ...argv) => assert.ok(captureExec(dir, "sync-and-idempotent", step, argv).ok);
  cap("again", "node", "-e", "console.log('Sync done: already in step')");
  cap("refuse", "node", "-e", "console.error('refused'); process.exit(3)");
  const execs = loadExecs(dir, "sync-and-idempotent");
  assert.equal(execs.refuse.exit, 3);
  const j = (rule) => judgeRule(rule, { execs }).ok;
  assert.equal(j({ type: "exec", step: "again", matches: "already in step" }), true);
  assert.equal(j({ type: "exec", step: "again", matches: "changed" }), false);
  assert.equal(j({ type: "exec", step: "refuse" }), false, "default exit is 0");
  assert.equal(j({ type: "exec", step: "refuse", exit: "nonzero", matches: "refused" }), true, "stderr counts");
  assert.equal(j({ type: "exec", step: "refuse", exit: 3 }), true);
  assert.equal(j({ type: "exec", step: "refuse", exit: "any" }), true);
  assert.equal(j({ type: "exec-absent", step: "again", matches: "commit" }), true);
  assert.equal(j({ type: "exec-absent", step: "again", matches: "already" }), false);
  assert.equal(j({ type: "exec", step: "never-run" }), false);
  assert.equal(j({ type: "exec-absent", step: "never-run", matches: "x" }), false, "no capture is no evidence");
  assert.equal(captureExec(dir, "s", "Bad Step", ["ls"]).ok, false);
  assert.equal(captureExec(dir, "s", "ok", []).ok, false);
  assert.equal(captureExec(dir, "s", "gone", ["no-such-command-xyz"]).rec.exit, 127);
});

test("the thread's own RESULT line is only a cross-check: disagreement fails the run either way", () => {
  const cat = [{ id: "s1", pass: [{ type: "exec", step: "a", matches: "ok" }] }];
  const r = { scenarios: ["s1"] };
  const good = { s1: { a: { exit: 0, stdout: "ok", stderr: "" } } };
  const badRun = { s1: { a: { exit: 0, stdout: "nope", stderr: "" } } };
  assert.equal(judge(r, cat, { execs: good }).s1.pass, true, "no RESULT line needed");
  assert.equal(judge(r, cat, { execs: good, outputs: { s1: "RESULT s1: PASS" } }).s1.pass, true);
  assert.match(judge(r, cat, { execs: good, outputs: { s1: "RESULT s1: FAIL it broke" } }).s1.reason, /disagreement: code says PASS.*thread says FAIL/);
  assert.match(judge(r, cat, { execs: badRun, outputs: { s1: "RESULT s1: PASS" } }).s1.reason, /disagreement: code says FAIL.*thread says PASS/);
  assert.equal(judge(r, cat, { execs: badRun, outputs: { s1: "RESULT s1: FAIL" } }).s1.pass, false);
});

test("the exec command line saves a capture that judge reads", () => {
  const dir = mkdtempSync(join(tmpdir(), "lc-cli-"));
  const run = (...a) => spawnSync("node", [join(here, "live-check.mjs"), ...a], { encoding: "utf8" });
  const x = run("exec", "--outputs", dir, "--scenario", "demo", "--step", "hello", "--", "node", "-e", "console.log('hi --there')");
  assert.equal(x.status, 0);
  assert.match(x.stdout, /hi --there[\s\S]*captured demo\/hello: exit 0/);
  assert.equal(loadExecs(dir, "demo").hello.stdout.trim(), "hi --there");
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

test("the app reset clears the ignored .claude/state, so an old review result cannot hide a missing one", () => {
  const root = mkdtempSync(join(tmpdir(), "lc-reset-"));
  const g = (cwd, ...a) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" });
  const origin = join(root, "studio-scratch");
  g(root, "init", "-q", "-b", "main", origin);
  writeFileSync(join(origin, ".gitignore"), ".claude/state/\n");
  g(origin, "add", "."); g(origin, "commit", "-qm", "init");
  const app = join(root, "app");
  g(root, "clone", "-q", origin, app);
  g(app, "remote", "set-url", "origin", origin); // the path ends in /studio-scratch
  mkdirSync(join(app, ".claude", "state"), { recursive: true });
  writeFileSync(join(app, ".claude", "state", "review.json"), "{}");
  assert.equal(resetApp(app).ok, true);
  assert.equal(existsSync(join(app, ".claude", "state")), false);
  assert.equal(resetApp(app).ok, true, "a second reset with nothing to clear still works");
});

test("command line: request from a release record, prepare dry run, result frees the lock", () => {
  const run = (...a) => spawnSync("node", [join(here, "live-check.mjs"), ...a, "--studio", sd], { encoding: "utf8" });
  const sd = mkdtempSync(join(tmpdir(), "lc-studio-"));
  mkdirSync(join(sd, ".git"));
  mkdirSync(join(sd, "releases"));
  writeFileSync(join(sd, "releases/scenarios.json"), JSON.stringify({ scenarios: catalog }));
  writeFileSync(join(sd, "releases/9.9.9.json"), JSON.stringify({ checks: { branch: ["backlog-lifecycle"], main: [] } }));
  const r = run("request", "--branch", "b", "--commit", "abc1234", "--version", "9.9.9", "--id", "lc-t");
  assert.equal(r.status, 0, r.stderr);
  const f = join(sd, "req.txt");
  writeFileSync(f, r.stdout);
  const p = run("prepare", "--request", f, "--dry-run");
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /### backlog-lifecycle/);
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
  const fresh = { ...catalog.find((c) => !isScript(c)), id: "brand-new", prompt: "Do the new thing." };
  writeFileSync(join(origin, "releases/scenarios.json"), JSON.stringify({ scenarios: [...catalog, fresh] }));
  g(origin, "commit", "-qam", "two");
  const sha = g(origin, "rev-parse", "HEAD");
  const f = join(clone, "req.txt");
  writeFileSync(f, `LIVE-CHECK-REQUEST\nid: lc-new\nbranch: feat\ncommit: ${sha}\nwhere: branch\nscenarios: brand-new\n`);
  const r = spawnSync("node", [join(here, "live-check.mjs"), "prepare", "--request", f, "--studio", clone], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /### brand-new[\s\S]*Do the new thing/);
});

test("a script scenario's steps run in code, in the app, with placeholders filled, and the judge reads what they printed", () => {
  const dir = mkdtempSync(join(tmpdir(), "lc-script-"));
  const app = mkdtempSync(join(tmpdir(), "lc-app-"));
  const sc = { id: "demo", kind: "script", steps: [
    { step: "first", reset: true, run: "echo in $(basename {app}) && echo studio={studio} >&2" },
    { step: "bad", run: "echo refused; exit 3" },
  ], pass: [{ type: "exec", step: "first", matches: "in lc-app-" }, { type: "exec", step: "bad", exit: 3, matches: "refused" }] };
  let resets = 0;
  const r = runScriptScenario(sc, { app, studio: "/s", outputs: dir, reset: () => (resets++, { ok: true }) });
  assert.ok(r.ok, r.why);
  assert.equal(resets, 1, "only the step that asks for a reset resets");
  const execs = loadExecs(dir, "demo");
  assert.equal(execs.first.exit, 0);
  assert.match(execs.first.stderr, /studio=\/s/);
  assert.equal(execs.bad.exit, 3);
  const v = judge({ scenarios: ["demo"] }, [sc], { execs: { demo: execs } });
  assert.equal(v.demo.pass, true);
  assert.equal(runScriptScenario(sc, { app, studio: "/s", outputs: dir, reset: () => ({ ok: false, why: "not scratch" }) }).ok, false);
});

test("prepare runs script scenarios itself and lists only thread prompts", () => {
  const g = (d, ...a) => spawnSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" }).stdout.trim();
  const origin = mkdtempSync(join(tmpdir(), "lc-o-"));
  g(origin, "init", "-q", "-b", "feat");
  mkdirSync(join(origin, "releases"));
  const cat = [
    { id: "by-code", title: "t", where: "branch", kind: "script", source: "s", steps: [{ step: "hi", run: "echo ran-by-code" }], pass: [{ type: "exec", step: "hi", matches: "ran-by-code" }] },
    { id: "by-thread", title: "t", where: "branch", source: "s", prompt: "Act this out.", pass: [{ type: "output", matches: "x" }], "model-behaviour": "m" },
  ];
  writeFileSync(join(origin, "releases/scenarios.json"), JSON.stringify({ scenarios: cat }));
  g(origin, "add", "."); g(origin, "commit", "-qm", "one");
  const sha = g(origin, "rev-parse", "HEAD");
  const clone = mkdtempSync(join(tmpdir(), "lc-c-"));
  spawnSync("git", ["clone", "-q", origin, clone]);
  const out = mkdtempSync(join(tmpdir(), "lc-out-"));
  const f = join(clone, "req.txt");
  const run = (scen, ...extra) => {
    writeFileSync(f, `LIVE-CHECK-REQUEST\nid: lc-x\nbranch: feat\ncommit: ${sha}\nwhere: branch\nscenarios: ${scen}\n`);
    return spawnSync("node", [join(here, "live-check.mjs"), "prepare", "--request", f, "--studio", clone, ...extra], { encoding: "utf8" });
  };
  // No --app: a script scenario cannot run, and the run says so instead of passing quietly.
  const noApp = run("by-code", "--outputs", out);
  assert.notEqual(noApp.status, 0);
  assert.match(noApp.stderr, /--app/);
  // Dry run: nothing runs, and only the thread prompt is printed.
  const dry = run("by-code,by-thread", "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /### by-thread/);
  assert.doesNotMatch(dry.stdout, /### by-code/);
  assert.equal(isScript(cat[0]), true);
  // A finished prepare marks the run for `next`; a dry run does not.
  assert.ok(!existsSync(join(out, ".prepared")));
  const real = run("by-thread", "--outputs", out);
  assert.equal(real.status, 0, real.stderr);
  assert.match(readFileSync(join(out, ".prepared"), "utf8"), /lc-x/);
});

test("facts by code: PR state, checks and files are parsed from raw API responses", async () => {
  assert.equal(prState({ state: "closed", merged_at: "2026-01-01T00:00:00Z" }), "merged");
  assert.equal(prState({ state: "open" }), "open");
  assert.equal(prState({ state: "closed", merged_at: null }), "closed");
  assert.equal(prState(null), "none");
  const runs = { check_runs: [
    { name: "check", conclusion: "failure", started_at: "2026-01-01T00:00:00Z" },
    { name: "check", conclusion: "success", started_at: "2026-01-02T00:00:00Z" },
    { name: "gate", conclusion: null, status: "in_progress", started_at: "2026-01-01T00:00:00Z" },
  ] };
  assert.deepEqual(checkResults(runs), { check: "success", gate: "in_progress" });
  assert.deepEqual(checkResults(null), {});
  assert.equal(fileText({ type: "file", encoding: "base64", content: Buffer.from("hi").toString("base64") }), "hi");
  assert.equal(fileText(null), null);
  const cat = [
    { id: "s1", pass: [{ type: "pr-state", state: "merged" }, { type: "check", name: "check", conclusion: "success" }, { type: "file", path: "a/b.json", contains: "v" }] },
    { id: "s2", pass: [{ type: "output", matches: "x" }] },
  ];
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith("/repos/o/r/pulls?")) return [{ number: 7, state: "closed", merged_at: "t", merge_commit_sha: "abc", base: { ref: "main" }, head: { sha: "h" } }];
    if (path.includes("/check-runs")) return runs;
    if (path.includes("/contents/a/b.json")) return { type: "file", encoding: "base64", content: Buffer.from("version").toString("base64") };
    throw new Error(`unexpected ${path}`);
  };
  const facts = await fetchFacts({ scenarios: ["s1", "s2"] }, cat, { repo: "o/r", get });
  assert.deepEqual(facts, { s1: { pr: "merged", checks: { check: "success", gate: "in_progress" }, files: { "a/b.json": "version" } } });
  assert.ok(calls.some((c) => c.includes("/commits/abc/check-runs")), "a merged PR's checks come from its merge commit");
  // A missing file is recorded as absent (null); a failing API call throws, never counts as absent.
  const none = await fetchFacts({ scenarios: ["s1"] }, cat, { repo: "o/r", pr: "7", get: async (p) => (p.includes("/pulls/7") ? null : p.includes("contents") ? null : (() => { throw new Error("x"); })()) });
  assert.deepEqual(none, { s1: { pr: "none", checks: {}, files: { "a/b.json": null } } });
  await assert.rejects(fetchFacts({ scenarios: ["s1"] }, cat, { repo: "o/r", get: async () => { throw new Error("GitHub answered 500"); } }), /500/);
  assert.deepEqual(await fetchFacts({ scenarios: ["s2"] }, cat, { repo: "o/r", get: async () => { throw new Error("never"); } }), {}, "nothing to read, no calls");
});

test("next walks a whole run one action at a time, from prepare to posted, and never skips a scenario", () => {
  const sd = mkdtempSync(join(tmpdir(), "lc-next-"));
  mkdirSync(join(sd, ".git"));
  mkdirSync(join(sd, "releases"));
  const cat = [
    { id: "by-thread", title: "t", where: "branch", source: "s", prompt: "Act this out.", pass: [{ type: "output", matches: "ok" }], "model-behaviour": "m" },
    { id: "also-thread", title: "t", where: "branch", source: "s", prompt: "Do the other.", pass: [{ type: "pr-state", state: "merged" }] },
  ];
  writeFileSync(join(sd, "releases/scenarios.json"), JSON.stringify({ scenarios: cat }));
  const out = mkdtempSync(join(tmpdir(), "lc-nout-"));
  const app = mkdtempSync(join(tmpdir(), "lc-napp-"));
  const reqf = join(sd, "req.txt");
  writeFileSync(reqf, "LIVE-CHECK-REQUEST\nid: lc-n\nbranch: feat\ncommit: abc1234\nwhere: branch\nscenarios: by-thread, also-thread\n");
  const next = (...extra) => spawnSync("node", [join(here, "live-check.mjs"), "next", "--request", reqf, "--outputs", out, "--app", app, "--repo", "o/n", "--studio", sd, ...extra], { encoding: "utf8" });
  const say = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout; };

  // Not prepared: the one action is `prepare`.
  assert.match(say(next()), /NEXT \(run\): Run:\n.*prepare --request/);
  // Another run holds the lock: the busy text to post, and no `prepare`, and the other lock stays.
  writeFileSync(join(sd, ".git/live-check-run.json"), JSON.stringify({ id: "lc-other", at: Date.now() }));
  const busy = say(next());
  assert.match(busy, /NEXT \(post\)/);
  assert.match(busy, /reason: runner busy/);
  assert.doesNotMatch(busy, /prepare --request/);
  assert.ok(existsSync(join(sd, ".git/live-check-run.json")), "next never frees another run's lock");
  rmSync(join(sd, ".git/live-check-run.json"));
  // A lock with this run's id only says prepare began: it may have died, so `prepare` is still the next action.
  writeFileSync(join(sd, ".git/live-check-run.json"), JSON.stringify({ id: "lc-n", at: Date.now() }));
  assert.match(say(next()), /NEXT \(run\): Run:\n.*prepare --request/);
  // prepare's last step marks the run.
  writeFileSync(join(out, ".prepared"), JSON.stringify({ id: "lc-n" }));
  // Thread scenarios, in order, each until its text is saved.
  assert.match(say(next()), /Act out scenario by-thread \(2 thread scenarios left\)[\s\S]*Act this out\./);
  writeFileSync(join(out, "by-thread.txt"), "ok\nRESULT by-thread: PASS");
  assert.match(say(next()), /Act out scenario also-thread \(1 thread scenario left\)[\s\S]*Do the other\./);
  writeFileSync(join(out, "also-thread.txt"), "done");
  // A pr-state rule needs facts: the facts command, with the repo.
  assert.match(say(next()), /facts --request .* --repo 'o\/n' --out .*facts\.json/);
  writeFileSync(join(out, "facts.json"), "garbage");
  assert.match(say(next()), /facts --request/, "an unreadable facts file is not facts");
  writeFileSync(join(out, "facts.json"), JSON.stringify({ "also-thread": { pr: "merged" } }));
  assert.match(say(next()), /judge --request .* --facts .*facts\.json' > .*verdicts\.json/);
  // An unreadable verdicts file is not a verdict.
  writeFileSync(join(out, "verdicts.json"), "");
  assert.match(say(next()), /judge --request/);
  writeFileSync(join(out, "verdicts.json"), JSON.stringify({ "by-thread": { pass: true } }));
  assert.match(say(next()), /judge --request/, "a scenario without a verdict is not judged yet");
  writeFileSync(join(out, "verdicts.json"), JSON.stringify({ "by-thread": { pass: true }, "also-thread": { pass: true } }));
  assert.match(say(next()), /result --request .* --verdicts .* > .*result\.txt/);
  const res = spawnSync("node", [join(here, "live-check.mjs"), "result", "--request", reqf, "--verdicts", join(out, "verdicts.json"), "--studio", sd], { encoding: "utf8" });
  rmSync(join(sd, ".git/live-check-run.json"), { force: true }); // `result` freed the lock
  writeFileSync(join(out, "result.txt"), res.stdout);
  const post = say(next());
  assert.match(post, /NEXT \(post\)[\s\S]*LIVE-CHECK-RESULT[\s\S]*verdict: pass/);
  assert.match(post, /--posted/);
  assert.match(say(next()), /NEXT \(post\)/, "until it is marked posted, the action repeats");
  const keep = readFileSync(join(out, "result.txt"), "utf8");
  writeFileSync(join(out, "result.txt"), "");
  assert.equal(next("--posted").status, 2, "an empty result.txt (failed redirect) cannot be marked posted");
  assert.ok(!existsSync(join(out, ".posted")));
  writeFileSync(join(out, "result.txt"), keep);
  assert.match(say(next("--posted")), /^DONE/);
  assert.match(say(next()), /^DONE/);
  // Files of another run are never reused.
  writeFileSync(join(out, ".run"), JSON.stringify({ id: "lc-old" }));
  const other = next();
  assert.equal(other.status, 2);
  assert.match(other.stderr, /new, empty --outputs/);
});

test("a failed prepare or a result frees only its own run's lock", () => {
  const sd = mkdtempSync(join(tmpdir(), "lc-lock-"));
  mkdirSync(join(sd, ".git"));
  takeLock(sd, "lc-other");
  assert.equal(freeLock(sd, "lc-mine"), false);
  assert.ok(existsSync(join(sd, ".git/live-check-run.json")));
  assert.equal(freeLock(sd, "lc-other"), true);
  assert.ok(!existsSync(join(sd, ".git/live-check-run.json")));
});

test("a file rule on an absolute path is read from the runner's disk: no facts are asked for or fetched", async () => {
  assert.equal(needsGitHub({ type: "file", path: "/tmp/studio-hooks.log", contains: "x" }), false);
  assert.equal(needsGitHub({ type: "file", path: ".claude/agents/x.md", contains: "x" }), true);
  assert.equal(needsGitHub({ type: "pr-state", state: "merged" }), true);
  assert.equal(needsGitHub({ type: "exec", step: "a" }), false);
  const cat = [{ id: "abs", title: "t", where: "branch", source: "s", prompt: "p", pass: [{ type: "file", path: "/tmp/studio-hooks.log", contains: "x" }] }];
  const facts = await fetchFacts({ scenarios: ["abs"] }, cat, { repo: "o/n", get: async () => { throw new Error("must not call GitHub"); } });
  assert.deepEqual(facts, {});
});

test("idea-to-first-release passes only on a whole run, stays out of the regression set, and fails when the tag or the empty start is missing", () => {
  const s = catalog.find((c) => c.id === "idea-to-first-release");
  assert.equal(s.where, "main");
  assert.ok(!s.regression);
  const out = {
    "start-state": "README.md\n",
    "discovery-modules": "base\ndiscovery\nresearch\n",
    "discovery-phase": "| Phase | discovery |\n",
    "bootstrap-health": "Harness is healthy\n",
    "decision-list": "D-001 Pick the stack (2026-11-27)\n",
    "phase-build": "build\n",
    "packs-after-build": "artifact\nbase\nresearch\n",
    "feature-merged": "feat: split a bill\nchore: bootstrap harness\n",
    "handoff-lint": "ok\n",
    "release-log": "chore(release): v0.1.0\n",
    "release-tag": "abc\trefs/tags/v0.1.0\n",
  };
  const execs = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { exit: 0, stdout: v, stderr: "" }]));
  const facts = { pr: "merged", checks: { "CI gate": "success" }, files: { "docs/PRD.md": "# PRD", "docs/BACKLOG-DONE.md": "# Done", "CHANGELOG.md": "## [0.1.0] - 2026-11-27", "package.json": '{ "version": "0.1.0" }' } };
  const run = (e, f = facts) => judge({ scenarios: [s.id] }, catalog, { outputs: { [s.id]: "RESULT idea-to-first-release: PASS\nrescues: none" }, execs: { [s.id]: e }, facts: { [s.id]: f } })[s.id];
  assert.deepEqual(run(execs), { pass: true });
  assert.match(run({ ...execs, "release-tag": { exit: 0, stdout: "", stderr: "" } }).reason, /release-tag/);
  assert.match(run({ ...execs, "start-state": { exit: 0, stdout: "README.md\nsrc/x.ts\n", stderr: "" } }).reason, /start-state/);
  assert.match(run({ ...execs, "packs-after-build": { exit: 0, stdout: "discovery\nresearch\n", stderr: "" } }).reason, /discovery/);
});
