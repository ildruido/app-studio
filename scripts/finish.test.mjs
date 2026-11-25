// Run: node --test scripts/finish.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { uncoveredFiles } from "./scenario-cover.mjs";
import { argProblem, catalogHash, liveId, buildRecord, checkInputs, ciChecks, decide, FACTS_HELP, conflictSide, continuesRun, kindOf, resolveConflicts, liveResult, nextVersion, prBody, rearm, statusText, versionFree } from "./finish.mjs";
import { join } from "node:path";
import { validateRecord } from "./release.mjs";

const catalog = [{ id: "b1", where: "branch" }, { id: "m1", where: "main" }];
const inputs = { issues: [7], title: "feat(x): a thing", summary: "a thing", notVerified: ["n"], appCreator: ["c"], scenarios: ["b1"], mainScenarios: [] };
const green = { tier: "success", tests: "success", gate: "success", queue: "success", check: "success" };
const base = (over = {}) => {
  const kind = over.kind ?? "app-facing";
  const st = { branch: "b", version: "1.2.3", kind, inputs, pr: 10, prSetup: true, record: buildRecord(inputs, { version: "1.2.3", kind, date: "2026-01-01" }), ...over.st };
  return { st, owner: "o", repo: "r", now: 1e12, tier: "live", tierReasons: [], ownFp: "own1", appFp: "app1", behind: false, collision: false, result: null, record: st.record, facts: { state: "open", merged: false, draft: false, mergeable: true, labels: [], jobs: green, queue: "turn", ...over.facts }, ...over.ctx };
};

test("kind comes from the files, ignoring what finish writes itself", () => {
  assert.equal(kindOf(["docs/GOVERNANCE.md", "releases/1.0.0.json", "CHANGELOG.md", "plugins/studio/.claude-plugin/plugin.json"]), "internal");
  assert.equal(kindOf(["plugins/studio/skills/x/SKILL.md"]), "app-facing");
  assert.equal(kindOf(["scripts/studio-env.mjs"]), "loader");
  assert.equal(kindOf(["scripts/env-setup.sh", "docs/x.md"]), "loader");
});

test("next free version is above everything main has; a taken version is not free", () => {
  assert.equal(nextVersion(["0.41.0", "0.40.0"]), "0.41.1");
  assert.equal(nextVersion(["0.41.0", "0.41.2"], true), "0.42.0");
  assert.equal(versionFree("0.41.1", ["0.41.0"]), true);
  assert.equal(versionFree("0.41.1", ["0.41.0", "0.41.1"]), false);
});

test("inputs: judgement fields are required, scenarios must exist and match where", () => {
  assert.deepEqual(checkInputs(inputs, "app-facing", catalog), []);
  assert.deepEqual(checkInputs({ ...inputs, appCreator: [], scenarios: [] }, "internal", catalog), []);
  const p = checkInputs({ issues: [], title: "a thing", summary: "", notVerified: [], scenarios: ["m1", "zz"] }, "loader", catalog);
  for (const re of [/--issue/, /Conventional/, /--summary/, /--not-verified/, /--app-creator/, /main-scenarios/, /"m1" is a main/, /unknown scenario "zz"/]) assert.ok(p.some((x) => re.test(x)), re);
  assert.ok(checkInputs({ ...inputs, scenarios: [], noBranchCheck: "docs only" }, "app-facing", catalog).length === 0);
});

test("records it builds pass release.mjs validation for every kind", () => {
  for (const [kind, extra] of [["internal", {}], ["app-facing", {}], ["loader", { mainScenarios: ["m1"] }], ["app-facing", { scenarios: [], noBranchCheck: "why" }]]) {
    const r = buildRecord({ ...inputs, ...extra }, { version: "1.2.3", kind, date: "2026-01-01" });
    assert.deepEqual(validateRecord(r, "1.2.3.json"), [], kind);
  }
  assert.equal(buildRecord({ ...inputs, mainScenarios: ["m1"] }, { version: "1.2.3", kind: "loader", date: "2026-01-01" }).status.main, "pending");
});

