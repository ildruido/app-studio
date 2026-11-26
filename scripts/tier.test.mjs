// Run: node --test scripts/tier.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { addsAction, classify, wordingOnly } from "./tier.mjs";

const files = (o = {}) => (p) => o[p] ?? null;
const tier = (changed, extra = {}) => classify({ changed, before: files(), after: files(), ...extra }).tier;

test("paths set the tier; unknown files go to the owner tier", () => {
  assert.equal(tier(["docs/archive/HANDOVER-2026-11.md", "CHANGELOG.md", "README.md"]), "auto");
  assert.equal(tier(["scripts/studio-sync.test.mjs"]), "auto");
  assert.equal(tier(["plugins/studio/skills/x/SKILL.md"]), "live");
  assert.equal(tier(["packs/web/x.ts", "docs/a.md"]), "live");
  assert.equal(tier(["scripts/studio-sync.mjs"]), "live");
  for (const f of ["scripts/studio-env.mjs", "scripts/env-setup.sh", ".github/workflows/ci.yml", "scripts/tier.mjs", "scripts/tier.test.mjs", "scripts/core-lint.mjs", "scripts/release-check.mjs"])
    assert.equal(tier([f]), "owner", f);
  assert.equal(tier(["something-new.txt"]), "owner");
  assert.equal(tier([".gitignore", "docs/a.md"]), "owner");
});

test("release records are auto, the release script is owner", () => {
  assert.equal(tier(["releases/0.38.0.json", "CHANGELOG.md"]), "auto");
  assert.equal(tier(["scripts/release.mjs"]), "owner");
});
test("the highest tier wins", () => {
  assert.equal(tier(["docs/a.md", "plugins/studio/x.md", ".github/workflows/ci.yml"]), "owner");
});

test("a label can raise a tier, never lower it; the off switch sends everything to the owner tier", () => {
  assert.equal(tier(["docs/a.md"], { labels: ["tier:owner"] }), "owner");
  assert.equal(tier([".github/workflows/ci.yml"], { labels: ["tier:auto", "other"] }), "owner");
  assert.equal(tier(["docs/a.md"], { allNeedOwner: true }), "owner");
  assert.equal(tier(["docs/a.md"], { labels: ["studio-backlog"] }), "auto");
});

test("old names are gone: tier:ale, allNeedAle and the Ale action step no longer count", () => {
  assert.equal(tier(["docs/a.md"], { labels: ["tier:ale"] }), "auto");
  assert.equal(tier(["docs/a.md"], { allNeedAle: true }), "auto");
  assert.equal(addsAction("**Ale action:** do it."), false);
  assert.equal(addsAction("**Admin action:** add a secret."), true);
  assert.equal(addsAction("No **Admin action**."), false);
  assert.equal(tier(["CHANGELOG.md"], { addedChangelog: ["- x. **Admin action:** do it."] }), "owner");
});

test("removing a test sends the PR to the owner tier; adding one does not", () => {
  const t = (n) => Array.from({ length: n }, (_, i) => `test("case ${i}", () => {});`).join("\n");
  const f = "scripts/studio-sync.test.mjs";
  assert.equal(tier([f], { before: files({ [f]: t(3) }), after: files({ [f]: t(4) }) }), "auto");
  assert.equal(tier([f], { before: files({ [f]: t(3) }), after: files({ [f]: t(2) }) }), "owner");
  assert.equal(tier([f], { before: files({ [f]: t(3) }), after: files() }), "owner");
  assert.equal(tier(["packs/web/a.test.ts"], { before: files({ "packs/web/a.test.ts": "it('a', () => {})\nit('b', () => {})" }), after: files({ "packs/web/a.test.ts": "it('a', () => {})" }) }), "owner");
});

test("a changelog line that adds an App or Admin action goes to the owner tier", () => {
  assert.equal(addsAction("**Admin action:** paste the new script."), true);
  assert.equal(addsAction("**App action** (existing apps, optional): copy the file."), true);
  assert.equal(addsAction("### App action"), false);
  assert.equal(addsAction("No **App action** and no **Admin action**."), false);
  assert.equal(addsAction("No **App action**, no **Admin action**."), false);
  assert.equal(addsAction("**App action:** none (`harness-sync pull`)."), false);
  assert.equal(tier(["CHANGELOG.md"], { addedChangelog: ["- x. **Admin action:** paste it."] }), "owner");
  assert.equal(tier(["CHANGELOG.md"], { addedChangelog: ["- x. No **App action**, no **Admin action**."] }), "auto");
});

test("more than 400 changed lines go to the owner tier; tests and the changelog don't count", () => {
  const n = (path, lines) => ({ path, lines });
  assert.equal(tier(["docs/a.md"], { numstat: [n("docs/a.md", 401)] }), "owner");
  assert.equal(tier(["docs/a.md"], { numstat: [n("docs/a.md", 400)] }), "auto");
  assert.equal(tier(["docs/a.md", "CHANGELOG.md", "scripts/studio-sync.test.mjs"], { numstat: [n("docs/a.md", 10), n("CHANGELOG.md", 900), n("scripts/studio-sync.test.mjs", 900)] }), "auto");
});

const DOC = [
  "# Title",
  "",
  "Intro paragraph with some words in it.",
  "",
  "- First item here.",
  "- Second item here.",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
].join("\n");

test("wording check: a typo or a clearer phrase passes", () => {
  assert.equal(wordingOnly(DOC, DOC.replace("some words", "a few words")).ok, true);
  assert.equal(wordingOnly(DOC, DOC.replace("Intro", "Introduction")).ok, true);
  assert.equal(wordingOnly(DOC, DOC).ok, true);
});

