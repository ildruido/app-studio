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
test("harness change without a version bump fails", () => {
  const f = files({ [PJ]: pj("1.0.0"), "CHANGELOG.md": "## [1.0.0]" });
  assert.equal(evaluate(["plugins/studio/skills/x/SKILL.md"], f, f).problems.length, 1);
});
test("bump without a changelog entry fails; with one passes", () => {
  const before = files({ [PJ]: pj("1.0.0") });
  const c = ["plugins/studio/skills/x/SKILL.md"];
  assert.equal(evaluate(c, before, files({ [PJ]: pj("1.0.1"), "CHANGELOG.md": "## [1.0.0]" })).problems.length, 1);
  assert.deepEqual(evaluate(c, before, files({ [PJ]: pj("1.0.1"), "CHANGELOG.md": "## [1.0.1] - x" })).problems, []);
});
test("a changed pack must raise its own version and triggers the smoke test", () => {
  const b = files({ [PJ]: pj("1.0.0"), "packs/web/pack.json": pj("0.2.0") });
  const same = files({ [PJ]: pj("1.0.1"), "CHANGELOG.md": "## [1.0.1]", "packs/web/pack.json": pj("0.2.0") });
  const bumped = files({ [PJ]: pj("1.0.1"), "CHANGELOG.md": "## [1.0.1]", "packs/web/pack.json": pj("0.2.1") });
  const c = ["packs/web/x.ts"];
  const bad = evaluate(c, b, same);
  assert.equal(bad.problems.length, 1);
  assert.equal(bad.smoke, true);
  assert.deepEqual(evaluate(c, b, bumped).problems, []);
});