test("PR body carries attribution, hand-over and Closes lines", () => {
  const st = base().st;
  st.inputs = { ...inputs, prPrefix: "ATTR", prSuffix: "FOOT", what: ["w"] };
  const b = prBody(st);
  assert.ok(b.startsWith("ATTR\n"));
  assert.match(b, /## What wasn't verified\n- n/);
  assert.match(b, /Closes #7/);
  assert.ok(b.endsWith("FOOT"));
});

test("no PR: open it, as a draft only when apps get it", () => {
  const d = decide(base({ st: { pr: null } }));
  assert.equal(d.type, "do");
  assert.match(d.steps[0], /create_pull_request .*"draft":true/);
  assert.match(decide(base({ kind: "internal", st: { pr: null } })).steps[0], /"draft":false/);
});

test("new PR: record it, assign, subscribe and schedule the check-in", () => {
  const d = decide(base({ st: { prSetup: false } }));
  assert.equal(d.local, "record-pr");
  assert.equal(d.steps.length, 4);
  assert.match(d.steps.join("\n"), /subscribe_pr_activity[\s\S]*send_later .*"delay_minutes":3/);
});

test("no facts: say exactly how to collect them", () => {
  assert.equal(decide(base({ ctx: { facts: null } })).type, "facts");
});

test("main moved or took the version: sync by code", () => {
  assert.equal(decide(base({ ctx: { behind: true } })).local, "sync");
  assert.equal(decide(base({ ctx: { collision: true } })).local, "sync");
});

test("red tests are the thread's to fix", () => {
  assert.equal(decide(base({ facts: { jobs: { ...green, tests: "failure" } } })).type, "fix");
});

test("draft app-facing PR: waits for its queue turn, then requests the branch check", () => {
  assert.equal(decide(base({ facts: { draft: true, queue: "wait" } })).type, "wait");
  assert.equal(decide(base({ facts: { draft: true, queue: "none" } })).type, "wait");
  assert.equal(decide(base({ facts: { draft: true } })).local, "branch-request");
});

test("draft: a request for other app-facing changes is redone; a pending one waits, then times out", () => {
  const req = { id: "lc-1", fp: "old", at: 1e12 };
  assert.equal(decide(base({ facts: { draft: true }, st: { request: req } })).local, "branch-request");
  assert.equal(decide(base({ facts: { draft: true }, st: { request: { ...req, fp: "app1" } } })).type, "wait");
  const late = decide(base({ facts: { draft: true }, st: { request: { ...req, fp: "app1" } }, ctx: { now: 1e12 + 66 * 60000 } }));
  assert.equal(late.type, "fix");
  assert.match(late.text, /failed/);
});

test("draft: pass marks it ready, fail is the thread's to fix", () => {
  const st = { request: { id: "lc-1", fp: "app1", at: 1e12 } };
  assert.match(decide(base({ facts: { draft: true }, st, ctx: { result: true } })).steps[0], /update_pull_request .*"draft":false/);
  assert.equal(decide(base({ facts: { draft: true }, st, ctx: { result: false } })).type, "fix");
});

test("draft with no branch check needed, or internal: mark ready", () => {
  const rec = buildRecord({ ...inputs, scenarios: [], noBranchCheck: "why" }, { version: "1.2.3", kind: "app-facing", date: "2026-01-01" });
  assert.match(decide(base({ facts: { draft: true }, st: { record: rec } })).steps[0], /"draft":false/);
  assert.match(decide(base({ kind: "internal", facts: { draft: true } })).steps[0], /"draft":false/);
});

test("ready: CI running waits; a failing gate goes back to draft", () => {
  assert.equal(decide(base({ facts: { jobs: { ...green, check: "pending" } } })).type, "wait");
  assert.match(decide(base({ facts: { jobs: { ...green, gate: "failure", check: "failure" } } })).steps[0], /"draft":true/);
});

test("owner tier: ask once, record the OK, re-add the label when only main or the version moved", () => {
  const owner = { tier: "owner", tierReasons: ["owner: rules changed", "auto: docs/x.md is docs"] };
  const red = { jobs: { ...green, check: "failure" } };
  const ask = decide(base({ ctx: owner, facts: red }));
  assert.equal(ask.type, "ask");
  assert.match(ask.ask, /PR #10 .*owner tier because rules changed\. Reply OK/);
  const readd = decide(base({ ctx: owner, facts: red, st: { ownerOk: { fp: "own1" } } }));
  assert.match(readd.steps[0], /issue_write .*"owner-ok"/);
  assert.equal(decide(base({ ctx: owner, facts: red, st: { ownerOk: { fp: "older" } } })).type, "ask");
  assert.match(decide(base({ ctx: owner, facts: { labels: ["owner-ok"] } })).steps[0], /merge_pull_request .*"squash"/);
});

test("other tiers: merge when green, else switch on auto-merge once, then wait", () => {
  assert.match(decide(base()).steps[0], /merge_pull_request/);
  const pending = { jobs: { ...green, check: "failure" } };
  const d = decide(base({ facts: pending }));
  assert.match(d.steps[0], /enable_pr_auto_merge .*"SQUASH"/);
  assert.deepEqual(d.update, { autoMerge: true });
  assert.equal(decide(base({ facts: pending, st: { autoMerge: true } })).type, "wait");
});

test("merged: done, unless the record still waits on a main check", () => {
  assert.equal(decide(base({ facts: { merged: true } })).type, "done");
  const rec = buildRecord({ ...inputs, mainScenarios: ["m1"] }, { version: "1.2.3", kind: "loader", date: "2026-01-01" });
  const m = (st, ctx) => decide(base({ facts: { merged: true }, st: { record: rec, ...st }, ctx: { record: rec, ...ctx } }));
  assert.equal(m().local, "main-request");
  const req = { mainRequest: { id: "lc-m", at: 1e12 } };
  assert.equal(m(req).type, "wait");
  assert.equal(m(req, { result: true }).local, "pass-main");
  assert.equal(m(req, { result: false }).type, "fix");
  assert.equal(m({ ...req, passMainFor: "1.2.3" }).type, "done");
});

test("closed without merge is reported, never retried", () => {
  assert.equal(decide(base({ facts: { state: "closed" } })).type, "fix");
});

test("local checks are read from ci.yml, so they stay in step with CI", () => {
  const yml = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const names = ciChecks(yml, false).map((c) => c.name);
  for (const n of ["Tests (every scripts/*.test.mjs)", "Core lint", "Release data", "Release check"]) assert.ok(names.includes(n), n);
  assert.ok(!names.includes("Packs smoke"));
  assert.ok(ciChecks(yml, true).some((c) => c.name === "Packs smoke"));
});

test("status is read from the state and the record", () => {
  const { st, record } = base();
  const t = statusText({ ...st, request: { id: "lc-1", result: "pass" }, lastFacts: { state: "open", draft: false, at: "now" } }, record);
  assert.match(t, /Release 1\.2\.3 \(app-facing\)/);
  assert.match(t, /Branch live check \(b1\): lc-1: pass/);
  assert.match(t, /What wasn't verified: n/);
});

test("a live-check result comes from the PR's own CI comment, for this run only", () => {
  const req = { id: "lc-1" };
  assert.equal(liveResult({ live: { id: "lc-1", verdict: "pass" } }, req), true);
  assert.equal(liveResult({ live: { id: "lc-1", verdict: "fail" } }, req), false);
  assert.equal(liveResult({ live: { id: "lc-0", verdict: "pass" } }, req), null, "another run's result is ignored");
  assert.equal(liveResult({}, req, "LIVE-CHECK-RESULT\nid: lc-1\nverdict: pass"), true, "a result the thread read itself on #72 counts without the relay");
  assert.equal(liveResult({}, req, "LIVE-CHECK-RESULT\nid: lc-1\nverdict: fail"), false);
  assert.equal(liveResult({}, req, "LIVE-CHECK-RESULT\nid: lc-0\nverdict: pass"), null, "another run's direct result is ignored");
  assert.equal(liveResult({}, req, ""), null);
  assert.equal(liveResult({}, req), null);
  assert.equal(liveResult({}, { id: "lc-1", result: "pass" }), true, "a stored verdict holds");
  assert.equal(liveResult({ live: { id: "lc-1", verdict: "pass" } }, undefined), null);
  assert.match(FACTS_HELP, /live-check-result/);
});

test("waiting for a live check never asks the thread to copy a result", () => {
  const st = { request: { id: "lc-1", at: 1e12, fp: "app1" }, record: { checks: { branch: ["s"], main: [] } }, kind: "app-facing", pr: 5, prSetup: true, inputs: {} };
  const d = decide({ ...base({ facts: { draft: true }, st }) });
  assert.equal(d.type, "wait");
  assert.doesNotMatch(d.text, /--result|save its text/);
});

test("a version clash keeps main's release record and takes ours for the rest", () => {
  assert.equal(conflictSide("releases/0.42.1.json"), "theirs");
  assert.equal(conflictSide("CHANGELOG.md"), "ours");
  const dir = mkdtempSync(join(tmpdir(), "finish-clash-"));
  const g = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  mkdirSync(join(dir, "releases"));
  const rec = join(dir, "releases/0.42.1.json");
  writeFileSync(join(dir, "CHANGELOG.md"), "base\n");
  g("add", "-A"); g("commit", "-qm", "base");
  g("checkout", "-qb", "pr");
  mkdirSync(join(dir, "releases"), { recursive: true });
  writeFileSync(rec, '{"who":"PR 268"}'); writeFileSync(join(dir, "CHANGELOG.md"), "pr\n");
  g("add", "-A"); g("commit", "-qm", "pr");
  g("checkout", "-q", "main");
  mkdirSync(join(dir, "releases"), { recursive: true });
  writeFileSync(rec, '{"who":"PR 266"}'); writeFileSync(join(dir, "CHANGELOG.md"), "main\n");
  g("add", "-A"); g("commit", "-qm", "main");
  g("checkout", "-q", "pr");
  assert.throws(() => g("merge", "--no-edit", "main"));
  const cwd = process.cwd();
  process.chdir(dir);
  try { resolveConflicts(["releases/0.42.1.json", "CHANGELOG.md"]); } finally { process.chdir(cwd); }
  assert.equal(readFileSync(rec, "utf8"), '{"who":"PR 266"}', "main's record survives");
  assert.equal(readFileSync(join(dir, "CHANGELOG.md"), "utf8"), "pr\n");
});

test("a waiting step re-arms the 3-minute check-in; done and steps with their own send_later do not", () => {
  const w = rearm({ type: "wait", text: "x" }, 7);
  assert.match(w.steps.join("\n"), /send_later .*"delay_minutes":3.*PR #7/);
  assert.equal(rearm({ type: "done", text: "x" }, 7).steps, undefined);
  assert.equal(rearm({ type: "wait", text: "x" }, null).steps, undefined);
  const R = { owner: "o", repo: "r" };
  const live = rearm({ type: "wait", text: "Waiting for branch live check lc-1" }, 7, R).steps.join("\n");
  assert.match(live, /actions_run_trigger .*"workflow_id":"merge-queue.yml"/);
  assert.doesNotMatch(w.steps.join("\n"), /actions_run_trigger/);
  assert.match(live, /pull_request_read .*"repo":"studio-scratch".*"pullNumber":72/, "the thread reads #72 itself on every check-in");
  assert.match(live, /--live-result \.git\/finish-live\.txt/);
  assert.doesNotMatch(w.steps.join("\n"), /studio-scratch/);
  const own = { type: "do", steps: ['mcp__claude-code-remote__send_later {"delay_minutes":60}'] };
  assert.equal(rearm(own, 7).steps.length, 1);
});

test("a second start after a PR was opened begins from empty state", () => {
  assert.equal(continuesRun(null, "b"), false);
  assert.equal(continuesRun({ branch: "b", inputs: {} }, "b"), true); // checks failed before any PR: same run
  assert.equal(continuesRun({ branch: "b", pr: 302, request: {}, livePass: "x", ownerOk: "y" }, "b"), false);
  assert.equal(continuesRun({ branch: "b", passMainFor: "0.1.0" }, "b"), false);
  assert.equal(continuesRun({ branch: "a" }, "b"), false);
});

test("no merge and no auto-merge while the review or QA results are missing", () => {
  const p = ["no review result for abc1234: run the `reviewer` agent"];
  for (const over of [{ ctx: { verdictProblems: p } }, { ctx: { verdictProblems: p, tier: "owner" }, facts: { labels: ["owner-ok"] } }]) {
    const d = decide(base(over));
    assert.equal(d.type, "fix");
    assert.match(d.text, /no review result/);
    assert.equal(d.steps, undefined);
  }
  assert.match(decide(base({ ctx: { verdictProblems: [] } })).steps[0], /merge_pull_request/);
});

test("a live-check request for a new commit never shares an id with an older one (#313)", () => {
  const a = liveId("0.43.16", "branch", 1, "aaaaaaa1111");
  const b = liveId("0.43.16", "branch", 1, "bbbbbbb2222"); // counter restarted after a second start, branch moved
  assert.notEqual(a, b);
  assert.equal(liveResult({}, { id: b }, `LIVE-CHECK-RESULT\nid: ${a}\nverdict: fail`), null, "the old commit's fail is not the new request's verdict");
  assert.equal(liveResult({ live: { id: a, verdict: "fail" } }, { id: b }), null);
  assert.match(a, /^lc-0-43-16-branch-1-aaaaaaa$/);
});

test("a help flag, an unknown flag or a stray word never runs a command (owner-ok --help records no OK)", () => {
  for (const bad of [["owner-ok", ["--help"]], ["owner-ok", ["-h"]], ["owner-ok", ["--halp"]], ["owner-ok", ["now"]], ["status", ["--help"]], ["next", ["--help"]], ["push", ["--mesage", "x"]], ["start", ["--help"]], ["nope", []]]) {
    assert.ok(argProblem(bad[0], bad[1]), `${bad[0]} ${bad[1].join(" ")} must be refused`);
  }
  assert.equal(argProblem("owner-ok", []), null);
  assert.equal(argProblem("next", ["--pr", "5", "--facts", "f.json"]), null);
  assert.equal(argProblem("start", ["--issue", "1", "--minor", "--what", "a"]), null);
});

test("owner-ok --help on the real script prints usage and writes no OK", () => {
  const dir = mkdtempSync(join(tmpdir(), "fin-"));
  const out = execFileSync("node", [join(process.cwd(), "scripts/finish.mjs"), "owner-ok", "--help"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /usage/);
  assert.match(out, /Nothing was run or recorded/);
});

// The review gate in commitAndPush (#314, #319): run the real function in a temp clone with a bare "origin".
test("commitAndPush refuses to push a code change without review and QA results, and pushes once they exist", async () => {
  const { spawnSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const { writeVerdict } = await import("../plugins/studio/hooks/verdict.mjs");
  const studio = join(import.meta.dirname, "..");
  const run = (cwd, cmd, ...a) => spawnSync(cmd, a, { cwd, encoding: "utf8" });
  const g = (cwd, ...a) => assert.equal(run(cwd, "git", ...a).status, 0, `git ${a.join(" ")}`);
  const tmp = mkdtempSync(join(tmpdir(), "finish-gate-"));
  const origin = join(tmp, "origin.git");
  const work = join(tmp, "work");
  g(tmp, "init", "-q", "--bare", "-b", "main", origin);
  g(tmp, "clone", "-q", origin, work);
  g(work, "config", "user.email", "t@example.com");
  g(work, "config", "user.name", "t");
  mkdirSync(join(work, "src"), { recursive: true });
  writeFileSync(join(work, "src/a.ts"), "export const a = 1;\n");
  g(work, "add", "-A"); g(work, "commit", "-qm", "chore: base"); g(work, "push", "-q", "-u", "origin", "main");
  g(work, "switch", "-qc", "feat/x");
  writeFileSync(join(work, "src/a.ts"), "export const a = 2;\n");
  const state = { branch: "feat/x", inputs: {}, passMainFor: null };
  const push = () => run(work, "node", "--input-type=module", "-e",
    `import { commitAndPush } from ${JSON.stringify(join(studio, "scripts/finish.mjs"))}; commitAndPush(${JSON.stringify(state)}, "feat: x");`);
  const pushed = () => run(work, "git", "ls-remote", "--heads", origin, "feat/x").stdout.trim() !== "";

  const blocked = push();
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /NOT PUSHED/);
  assert.match(blocked.stderr, /no review result/);
  assert.match(blocked.stderr, /no QA result/);
  assert.equal(pushed(), false, "nothing reaches origin without results");
  assert.ok(existsSync(join(work, ".git/finish.json")), "state is kept so the run can continue");

  assert.ok(writeVerdict(work, "review", { reviewer: "reviewer", verdict: "approve", findings: [] }).file);
  assert.ok(writeVerdict(work, "qa", { verdict: "pass", findings: [] }).file);
  const ok = push();
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(pushed(), true, "pushed once both results cover HEAD");

  // A new code commit makes the results stale: refused again.
  writeFileSync(join(work, "src/a.ts"), "export const a = 3;\n");
  const stale = push();
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /NOT PUSHED/);
  assert.match(stale.stderr, /changed after the review/);
});

test("scenarios that cover the changed files are required by code; a skip needs a reason (#272)", () => {
  const cat = [
    { id: "a1", where: "branch", covers: ["plugins/studio/hooks/check.mjs"] },
    { id: "b1", where: "branch", covers: ["plugins/studio/skills/**"] },
    { id: "m1", where: "main", covers: ["scripts/studio-env.mjs"] },
  ];
  const files = ["plugins/studio/hooks/check.mjs", "plugins/studio/skills/x/SKILL.md", "docs/a.md"];
  const run = (o) => checkInputs({ ...inputs, scenarios: ["a1"], ...o }, "app-facing", cat, files);
  const p = run({});
  assert.ok(p.some((x) => /missing b1/.test(x) && /--scenarios a1,b1/.test(x)), p.join("\n"));
  assert.deepEqual(run({ scenarios: ["a1", "b1"] }), []);
  assert.deepEqual(run({ skipScenario: ["b1: wording only, no behaviour"] }), []);
  assert.ok(run({ skipScenario: ["b1"] }).some((x) => /needs a known scenario id and a reason/.test(x)));
  assert.deepEqual(buildRecord({ ...inputs, scenarios: ["a1"], skipScenario: ["b1: wording only"] }, { version: "1.0.1", kind: "app-facing", date: "2026-01-01" }).checks.skipped, [{ id: "b1", reason: "wording only" }]);
  assert.deepEqual(uncoveredFiles(cat, ["plugins/x.md", "plugins/studio/hooks/check.mjs"]), ["plugins/x.md"]);
});

test("a fixed scenario after a failed live check is requested again (#333)", () => {
  const a = [{ id: "s", prompt: "old" }, { id: "t" }];
  const b = [{ id: "s", prompt: "fixed" }, { id: "t" }];
  assert.notEqual(catalogHash(a, ["s"]), catalogHash(b, ["s"]));
  assert.equal(catalogHash(a, ["t"]), catalogHash(b, ["t"]));
  const req = { id: "lc-1", fp: "app1", cat: "old", at: 1e12 };
  const d = decide(base({ facts: { draft: true }, st: { request: req }, ctx: { appFp: "app1", catHash: "new", result: false } }));
  assert.equal(d.local, "branch-request");
  assert.equal(decide(base({ facts: { draft: true }, st: { request: req }, ctx: { appFp: "app1", catHash: "old", result: false } })).type, "fix");
});
