// Run: node --test scripts/coordinator.test.mjs
// Tests for the coordinator's queue view (scripts/coordinator.mjs, issue #276).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { area, blockedBy, collectHelp, dependsOn, dupes, table, triage } from "./coordinator.mjs";

const NOW = Date.parse("2026-11-26T00:00:00Z");
const iss = (number, title, labels, created_at = "2026-11-20T00:00:00Z", body = "") => ({ number, title, labels, created_at, body });
const FACTS = {
  issues: [
    iss(1, "[harness-idea] reviewer: skips big diffs", ["studio-backlog", "impact:safety"], "2026-11-10T00:00:00Z"),
    iss(2, "[harness-idea] release: slow tag step", ["harness-idea", "impact:daily-use"], "2026-11-24T00:00:00Z", "Depends on #1 and after #99."),
    iss(3, "[harness-idea] hooks: new capability", ["studio-backlog", "impact:capability"], "2026-11-01T00:00:00Z"),
    iss(4, "[harness-idea] reviewer: skips big diffs again", ["harness-idea"], "2026-11-15T00:00:00Z"),
    iss(5, "not an idea", ["bug"]),
  ],
  prs: [{ number: 50, title: "feat(release): faster tags" }, { number: 51, title: "docs: x", files: ["plugins/studio/agents/reviewer.md"] }],
};

test("area comes from the title prefix", () => {
  assert.equal(area("[harness-idea] coordinator: a script"), "coordinator");
  assert.equal(area("feat(release): x"), "release");
  assert.equal(area("no colon here"), "general");
});
test("depends on keeps only open issues", () => {
  const open = new Set([1, 2]);
  assert.deepEqual(dependsOn(FACTS.issues[1], open), [1]);
});
test("duplicates by title overlap; blocked by PR through files or title", () => {
  assert.deepEqual(dupes(FACTS.issues[0], FACTS.issues), [4]);
  assert.deepEqual(dupes(FACTS.issues[2], FACTS.issues), []);
  assert.deepEqual(blockedBy(FACTS.issues[1], FACTS.prs), [50]);
  assert.deepEqual(blockedBy(FACTS.issues[0], FACTS.prs), [51]);
});
test("table orders daily use, safety, capability, then unlabelled, and skips non-ideas", () => {
  const lines = table(FACTS, NOW).split("\n");
  const order = lines.filter((l) => /^\d+ \|/.test(l)).map((l) => l.split(" | ")[1].split(" ")[0]);
  assert.deepEqual(order, ["#2", "#1", "#3", "#4"]);
  assert.ok(!table(FACTS, NOW).includes("not an idea"));
  assert.match(lines.find((l) => /^\d+ \| #4 /.test(l)), /unlabelled/);
});
test("same impact: older first", () => {
  const f = { issues: [iss(7, "a: x", ["studio-backlog"], "2026-11-20T00:00:00Z"), iss(8, "b: y", ["studio-backlog"], "2026-11-01T00:00:00Z")] };
  assert.match(table(f, NOW).split("\n")[1], /#8/);
});
test("triage accept relabels, keeps other labels, one trail comment", () => {
  const out = triage(4, "accept", [], FACTS, { impact: "safety", why: "Hurts reviews.", date: "2026-11-26" });
  assert.match(out, /"labels":\["studio-backlog","impact:safety"\]/);
  assert.equal(out.split("\n").filter((l) => l.startsWith("mcp__github__add_issue_comment")).length, 1);
  assert.match(out, /Accepted \(triage 2026-11-26\)\. Hurts reviews\./);
  assert.throws(() => triage(4, "accept", [], FACTS, { impact: "x" }), /--impact/);
});
test("triage merge and decline leave exactly one comment on the closed issue", () => {
  const m = triage(4, "merge", ["1"], FACTS);
  assert.match(m, /Duplicate of #1/);
  assert.match(m, /"duplicate_of":1/);
  assert.throws(() => triage(4, "merge", [], FACTS));
  const d = triage(4, "decline", ["Out", "of", "scope"], FACTS);
  assert.match(d, /Declined: Out of scope/);
  assert.match(d, /not_planned/);
  assert.throws(() => triage(4, "decline", [], FACTS));
});
test("without facts it prints the calls; the CLI renders a table from a facts file", () => {
  assert.match(collectHelp(), /list_issues/);
  const dir = mkdtempSync(join(tmpdir(), "coord-"));
  const f = join(dir, "facts.json");
  writeFileSync(f, JSON.stringify(FACTS));
  const out = execFileSync("node", [resolve("scripts/coordinator.mjs"), "next", "--facts", f], { encoding: "utf8" });
  assert.match(out, /rank \| issue/);
  assert.match(execFileSync("node", [resolve("scripts/coordinator.mjs"), "next"], { encoding: "utf8" }), /Collect the raw queue/);
});
