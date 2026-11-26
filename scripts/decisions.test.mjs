// Run: node --test scripts/decisions.test.mjs
// Tests for the decision log script (plugins/studio/hooks/decisions.mjs): numbering, dating, superseding.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { addDecision, listDecisions, logPath, markSuperseded, maxDecision, nextDecisionId, showDecision } from "../plugins/studio/hooks/decisions.mjs";

const CLI = resolve("plugins/studio/hooks/decisions.mjs");
const PRD = `# PRD

## Goal
Something.

## Decisions

### D-002 Use a list (2026-01-02)
- Status: Active
- Decision: a list
- Why: simple
- Decided by: Ale

### D-001 Use a grid (2026-01-01)
- Decision: a grid
- Why: pretty
- Decided by: Ale

## Change log
- start
`;
const fields = { id: "D-003", title: "Dark mode", decision: "Yes", why: "Night use", by: "Ale", date: "2026-02-03" };

test("next id is one above the highest mentioned anywhere, padded", () => {
  assert.equal(nextDecisionId([PRD]), "D-003");
  assert.equal(nextDecisionId(["", "see D-010 on another branch", PRD]), "D-011");
  assert.equal(nextDecisionId([""]), "D-001");
  assert.equal(maxDecision(["XD-9 and D-4"]), 4);
});

test("add puts the entry at the top of Decisions with date and fixed fields, nothing else moves", () => {
  const out = addDecision(PRD, fields);
  assert.match(out, /## Decisions\n\n### D-003 Dark mode \(2026-02-03\)\n- Status: Active\n- Decision: Yes\n- Why: Night use\n- Decided by: Ale\n\n### D-002/);
  assert.ok(out.endsWith("## Change log\n- start\n"));
  assert.throws(() => addDecision(out, fields), /already exists/);
});

test("add creates the Decisions section in a PRD without one, and writes to the top of a log of its own", () => {
  assert.match(addDecision("# PRD\n\n## Goal\nx\n", fields), /## Goal\nx\n\n## Decisions\n\n### D-003/);
  const own = addDecision("# Decision log\n\nIntro line.\n\n### D-001 Old (2026-01-01)\n- Decision: x\n", fields, { own: true });
  assert.ok(own.indexOf("### D-003") < own.indexOf("### D-001"));
  assert.match(own, /^# Decision log\n\nIntro line\.\n\n### D-003/);
  // Lead text under "## Decisions" stays above the entries, and blank runs elsewhere (a code fence) are left alone.
  const lead = addDecision("# P\n\n```\na\n\n\n\nb\n```\n\n## Decisions\n\nHow we decide.\n\n### D-001 Old (2026-01-01)\n- Decision: x\n\n## Change log\n- s\n", fields);
  assert.match(lead, /a\n\n\n\nb/);
  assert.match(lead, /How we decide\.\n\n### D-003[\s\S]*\n\n### D-001/);
  assert.doesNotMatch(showDecision(lead, "D-001"), /Change log/);
  assert.doesNotMatch(showDecision(lead, "D-003"), /How we decide/);
});

test("supersede sets only the old entry's status line, adding one when missing", () => {
  let out = markSuperseded(PRD, "D-002", "D-003", "2026-02-03");
  assert.match(out, /### D-002 Use a list \(2026-01-02\)\n- Status: Superseded by D-003 \(2026-02-03\)\n- Decision: a list/);
  out = markSuperseded(out, "D-001", "D-003", "2026-02-03");
  assert.match(out, /### D-001 Use a grid \(2026-01-01\)\n- Status: Superseded by D-003 \(2026-02-03\)\n- Decision: a grid\n- Why: pretty/);
  assert.throws(() => markSuperseded(out, "D-001", "D-004", "2026-02-04"), /already superseded/);
  assert.throws(() => markSuperseded(PRD, "D-009", "D-010", "2026-02-04"), /not in the decision log/);
});

test("list hides superseded ones unless --all; show prints one entry", () => {
  const out = markSuperseded(PRD, "D-001", "D-002", "2026-02-03");
  assert.deepEqual(listDecisions(out), ["D-002 Use a list (2026-01-02)"]);
  assert.equal(listDecisions(out, { all: true }).length, 2);
  assert.match(showDecision(out, "D-001"), /^### D-001 Use a grid[\s\S]*Superseded by D-002/);
  assert.throws(() => showDecision(out, "D-077"), /not in the decision log/);
});

test("the log path comes from the App profile's Decision log row", () => {
  assert.equal(logPath(""), "docs/PRD.md");
  assert.equal(logPath("## App profile\n| Decision log | `docs/PRD.md` \"Decisions\" (default) |\n"), "docs/PRD.md");
  assert.equal(logPath("## App profile\n| Decision log | `docs/inception/DECISIONS.md` |\n"), "docs/inception/DECISIONS.md");
  assert.equal(logPath("## App profile\n| Decision log | docs/log.md (own) |\n"), "docs/log.md");
});

const run = (cwd, ...args) => execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" }).trim();
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

test("two parallel threads cannot both keep the same id: the second sees the first's branch", () => {
  const root = mkdtempSync(join(tmpdir(), "dec-"));
  const origin = join(root, "origin.git");
  const a = join(root, "a");
  const b = join(root, "b");
  git(root, "init", "-q", "--bare", origin);
  git(root, "clone", "-q", origin, a);
  git(a, "config", "user.email", "t@t");
  git(a, "config", "user.name", "t");
  mkdirSync(join(a, "docs"));
  writeFileSync(join(a, "docs/PRD.md"), PRD);
  git(a, "add", "-A");
  git(a, "commit", "-qm", "base");
  git(a, "push", "-q", "origin", "HEAD:main");
  git(root, "clone", "-q", origin, b);
  git(b, "checkout", "-qb", "thread-b", "origin/main");
  // Thread A takes the next id on its own branch and pushes it; thread B has not fetched yet.
  git(a, "checkout", "-qb", "thread-a");
  assert.equal(run(a, "add", "From A", "--decision", "x", "--why", "y", "--by", "z").split(" ")[0], "D-003");
  git(a, "commit", "-qam", "a");
  git(a, "push", "-q", "origin", "thread-a");
  assert.equal(run(b, "next"), "D-003");
  assert.equal(run(b, "next", "--fetch"), "D-004");
  assert.equal(run(b, "add", "From B", "--fetch", "--decision", "x", "--why", "y", "--by", "z").split(" ")[0], "D-004");
  const idsOf = (d) => [...readFileSync(join(d, "docs/PRD.md"), "utf8").matchAll(/^### (D-\d+)/gm)].map((m) => m[1]);
  assert.ok(idsOf(a).includes("D-003") && !idsOf(a).includes("D-004"));
  assert.ok(idsOf(b).includes("D-004") && !idsOf(b).includes("D-003"));
});

test("the command line adds and supersedes in the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dec-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/PRD.md"), PRD);
  run(dir, "add", "Dark mode", "--decision", "Yes", "--why", "Night", "--by", "Ale", "--date", "2026-02-03");
  assert.match(run(dir, "supersede", "D-003", "Light mode", "--decision", "No", "--why", "Sun", "--by", "Ale"), /D-004 added; D-003 is now superseded/);
  const md = readFileSync(join(dir, "docs/PRD.md"), "utf8");
  assert.match(md, /### D-003 Dark mode \(2026-02-03\)\n- Status: Superseded by D-004/);
  assert.match(md, /- Supersedes: D-003/);
  assert.match(run(dir, "list"), /D-004 Light mode/);
  assert.throws(() => run(dir, "bogus"));
});
