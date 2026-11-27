// Run: node --test scripts/stats.test.mjs
// `studio-sync.mjs stats`: counts only what an app's repo and the hook log record, checked against a small app built by hand.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { backlogSections, bugItems, collectStats, hookLogStats, statsSummary } from "./studio-sync.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "studio-sync.mjs");
const tmp = mkdtempSync(join(tmpdir(), "studio-stats-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const DAY = 86400;
const T0 = 1_700_000_000;

test("backlogSections reads items and Done title lines by section", () => {
  const md = "# Backlog\n\n## In progress\n\n### XX-002 Two\n- Why: x\n\n## Done\n\n- XX-001 One — v0.1.0\n";
  assert.deepEqual([...backlogSections(md)], [["XX-002", "In progress"], ["XX-001", "Done"]]);
  assert.deepEqual([...backlogSections(null)], []);
});

test("bugItems keeps Found in, ignores TODO, and lists the other items a bug names", () => {
  const md = "### XX-005 Bug: save fails\n- Found in: v0.2.0, step 4\n- Steps to reproduce: after XX-001 shipped\n\n### XX-006 Bug: crash\n- Found in: TODO\n- Steps to reproduce: open\n";
  const bugs = bugItems([md]);
  assert.deepEqual(bugs.get("XX-005"), { foundIn: "v0.2.0, step 4", names: ["XX-001"] });
  assert.equal(bugs.get("XX-006").foundIn, "");
});

test("hookLogStats counts blocks by hook and the models that ran", () => {
  const log = [
    "2026-11-27T05:00:00Z loader 0.48.1",
    "2026-11-27T05:00:00Z write exit=2",
    "2026-11-27T05:00:01Z merge exit=0",
    "2026-11-27T05:00:02Z studio test exit=2",
    "2026-11-27T05:00:03Z subagent reviewer model=claude-sonnet-5-5 effort=medium",
    "2026-11-27T05:00:04Z skill build-feature before=prompt model=claude-sonnet-5-5 effort=medium",
    "2026-11-27T05:00:05Z skill release before=prompt model=unknown effort=unknown",
    "garbage",
  ].join("\n");
  assert.deepEqual(hookLogStats(log), { hooks: 3, blocks: { write: 1, test: 1 }, ran: { "claude-sonnet-5-5 at medium effort": 2, "unknown at unknown effort": 1 } });
});

test("stats on a small app: items, median days, releases, PRs, bugs, hooks, and --json", () => {
  const app = join(tmp, "app");
  mkdirSync(join(app, "docs"), { recursive: true });
  const git = (...a) => spawnSync("git", ["-C", app, ...a], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  const commit = (when, msg, files) => {
    for (const [f, t] of Object.entries(files)) writeFileSync(join(app, f), t);
    git("add", "-A");
    spawnSync("git", ["-C", app, "commit", "-q", "-m", msg], { env: { ...process.env, GIT_AUTHOR_DATE: `${when} +0000`, GIT_COMMITTER_DATE: `${when} +0000` } });
  };
  const item = (id, t) => `### ${id} ${t}\n- Why: x\n`;
  commit(T0, "docs: backlog (#1)", { "docs/BACKLOG.md": `# Backlog\n\n## In progress\n\n${item("XX-001", "One")}\n${item("XX-002", "Two")}\n## Done\n\n` });
  commit(T0 + 2 * DAY, "feat: one (#2)", { "docs/BACKLOG.md": `# Backlog\n\n## In progress\n\n${item("XX-002", "Two")}\n## Done\n\n- XX-001 One — v0.1.0\n` });
  commit(T0 + 6 * DAY, "feat: two (#3)", { "docs/BACKLOG.md": `# Backlog\n\n## Ready\n\n### XX-003 Bug: broke\n- Found in: v0.1.0, step 2\n- Steps to reproduce: after XX-001\n\n## Done\n\n- XX-001 One — v0.1.0\n- XX-002 Two — v0.2.0\n` });
  writeFileSync(join(app, "CHANGELOG.md"), "# Changelog\n\n## [0.2.0] - x\n\n## [0.1.0] - x\n");
  git("tag", "v0.1.0");
  const log = join(tmp, "hooks.log");
  writeFileSync(log, "2026-11-27T05:00:00Z write exit=2\n2026-11-27T05:00:01Z subagent qa model=m effort=e\n");
  const s = collectStats(app, { STUDIO_HOOK_LOG: log });
  assert.equal(s.itemsDone, 2);
  assert.deepEqual(s.daysInProgress, { items: 2, median: 4 }, "XX-001 took 2 days and XX-002 took 6");
  assert.equal(s.releases, 2, "the changelog names 0.2.0 too, which has no tag yet");
  assert.equal(s.prsMerged, 3);
  assert.deepEqual(s.bugs, { total: 1, withFoundIn: 1, cameBack: 1 });
  assert.deepEqual(s.hookLog, { hooks: 1, blocks: { write: 1 }, ran: { "m at e effort": 1 } });
  const text = statsSummary(s);
  for (const part of [/Items done: 2/, /Releases: 2\. Pull requests merged: 3/, /Median time[^\n]*4 days \(over 2 items\)/, /Bugs the Tester found: 1 \(1 with a "Found in"\); 1 named/, /blocks: write 1/, /m at e effort \(1\)/, /Rounds per item are not recorded/])
    assert.match(text, part);
  const run = (...a) => spawnSync("node", [cli, "stats", "--app", app, ...a], { encoding: "utf8", env: { ...process.env, STUDIO_HOOK_LOG: log } });
  const plain = run();
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(plain.stdout.trim(), text);
  assert.deepEqual(JSON.parse(run("--json").stdout), s);
});

test("stats on an empty folder says what is missing and changes nothing", () => {
  const bare = join(tmp, "bare");
  mkdirSync(bare);
  const r = spawnSync("node", [cli, "stats", "--app", bare], { encoding: "utf8", env: { ...process.env, STUDIO_HOOK_LOG: join(tmp, "none.log") } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no docs\/BACKLOG\.md/);
  assert.match(r.stdout, /not a git repository/);
  assert.match(r.stdout, /no hook log/);
});