test("wording check: a rule word, a number or a negation fails, added or removed", () => {
  for (const [from, to] of [
    ["Intro paragraph", "Intro paragraph must"],
    ["Intro paragraph", "Intro never paragraph"],
    ["First item", "Only item"],
    ["some words", "no words"],
    ["Intro paragraph", "Intro 7 paragraph"],
    ["First item", "First owner's item"],
    ["First item", "First approved item"],
    ["Second item", "Second merges item"],
    ["Second item", "Second isn't item"],
    ["Second item", "Second tiers item"],
    ["Second item", "Second tested item"],
    ["Second item", "Second threads item"],
  ]) assert.equal(wordingOnly(DOC, DOC.replace(from, to)).ok, false, to);
  const withRule = "# Title\n\nWe must test it.\n";
  assert.equal(wordingOnly(withRule, withRule.replace("must test it", "can try it")).ok, false);
});

test("wording check: adding, removing or moving a heading, item or row fails", () => {
  assert.equal(wordingOnly(DOC, DOC + "\n- Third item here.").ok, false);
  assert.equal(wordingOnly(DOC, DOC.replace("- Second item here.\n", "")).ok, false);
  assert.equal(wordingOnly(DOC, DOC.replace("# Title", "## Title")).ok, false);
  assert.equal(wordingOnly(DOC, DOC.replace("| 1 | 2 |", "| x | y |\n| 1 | 2 |")).ok, false);
  const swapped = DOC.replace("- First item here.\n- Second item here.", "- Second item here.\n- First item here.");
  assert.equal(wordingOnly(DOC, swapped).ok, false);
});

test("wording check: more than 30 changed words fails", () => {
  const extra = (n) => Array.from({ length: n }, (_, i) => `extra${"abcdefghijklmnopqrstuvwxyzabcdef"[i]}`).join(" ");
  assert.equal(wordingOnly(DOC, DOC.replace("some words", `some ${extra(30)} words`)).ok, true);
  assert.equal(wordingOnly(DOC, DOC.replace("some words", `some ${extra(31)} words`)).ok, false);
});

test("wording check: two small edits far apart both count", () => {
  const word = (i) => `w${"abcdefghij"[i % 10]}${"klmnopqrst"[Math.floor(i / 10) % 10]}${"uvwxyzabcd"[Math.floor(i / 100) % 10]}${"efghijklmn"[Math.floor(i / 1000)]}`;
  const words = Array.from({ length: 2000 }, (_, i) => word(i));
  const long = "# T\n\n" + words.join(" ") + "\n";
  const edited = long.replace(words[10], "alpha").replace(words[1990], "beta");
  const r = wordingOnly(long, edited);
  assert.equal(r.ok, true);
  assert.equal(r.words, 4);
});

test("the on-demand governance files are rule files too", () => {
  const f = "docs/governance/ci-and-merge.md";
  const bad = classify({ changed: [f], before: files({ [f]: DOC }), after: files({ [f]: DOC.replace("some words", "some words, never") }) });
  assert.equal(bad.tier, "owner");
});

test("a rule file with a wording-only change is Auto; with a rule change it is the owner tier", () => {
  const f = "docs/GOVERNANCE.md";
  const ok = classify({ changed: [f], before: files({ [f]: DOC }), after: files({ [f]: DOC.replace("some words", "a few words") }) });
  assert.equal(ok.tier, "auto");
  const bad = classify({ changed: [f], before: files({ [f]: DOC }), after: files({ [f]: DOC.replace("some words", "some words, never") }) });
  assert.equal(bad.tier, "owner");
  assert.match(bad.reasons.join("\n"), /rule file/);
});

test("unreleased entries are release data: auto tier, never counted as size, and a manual step in one needs the owner (#351)", () => {
  const E = "releases/unreleased/e1.json";
  const entry = (o = {}) => JSON.stringify({ id: "e1", appActions: [], adminActions: [], ...o });
  const run = (changed, b, a, over = {}) => classify({ changed, before: (p) => b[p] ?? null, after: (p) => a[p] ?? null, ...over }).tier;
  assert.equal(run([E], {}, { [E]: entry() }), "auto");
  assert.equal(run([E], {}, { [E]: entry({ appActions: ["add the field"] }) }), "owner");
  assert.equal(run([E], {}, { [E]: entry({ adminActions: ["paste the script"] }) }), "owner");
  // Marking a main check passed changes the entry, not its steps: no new OK.
  assert.equal(run([E], { [E]: entry({ appActions: ["add the field"] }) }, { [E]: entry({ appActions: ["add the field"], status: { main: "passed 2026-11-26" } }) }), "auto");
  // A cut repeats the steps of the entries it folds in (already OK'd with their PRs); a step no entry had still needs the owner.
  const R = "releases/1.1.0.json";
  const cut = [E, R, "CHANGELOG.md"];
  const log = { addedChangelog: ["- **App action:** 1. add the field"] };
  assert.equal(run(cut, { [E]: entry({ appActions: ["add the field"] }) }, { [R]: entry({ appActions: ["add the field"] }) }, log), "auto");
  assert.equal(run(cut, { [E]: entry() }, { [R]: entry({ appActions: ["something new"] }) }, log), "owner");
  // A big record is still release data.
  assert.equal(run(cut, { [E]: entry() }, { [R]: entry() }, { numstat: [{ path: R, lines: 900 }, { path: E, lines: 30 }] }), "auto");
});
