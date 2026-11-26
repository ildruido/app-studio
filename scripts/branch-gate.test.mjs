// Run: node --test scripts/branch-gate.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appFacing, evaluate, parseResults } from "./branch-gate.mjs";
import { loadCatalog, makeRequest, makeResult } from "./live-check.mjs";

const catalog = loadCatalog(join(dirname(fileURLToPath(import.meta.url)), ".."));
const rec = { version: "1.0.0", kind: "app-facing", checks: { branch: ["backlog-lifecycle"], main: [] }, status: { main: "pending" } };
const res = (o) => ({ id: "lc-1", fp: "aaaaaaaaaaaa", commit: "abc1234", pass: true, scenarios: { "backlog-lifecycle": true }, ...o });
const g = (o) => evaluate({ changed: ["plugins/studio/skills/x/SKILL.md"], fp: "aaaaaaaaaaaa", record: rec, results: [res({})], ...o });

test("app-facing files are the harness files; docs, tests and CI are internal", () => {
  assert.deepEqual(appFacing(["plugins/a", "docs/x.md", "scripts/studio-env.mjs", "scripts/tier.mjs", ".github/workflows/ci.yml"]), ["plugins/a", "scripts/studio-env.mjs"]);
});

test("an internal-only PR needs no scratch run, even with nothing readable", () => {
  assert.ok(evaluate({ changed: ["docs/GOVERNANCE.md"], fp: "", record: null, results: null }).ok);
});

test("an app-facing PR passes only with a passing result for its current fingerprint and every scenario", () => {
  assert.ok(g({}).ok);
  assert.equal(g({ results: [res({ fp: "bbbbbbbbbbbb" })] }).ok, false);
  assert.match(g({ results: [res({ fp: "bbbbbbbbbbbb" })] }).why, /different app-facing changes/);
  assert.equal(g({ results: [res({ pass: false })] }).ok, false);
  assert.equal(g({ results: [res({ scenarios: {} })] }).ok, false);
  assert.equal(g({ results: [] }).ok, false);
  assert.equal(g({ results: [res({ fp: undefined })] }).ok, false);
});

test("results that cannot be read fail closed", () => {
  assert.match(g({ results: null }).why, /could not be read/);
});

test("a record with branch `none` passes; a loader release cannot use `none` and must stay pending", () => {
  const none = { ...rec, checks: { branch: { none: "wording" }, main: [] } };
  assert.ok(g({ record: none, results: null }).ok);
  assert.equal(g({ record: { ...none, kind: "loader" }, results: null }).ok, false);
  assert.equal(g({ record: { ...rec, kind: "loader", status: { main: "not needed" } } }).ok, false);
  assert.equal(g({ record: null }).ok, false);
});

test("a result made by live-check.mjs for a request with a fingerprint is read back by the gate", () => {
  const r = makeRequest({ id: "lc-9", branch: "b", commit: "abc1234", scenarios: ["backlog-lifecycle"], fp: "abcdef012345" }, catalog);
  assert.ok(r.ok, r.problems);
  const body = makeResult({ id: "lc-9", commit: "abc1234", fp: "abcdef012345", scenarios: ["backlog-lifecycle"] }, { verdicts: { "backlog-lifecycle": { pass: true } } });
  const [x] = parseResults(["noise", `review text\n${body}`]);
  assert.deepEqual(x, { id: "lc-9", fp: "abcdef012345", commit: "abc1234", pass: true, scenarios: { "backlog-lifecycle": true } });
  const [y] = parseResults([makeResult({ id: "lc-9", commit: "abc1234", fp: "abcdef012345", scenarios: ["backlog-lifecycle"] }, { failed: "timeout" })]);
  assert.equal(y.pass, false);
});

test("a bad fingerprint is refused in a request", () => {
  assert.match(makeRequest({ id: "lc-9", branch: "b", commit: "abc1234", scenarios: ["backlog-lifecycle"], fp: "zz" }, catalog).problems.join(), /fp must/);
});

test("the gate fails a record that omits a scenario covering the changed files, unless it skips it with a reason (#272)", () => {
  const cat = [{ id: "backlog-lifecycle", where: "branch", covers: ["plugins/studio/skills/**"] }, { id: "other", where: "branch", covers: ["plugins/studio/skills/**"] }];
  const r = g({ catalog: cat });
  assert.equal(r.ok, false);
  assert.match(r.why, /omits branch scenarios[^]*other/);
  const skip = { ...rec, checks: { ...rec.checks, skipped: [{ id: "other", reason: "wording" }] } };
  assert.ok(g({ catalog: cat, record: skip }).ok);
});

test("the gate judges the PR's own change: its unreleased entry, or what a cut PR adds itself (#351)", async () => {
  const { ownChange } = await import("./branch-gate.mjs");
  const PJ = "plugins/studio/.claude-plugin/plugin.json";
  const files = (o) => (p) => o[p] ?? null;
  const e = (id, o = {}) => ({ id, kind: "app-facing", checks: { branch: ["backlog-lifecycle"], main: [] }, status: { main: "not needed" }, ...o });
  const E1 = "releases/unreleased/e1.json";
  const base = { [PJ]: JSON.stringify({ version: "1.0.0" }) };
  // An ordinary PR: its entry, nothing else. Another PR's entry that is already on main is not part of the diff.
  assert.equal(ownChange(["plugins/a.md", E1], files(base), files({ ...base, [E1]: JSON.stringify(e("e1")) })).id, "e1");
  assert.equal(ownChange(["plugins/a.md"], files(base), files(base)), null);
  // A cut-only PR folds entries main already had: it has no change of its own.
  const rec = (changes) => JSON.stringify({ version: "1.0.1", kind: "app-facing", checks: { branch: ["x"], main: [] }, changes });
  const cutAfter = { [PJ]: JSON.stringify({ version: "1.0.1" }), "releases/1.0.1.json": rec([e("e1")]) };
  assert.equal(ownChange([PJ, E1, "releases/1.0.1.json"], files({ ...base, [E1]: JSON.stringify(e("e1")) }), files(cutAfter)), null);
  // A PR that carries a change and cuts the release: only the change born in it counts, not the ones it folds in.
  const both = { [PJ]: JSON.stringify({ version: "1.0.1" }), "releases/1.0.1.json": rec([e("e1"), e("e2", { checks: { branch: ["sync-and-idempotent"], main: [] } })]) };
  const own = ownChange(["plugins/a.md", PJ, E1, "releases/1.0.1.json"], files({ ...base, [E1]: JSON.stringify(e("e1")) }), files(both));
  assert.deepEqual([own.id, own.checks.branch], ["e2", ["sync-and-idempotent"]]);
  // A record from before batches is taken whole.
  assert.equal(ownChange([PJ, "releases/1.0.1.json"], files(base), files({ [PJ]: JSON.stringify({ version: "1.0.1" }), "releases/1.0.1.json": JSON.stringify({ version: "1.0.1", kind: "internal" }) })).version, "1.0.1");
  // Without an entry an app-facing PR cannot pass.
  assert.match(evaluate({ changed: ["plugins/a.md"], fp: "a", record: null, results: [] }).why, /no unreleased entry/);
});

test("an entry marked internal cannot carry app-facing files past the gate (#351)", () => {
  const r = g({ record: { id: "e1", kind: "internal", checks: { branch: { none: "internal change" }, main: [] }, status: { main: "not needed" } } });
  assert.equal(r.ok, false);
  assert.match(r.why, /kind internal/);
});
