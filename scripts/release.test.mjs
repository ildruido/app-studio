// Run: node --test scripts/release.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { actions, details, gate, loadAll, newRecord, parseLegacy, passMain, pending, render, scenarios, summary, validate, validateRecord } from "./release.mjs";

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
