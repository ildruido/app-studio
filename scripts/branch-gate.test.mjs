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
