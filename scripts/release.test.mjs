// Run: node --test scripts/release.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { actions, details, gate, loadAll, newRecord, parseLegacy, passMain, pending, render, scenarios, summary, validate, validateCatalog, validateRecord } from "./release.mjs";

const LEGACY = `# Changelog

## [0.2.0] - 2026-10-12

Live check: passed 2026-10-13

- Origin: old thing. More words.
- **App action:** run migrate. No **Admin action**.

## [0.1.0] - 2026-10-11

Live check: pending

- Origin: first thing.
- **App action:** none.
`;
const rec = (o = {}) => ({
  version: "0.3.0", date: "2026-11-01", summary: "Shorter report", kind: "app-facing",
  refs: { issues: [5], ideas: [], pr: 6 }, appCreator: ["a"], appActions: ["step one"], adminActions: [],
  checks: { branch: ["sync-fresh"], main: [] }, status: { main: "not needed" }, notVerified: ["x"], ...o,
});

function studio(records = [], legacy = LEGACY, version = "0.3.0") {
  const d = mkdtempSync(join(tmpdir(), "rel-"));
  mkdirSync(join(d, "releases"));
  mkdirSync(join(d, "docs"));
  mkdirSync(join(d, "plugins/studio/.claude-plugin"), { recursive: true });
  writeFileSync(join(d, "plugins/studio/.claude-plugin/plugin.json"), JSON.stringify({ version }));
  writeFileSync(join(d, "docs/CHANGELOG-legacy.md"), legacy);
  for (const r of records) writeFileSync(join(d, "releases", `${r.version}.json`), JSON.stringify(r));
  writeFileSync(join(d, "CHANGELOG.md"), render(d));
  return d;
}

test("legacy entries are read: status, summary, actions", () => {
  const [a, b] = parseLegacy(LEGACY);
  assert.equal(a.version, "0.2.0");
  assert.equal(a.status.main, "passed 2026-10-13");
  assert.equal(a.summary, "old thing");
  assert.equal(a.appActions.length, 1);
  assert.equal(a.adminActions.length, 0);
  assert.equal(b.status.main, "pending");
  assert.equal(b.appActions.length, 0);
});

test("gate checks every release in range, not only the newest", () => {
  const all = loadAll(studio([rec()]));
  assert.equal(gate(all, "0.3.0", "0.0.1").ok, false); // 0.1.0 is pending
  assert.match(gate(all, "0.3.0", "0.0.1").text, /0\.1\.0/);
  const ok = gate(all, "0.3.0", "0.1.0");
  assert.equal(ok.ok, true);
  assert.equal(ok.data.releases, 2);
});
test("a pending record blocks, a passed one does not", () => {
  const p = rec({ version: "0.4.0", kind: "loader", checks: { branch: ["a"], main: ["thread-start"] }, status: { main: "pending" } });
  const all = loadAll(studio([rec(), p], LEGACY.replace("pending", "passed 2026-10-12"), "0.4.0"));
  assert.equal(gate(all, "0.4.0", "0.3.0").ok, false);
  assert.equal(pending(all).data[0].version, "0.4.0");
  const done = passMain(p, "2026-11-30").record;
  assert.equal(done.status.main, "passed 2026-11-30");
  assert.ok(passMain(done, "x").error);
  assert.ok(passMain(null, "x").error);
});

