// Run: node --test scripts/finish.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildRecord, checkInputs, ciChecks, decide, FACTS_HELP, kindOf, liveResult, nextVersion, prBody, statusText, versionFree } from "./finish.mjs";
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
  for (const n of ["Sync tests", "Core lint", "Release data", "Finish script tests", "Release check"]) assert.ok(names.includes(n), n);
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
