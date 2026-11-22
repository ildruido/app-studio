// Run: node --test scripts/backlog.test.mjs
// Tests for the backlog upkeep script (plugins/studio/hooks/backlog.mjs): numbering new items and moving
// finished ones to Done. Written before the script (issue #182, item 3).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { addItem, finishItem, maxId, moveItem, nextId, roadmapAdd, roadmapRemove } from "../plugins/studio/hooks/backlog.mjs";

const CLI = resolve("plugins/studio/hooks/backlog.mjs");

const BACKLOG = `# Backlog

## Roadmap
- **Now:** AB-002
- **Next:** AB-003
- **Later:**

## In progress

## To test
### AB-002 Share a link
- Why: people share
- Acceptance criteria:
  - [x] A link is copied
  - [x] The link opens the page

## Ready
### AB-003 Dark mode
- Why: night use
- Acceptance criteria:
  - [ ] Toggle works

## Backlog

## Done
- AB-001 Home page — v0.1.0
`;
const DONE = `# Backlog: done

### AB-001 Home page
- Why: start
- Acceptance criteria:
  - [x] Shows hello
`;

test("nextId takes the highest id across every text and pads to 3 digits", () => {
  assert.equal(maxId("AB", [BACKLOG, DONE]), 3);
  assert.equal(nextId("AB", [BACKLOG, DONE, "### AB-011 other branch\n"]), "AB-012");
  assert.equal(nextId("AB", []), "AB-001");
  assert.equal(nextId("AB", ["- AB-004 to AB-009 Early work — v0.2.0"]), "AB-010");
});
test("nextId ignores other prefixes and ids only mentioned in prose", () => {
  assert.equal(nextId("AB", ["### CD-050 x\nsee AB-099 for more\n"]), "AB-001");
});