test("summary, actions and details are short and filtered by version", () => {
  const all = loadAll(studio([rec()]));
  assert.match(summary(all, "0.3.0", "0.2.0").text, /^0\.3\.0 {2}Shorter report \(#5, PR #6\)$/);
  assert.match(actions(all, "0.3.0", "0.0.1", "app").text, /0\.3\.0:\n {2}1\. step one/);
  assert.match(actions(all, "0.3.0", "0.2.0", "admin").text, /No Admin actions/);
  assert.match(details(all, "0.3.0").text, /Branch checks: sync-fresh/);
  assert.equal(details(all, "9.9.9").ok, false);
});

test("a rolled-back release adds no App or Admin actions to the report", () => {
  const legacy = LEGACY + "\n## [0.1.5] - 2026-10-11\n\nLive check: rolled back in 0.2.0 (never applied to apps)\n\n- Origin: x.\n- **Admin action:** add a key.\n- **App action:** do it.\n";
  const all = loadAll(studio([rec()], legacy));
  assert.equal(all.find((r) => r.version === "0.1.5").status.main, "rolled back in 0.2.0");
  assert.doesNotMatch(actions(all, "0.3.0", "0.0.1", "admin").text, /add a key/);
  assert.doesNotMatch(actions(all, "0.3.0", "0.0.1", "app").text, /0\.1\.5/);
  assert.equal(gate(all, "0.3.0", "0.0.1").data.blocking.length, 1); // only 0.1.0 (pending); the rolled-back one never blocks
});

test("scenarios list ids, and say when the catalog lacks one", () => {
  const all = loadAll(studio([rec()]));
  assert.match(scenarios(all, "0.3.0", "branch", null).text, /sync-fresh {2}\(not in the scenario catalog yet\)/);
  assert.match(scenarios(all, "0.3.0", "branch", { scenarios: [{ id: "sync-fresh", title: "Fresh sync" }] }).text, /Fresh sync/);
  assert.match(scenarios(all, "0.3.0", "main", null).text, /No main scenarios/);
});

test("new gives the next free patch and an empty valid-shaped record", () => {
  const all = loadAll(studio([rec()]));
  const r = newRecord(all, "0.3.0", undefined, "internal", "2026-11-02");
  assert.equal(r.version, "0.3.1");
  assert.equal(newRecord(all, "0.3.0", "0.3.0").ok, false);
  assert.deepEqual(validateRecord({ ...r.record, summary: "x" }, "0.3.1.json"), []);
});

test("validate: well-formed data passes, and each fault is named", () => {
  assert.deepEqual(validate(studio([rec()])), []);
  assert.match(validate(studio([rec({ summary: "" })])).join("\n"), /summary is empty/);
  assert.match(validate(studio([rec({ kind: "big" })])).join("\n"), /kind must be/);
  assert.match(validate(studio([rec({ status: { main: "maybe" } })])).join("\n"), /status\.main/);
  assert.match(validate(studio([rec({ checks: { branch: [], main: ["m"] }, status: { main: "not needed" } })])).join("\n"), /cannot be "not needed"/);
  assert.match(validate(studio([], LEGACY, "0.40.0")).join("\n"), /no record releases\/0\.40\.0\.json/);
});
test("validate: CHANGELOG.md must be what render produces", () => {
  const d = studio([rec()]);
  writeFileSync(join(d, "CHANGELOG.md"), `${readFileSync(join(d, "CHANGELOG.md"), "utf8")}hand edit\n`);
  assert.match(validate(d).join("\n"), /CHANGELOG\.md is not what/);
});
test("validate: scenario ids must exist in the catalog once there is one", () => {
  const d = studio([rec()]);
  writeFileSync(join(d, "releases/scenarios.json"), JSON.stringify({ scenarios: [{ id: "other" }] }));
  assert.match(validate(d).join("\n"), /scenario "sync-fresh" is not in/);
});

test("render: records first (newest first), legacy entries unchanged, same shape the sync parser reads", () => {
  const d = studio([rec(), rec({ version: "0.3.1", summary: "Second" })]);
  const t = render(d);
  assert.ok(t.indexOf("## [0.3.1]") < t.indexOf("## [0.3.0]") && t.indexOf("## [0.3.0]") < t.indexOf("## [0.2.0]"));
  assert.ok(t.includes(LEGACY.split("\n## ")[1].trim()));
  assert.match(t, /\*\*App action:\*\* 1\. step one/);
  assert.equal(render(d), t); // deterministic
});

test("CLI: new, render, validate, pass-main, gate", () => {
  const d = studio([]);
  const run = (...a) => spawnSync("node", [join(import.meta.dirname, "release.mjs"), ...a, "--studio", d], { encoding: "utf8" });
  assert.equal(run("new", "--version", "0.3.0", "--kind", "loader").status, 0);
  const file = join(d, "releases/0.3.0.json");
  const r = JSON.parse(readFileSync(file, "utf8"));
  Object.assign(r, { summary: "Loader thing", checks: { branch: ["a"], main: ["thread-start"] } });
  writeFileSync(file, JSON.stringify(r));
  assert.equal(run("render").status, 0);
  assert.equal(run("validate").status, 0);
  assert.equal(run("gate", "--since", "0.2.0").status, 1);
  assert.equal(run("pass-main", "0.3.0", "--date", "2026-11-30").status, 0);
  assert.equal(run("gate", "--since", "0.2.0").status, 0);
  assert.match(readFileSync(join(d, "CHANGELOG.md"), "utf8"), /Live check: passed 2026-11-30/);
  assert.equal(run("validate", "--json").status, 0);
});

// ---------- scenario catalog (#223) ----------

const scen = (o = {}) => ({
  id: "sync-fresh", title: "Fresh sync", where: "branch", source: "manual check 2026-11-24, item 1",
  prompt: "Run the sync and report.", pass: [{ type: "output", matches: "already in step" }], ...o,
});

test("catalog: a well-formed entry passes; each fault is named", () => {
  assert.deepEqual(validateCatalog({ scenarios: [scen()] }), []);
  assert.match(validateCatalog({}).join("\n"), /needs \{ scenarios/);
  assert.match(validateCatalog({ scenarios: [scen(), scen()] }).join("\n"), /duplicate id/);
  assert.match(validateCatalog({ scenarios: [scen({ id: "Bad Id" })] }).join("\n"), /id must be/);
  assert.match(validateCatalog({ scenarios: [scen({ title: "" })] }).join("\n"), /title is empty/);
  assert.match(validateCatalog({ scenarios: [scen({ where: "both" })] }).join("\n"), /where must be branch or main/);
  assert.match(validateCatalog({ scenarios: [scen({ prompt: " " })] }).join("\n"), /prompt is empty/);
  assert.match(validateCatalog({ scenarios: [scen({ source: undefined })] }).join("\n"), /source is empty/);
});
test("catalog: pass rules are things code can read on GitHub, never a summary", () => {
  assert.match(validateCatalog({ scenarios: [scen({ pass: [] })] }).join("\n"), /at least one pass rule/);
  assert.match(validateCatalog({ scenarios: [scen({ pass: [{ type: "claude-says-ok" }] })] }).join("\n"), /unknown pass rule type/);
  const ok = [
    { type: "pr-state", state: "merged" },
    { type: "check", name: "check", conclusion: "success" },
    { type: "file", path: "a/b.txt", exists: false },
    { type: "file", path: "a/b.txt", contains: "x" },
    { type: "output", matches: "Tag v\\d+ is on origin" },
  ];
  assert.deepEqual(validateCatalog({ scenarios: [scen({ pass: ok })] }), []);
  const bad = (rule) => validateCatalog({ scenarios: [scen({ pass: [rule] })] }).join("\n");
  assert.match(bad({ type: "pr-state", state: "weird" }), /pr-state/);
  assert.match(bad({ type: "check", name: "" }), /check/);
  assert.match(bad({ type: "file", path: "a" }), /file rule needs exists/);
  assert.match(bad({ type: "output", matches: "(" }), /not a valid pattern/);
});
test("validate: a catalog fault shows up as a release data fault", () => {
  const d = studio([rec()]);
  writeFileSync(join(d, "releases/scenarios.json"), JSON.stringify({ scenarios: [scen({ prompt: "" })] }));
  assert.match(validate(d).join("\n"), /scenarios\.json: scenario "sync-fresh": prompt is empty/);
});
test("validate: a scenario named under branch checks is a branch scenario, under main checks a main one", () => {
  const d = studio([rec({ checks: { branch: ["m1"], main: [] } }), rec({ version: "0.3.1", kind: "loader", checks: { branch: ["b1"], main: ["b1"] }, status: { main: "pending" } })]);
  writeFileSync(join(d, "releases/scenarios.json"), JSON.stringify({ scenarios: [scen({ id: "m1", where: "main" }), scen({ id: "b1" })] }));
  const t = validate(d).join("\n");
  assert.match(t, /0\.3\.0\.json: "m1" is a main scenario but is listed under checks\.branch/);
  assert.match(t, /0\.3\.1\.json: "b1" is a branch scenario but is listed under checks\.main/);
});

test("floor: an app-facing release past 0.38.1 names a branch scenario or says none and why", () => {
  const floorRec = (o) => rec({ version: "0.39.0", ...o });
  assert.match(validateRecord(floorRec({ checks: { branch: [], main: [] } }), "0.39.0.json").join("\n"), /needs at least one branch scenario/);
  assert.deepEqual(validateRecord(floorRec({ checks: { branch: { none: "wording only" }, main: [] } }), "0.39.0.json"), []);
  assert.deepEqual(validateRecord(floorRec({ checks: { branch: ["a"], main: [] } }), "0.39.0.json"), []);
  assert.deepEqual(validateRecord(rec({ version: "0.38.1", checks: { branch: [], main: [] } }), "0.38.1.json"), []); // already released
  assert.deepEqual(validateRecord(floorRec({ kind: "internal", checks: { branch: [], main: [] } }), "0.39.0.json"), []);
});
test("floor: a loader release also names a main scenario", () => {
  const l = (o) => rec({ version: "0.39.0", kind: "loader", ...o });
  assert.match(validateRecord(l({ checks: { branch: ["a"], main: [] }, status: { main: "not needed" } }), "0.39.0.json").join("\n"), /loader release needs at least one main scenario/);
  assert.deepEqual(validateRecord(l({ checks: { branch: ["a"], main: ["t"] }, status: { main: "pending" } }), "0.39.0.json"), []);
});

test("the shipped catalog is valid and every scenario names where it runs, and none needs a fresh thread", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const c = JSON.parse(readFileSync(join(here, "../releases/scenarios.json"), "utf8"));
  assert.deepEqual(validateCatalog(c), []);
  assert.ok(c.scenarios.length >= 9);
  assert.ok(c.scenarios.every((s) => !("freshThread" in s)), "the runner cannot open a fresh thread");
  assert.ok(c.scenarios.some((s) => s.id === "sync-report-and-gate" && s.where === "main"));
  assert.deepEqual(validate(join(here, "..")), []);
});
