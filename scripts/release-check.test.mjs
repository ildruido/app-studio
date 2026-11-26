// Run: node --test scripts/release-check.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "./release-check.mjs";

const PJ = "plugins/studio/.claude-plugin/plugin.json";
const files = (o) => (p) => o[p] ?? null;
const pj = (v) => JSON.stringify({ version: v });

test("docs-only change needs no bump and no smoke", () => {
  const r = evaluate(["docs/GOVERNANCE.md"], files({}), files({}));
  assert.deepEqual(r, { problems: [], smoke: false });
});
const ENTRY = "releases/unreleased/e1.json";
test("a harness change adds its unreleased entry and leaves the plugin version alone", () => {
  const before = files({ [PJ]: pj("1.0.0") });
  const c = ["plugins/studio/skills/x/SKILL.md"];
  const [msg] = evaluate(c, before, before).problems;
  assert.match(msg, /adds no unreleased entry/);
  assert.deepEqual(evaluate([...c, ENTRY], before, files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}" }), [ENTRY]).problems, []);
  // An entry only changed (a main check marked passed) is fine too; the plugin's own file is no harness change by itself.
  assert.deepEqual(evaluate([ENTRY], files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}" }), files({ [PJ]: pj("1.0.0"), [ENTRY]: "{ }" }), [ENTRY]).problems, []);
});
test("a cut raises the version, has its record and leaves no entry behind", () => {
  const before = files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}" });
  const c = [PJ, ENTRY, "releases/1.0.1.json", "CHANGELOG.md"];
  assert.deepEqual(evaluate(c, before, files({ [PJ]: pj("1.0.1"), "releases/1.0.1.json": "{}" }), []).problems, []);
  assert.match(evaluate(c, before, files({ [PJ]: pj("1.0.1") }), []).problems[0], /no release record releases\/1\.0\.1\.json/);
  // A change that merged while the cut waited left its entry: the record must be rebuilt.
  assert.match(evaluate(c, before, files({ [PJ]: pj("1.0.1"), "releases/1.0.1.json": "{}" }), ["releases/unreleased/e2.json"]).problems[0], /1 unreleased entry is left/);
  // A PR may carry its change and cut the release in one go (finish start --release-now).
  assert.deepEqual(evaluate(["plugins/studio/skills/x/SKILL.md", PJ, "releases/1.0.1.json"], files({ [PJ]: pj("1.0.0") }), files({ [PJ]: pj("1.0.1"), "releases/1.0.1.json": "{}" }), []).problems, []);
});
test("entries leave only through a cut, and the version only goes up", () => {
  const before = files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}" });
  assert.match(evaluate([ENTRY], before, files({ [PJ]: pj("1.0.0") }), []).problems[0], /removed without a release/);
  assert.match(evaluate([PJ], before, files({ [PJ]: pj("0.9.0"), [ENTRY]: "{}" }), [ENTRY]).problems[0], /only ever goes up/);
});
test("a release record is written once, by its cut: no PR rewrites, removes or adds one on the side", () => {
  const R = "releases/1.0.0.json";
  const rec = (o = {}) => JSON.stringify({ version: "1.0.0", summary: "s", status: { main: "pending" }, ...o });
  const before = files({ [PJ]: pj("1.0.0"), [R]: rec() });
  assert.deepEqual(evaluate([R], before, files({ [PJ]: pj("1.0.0"), [R]: rec({ status: { main: "passed 2026-11-26" } }) })).problems, [], "a main check that passed only changes the status");
  assert.match(evaluate([R], before, files({ [PJ]: pj("1.0.0"), [R]: rec({ summary: "other" }) })).problems[0], /main already has: it cannot be rewritten/);
  assert.match(evaluate([R], before, files({ [PJ]: pj("1.0.0") })).problems[0], /cannot be removed/);
  assert.match(evaluate(["releases/1.0.5.json"], before, files({ [PJ]: pj("1.0.0"), [R]: rec(), "releases/1.0.5.json": "{}" })).problems[0], /added without raising the plugin version/);
  // Two cuts took the same version and main's merged first: rebuilding ours over main's record is refused.
  const clash = evaluate([PJ, R, "releases/1.0.1.json"], before, files({ [PJ]: pj("1.0.1"), [R]: rec({ summary: "ours" }), "releases/1.0.1.json": "{}" }), []);
  assert.equal(clash.problems.length, 1);
});
test("a changed pack must raise its own version and triggers the smoke test", () => {
  const b = files({ [PJ]: pj("1.0.0"), "packs/web/pack.json": pj("0.2.0") });
  const same = files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}", "packs/web/pack.json": pj("0.2.0") });
  const bumped = files({ [PJ]: pj("1.0.0"), [ENTRY]: "{}", "packs/web/pack.json": pj("0.2.1") });
  const c = ["packs/web/x.ts", ENTRY];
  const bad = evaluate(c, b, same, [ENTRY]);
  assert.equal(bad.problems.length, 1);
  assert.equal(bad.smoke, true);
  assert.deepEqual(evaluate(c, b, bumped, [ENTRY]).problems, []);
});