test("addItem puts a skeleton at the end of Backlog and leaves the rest alone", () => {
  const md = addItem(BACKLOG, { id: "AB-004", title: "Export", why: "keep data" });
  assert.match(md, /## Backlog\n+### AB-004 Export\n- Why: keep data\n- Acceptance criteria:\n {2}- \[ \] /);
  assert.ok(md.includes("### AB-003 Dark mode"));
  assert.ok(md.includes("## Done\n- AB-001 Home page — v0.1.0"));
});
test("a bug goes to the top of Ready with the bug template", () => {
  const md = addItem(BACKLOG, { id: "AB-004", title: "Bug: link 404s", bug: true, foundIn: "v0.2.0, step 3", steps: "open link", expected: "page", actual: "404" });
  const ready = md.split("## Ready\n")[1];
  assert.ok(ready.startsWith("### AB-004 Bug: link 404s\n- Found in: v0.2.0, step 3\n- Steps to reproduce: open link\n- Expected: page / Actual: 404\n- Acceptance criteria:\n  - [ ] The failing step now shows the expected result\n  - [ ] A regression test covers it\n"));
  assert.ok(ready.includes("### AB-003 Dark mode"));
});
test("addItem creates a missing section before Done", () => {
  const md = addItem("# Backlog\n\n## Done\n", { id: "AB-001", title: "First", why: "x", section: "Ready" });
  assert.match(md, /## Ready\n+### AB-001 First[\s\S]*## Done/);
});
test("addItem refuses an id that already exists", () => {
  assert.throws(() => addItem(BACKLOG, { id: "AB-003", title: "Dup", why: "x" }), /already/);
});

test("moveItem moves a whole item between sections", () => {
  const md = moveItem(BACKLOG, "AB-003", "In progress");
  assert.match(md, /## In progress\n+### AB-003 Dark mode\n- Why: night use[\s\S]*## To test/);
  assert.ok(!/## Ready\n+### AB-003/.test(md));
  assert.throws(() => moveItem(BACKLOG, "AB-999", "To test"), /AB-999/);
});

test("a section emptied by a move keeps its blank lines", () => {
  const md = moveItem(BACKLOG, "AB-003", "In progress");
  assert.match(md, /## Ready\n\n## Backlog/);
});
test("roadmapAdd and roadmapRemove edit the lane lines", () => {
  let md = roadmapAdd(BACKLOG, "AB-004", "later");
  assert.match(md, /- \*\*Later:\*\* AB-004\n/);
  md = roadmapAdd(md, "AB-005", "later");
  assert.match(md, /- \*\*Later:\*\* AB-004, AB-005\n/);
  assert.throws(() => roadmapAdd(md, "AB-005", "now"), /already/);
  md = roadmapRemove(md, "AB-003");
  assert.match(md, /- \*\*Next:\*\*\n/);
});
test("roadmapAdd creates the Roadmap section when missing", () => {
  const md = roadmapAdd("# Backlog\n\n## Ready\n", "AB-001", "now");
  assert.match(md, /## Roadmap\n- \*\*Now:\*\* AB-001\n- \*\*Next:\*\*\n- \*\*Later:\*\*\n/);
});

test("finishItem moves the full item to BACKLOG-DONE, keeps a title line, drops the roadmap id", () => {
  const r = finishItem(BACKLOG, DONE, "AB-002", "0.2.0");
  assert.ok(!r.md.includes("### AB-002"));
  assert.match(r.md, /## Done\n- AB-002 Share a link — v0\.2\.0\n- AB-001 Home page — v0\.1\.0/);
  assert.match(r.md, /- \*\*Now:\*\*\n/);
  assert.match(r.doneMd, /^# Backlog: done\n\n### AB-002 Share a link\n- Done in: v0\.2\.0\n- Why: people share[\s\S]*### AB-001 Home page/);
  assert.ok(r.doneMd.includes("  - [x] The link opens the page"));
});
test("finishItem refuses unticked criteria unless told to tick them", () => {
  assert.throws(() => finishItem(BACKLOG, DONE, "AB-003", "0.2.0"), /not ticked/);
  const r = finishItem(BACKLOG, DONE, "AB-003", "v0.2.0", { tick: true });
  assert.ok(r.doneMd.includes("- [x] Toggle works"));
});
test("finishItem rejects a bad version and an unknown id", () => {
  assert.throws(() => finishItem(BACKLOG, DONE, "AB-002", "soon"), /version/);
  assert.throws(() => finishItem(BACKLOG, DONE, "AB-777", "0.2.0"), /AB-777/);
});
test("finishItem works when BACKLOG-DONE.md does not exist yet", () => {
  const r = finishItem(BACKLOG, null, "AB-002", "0.2.0");
  assert.match(r.doneMd, /^# Backlog: done\n\n### AB-002 Share a link/);
});

// Command line, in a real git repo with a second branch that took a number.
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "backlog-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/BACKLOG.md"), BACKLOG);
  writeFileSync(join(dir, "docs/BACKLOG-DONE.md"), DONE);
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, git, run: (...a) => execFileSync("node", [CLI, ...a], { cwd: dir, encoding: "utf8" }) };
}
test("CLI next also sees ids taken on other remote branches", () => {
  const { dir, git, run } = repo();
  git("checkout", "-q", "-b", "other");
  writeFileSync(join(dir, "docs/BACKLOG.md"), BACKLOG + "\n### AB-009 Taken elsewhere\n");
  git("commit", "-qam", "other");
  git("update-ref", "refs/remotes/origin/other", "HEAD");
  git("checkout", "-q", "main");
  assert.equal(run("next", "AB").trim(), "AB-010");
});
test("CLI add, move and done change the files and print what happened", () => {
  const { dir, run } = repo();
  assert.match(run("add", "AB", "Export", "--why", "keep data", "--lane", "later"), /AB-004/);
  let md = readFileSync(join(dir, "docs/BACKLOG.md"), "utf8");
  assert.ok(md.includes("### AB-004 Export"));
  assert.match(md, /- \*\*Later:\*\* AB-004/);
  run("move", "AB-003", "In progress");
  run("done", "AB-002", "v0.2.0");
  md = readFileSync(join(dir, "docs/BACKLOG.md"), "utf8");
  assert.ok(md.includes("- AB-002 Share a link — v0.2.0"));
  assert.ok(readFileSync(join(dir, "docs/BACKLOG-DONE.md"), "utf8").includes("### AB-002 Share a link"));
});
test("CLI add asks for a lane when the app has the roadmap module", () => {
  const { dir, run } = repo();
  mkdirSync(join(dir, ".claude/packs/roadmap"), { recursive: true });
  assert.throws(() => run("add", "AB", "Export", "--why", "x"), (e) => /--lane/.test(e.stderr));
});
test("CLI prints usage for an unknown command and exits non-zero", () => {
  const { run } = repo();
  assert.throws(() => run("nope"), (e) => e.status === 1 && /Usage/.test(e.stderr));
});
