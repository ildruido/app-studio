// Run: node --test scripts/studio-sync.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { compare, drift, install, pull, readLock } from "./studio-sync.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "studio-sync-"));
let studio, app;

beforeEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  studio = join(tmp, "app-studio");
  app = join(tmp, "my-app");
  cpSync(join(repo, "plugins"), join(studio, "plugins"), { recursive: true });
  cpSync(join(repo, "scripts"), join(studio, "scripts"), { recursive: true });
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const sync = (...args) =>
  spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), ...args], {
    encoding: "utf8",
  });

test("install copies the managed files, the templates and a lock", () => {
  const r = install(app, studio);
  assert.deepEqual(r.skipped, []);
  for (const p of [
    ".claude/skills/build-feature/SKILL.md",
    ".claude/agents/reviewer.md",
    ".claude/hooks/check.mjs",
    ".claude/studio/studio-sync.mjs",
    "CLAUDE.md",
    ".claude/settings.json",
  ])
    assert.ok(existsSync(join(app, p)), p);
  const lock = readLock(app);
  assert.equal(lock.studio, JSON.parse(readFileSync(join(studio, "plugins/studio/.claude-plugin/plugin.json"))).version);
  assert.ok(!("CLAUDE.md" in lock.files), "templates are not managed");
  assert.equal(drift(compare(app, studio)), false);
});

test("install keeps an app's own CLAUDE.md", () => {
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "CLAUDE.md"), "mine\n");
  install(app, studio);
  assert.equal(readFileSync(join(app, "CLAUDE.md"), "utf8"), "mine\n");
});

test("check from the app copy finds a sibling app-studio and reports each kind of drift", () => {
  install(app, studio);
  assert.equal(sync("check").status, 0);

  writeFileSync(join(studio, "plugins/studio/agents/reviewer.md"), "changed in studio\n");
  writeFileSync(join(studio, "plugins/studio/agents/new-agent.md"), "new\n");
  writeFileSync(join(app, ".claude/agents/planner.md"), "edited here\n");
  rmSync(join(app, ".claude/agents/qa.md"));

  const r = compare(app, studio);
  assert.deepEqual(r.behind, [".claude/agents/reviewer.md"]);
  assert.deepEqual(r.added, [".claude/agents/new-agent.md"]);
  assert.deepEqual(r.edited, [".claude/agents/planner.md"]);
  assert.deepEqual(r.missing, [".claude/agents/qa.md"]);

  const out = sync("check");
  assert.equal(out.status, 1);
  assert.match(out.stdout, /behind app-studio: \.claude\/agents\/reviewer\.md/);
  assert.match(out.stdout, /harness-sync/);

  const warn = sync("check", "--warn");
  assert.equal(warn.status, 0);
  assert.match(warn.stdout, /out of step/);
});

test("check --warn is silent when in step, and without app-studio checks local edits only", () => {
  install(app, studio);
  assert.equal(sync("check", "--warn").stdout, "");
  rmSync(studio, { recursive: true });
  const out = sync("check");
  assert.equal(out.status, 0);
  assert.match(out.stdout, /app-studio not found/);
  writeFileSync(join(app, ".claude/hooks/check.mjs"), "// edited\n");
  assert.equal(sync("check").status, 1);
});

test("line endings alone are not an edit", () => {
  install(app, studio);
  const p = join(app, ".claude/agents/qa.md");
  writeFileSync(p, readFileSync(p, "utf8").replace(/\n/g, "\r\n"));
  assert.deepEqual(compare(app, studio).edited, []);
});

test("pull updates unedited files, keeps edited ones unless forced, and removes deleted ones", () => {
  install(app, studio);
  writeFileSync(join(studio, "plugins/studio/agents/reviewer.md"), "v2\n");
  writeFileSync(join(studio, "plugins/studio/agents/planner.md"), "v2\n");
  rmSync(join(studio, "plugins/studio/agents/qa.md"));
  writeFileSync(join(app, ".claude/agents/planner.md"), "local fix\n");

  const r = pull(app, studio);
  assert.deepEqual(r.written, [".claude/agents/reviewer.md"]);
  assert.deepEqual(r.skipped, [".claude/agents/planner.md"]);
  assert.deepEqual(r.deleted, [".claude/agents/qa.md"]);
  assert.equal(readFileSync(join(app, ".claude/agents/planner.md"), "utf8"), "local fix\n");
  assert.ok(!existsSync(join(app, ".claude/agents/qa.md")));

  pull(app, studio, { force: true });
  assert.equal(readFileSync(join(app, ".claude/agents/planner.md"), "utf8"), "v2\n");
  assert.equal(drift(compare(app, studio)), false);
});

test("pull won't overwrite an unmanaged file in the way unless forced", () => {
  cpSync(join(repo, "plugins/studio/agents/qa.md"), join(app, ".claude/agents/qa.md"));
  writeFileSync(join(app, ".claude/agents/reviewer.md"), "an older local reviewer\n");
  const r = install(app, studio);
  assert.deepEqual(r.skipped, [".claude/agents/reviewer.md"]);
  assert.ok(!r.written.includes(".claude/agents/qa.md"), "identical file is adopted, not rewritten");
  assert.ok(".claude/agents/qa.md" in readLock(app).files);
});

test("a corrupt or missing lock never fails a --warn check, and --force rebuilds it", () => {
  install(app, studio);
  writeFileSync(join(app, ".claude/studio/lock.json"), "{ not json");
  const warn = sync("check", "--warn");
  assert.equal(warn.status, 0);
  assert.match(warn.stdout, /check failed/);
  assert.throws(() => pull(app, studio), /--force/);
  pull(app, studio, { force: true });
  assert.equal(drift(compare(app, studio)), false);

  rmSync(join(app, ".claude/studio/lock.json"));
  assert.equal(sync("check", "--warn").status, 0);
  assert.equal(sync("check").status, 1);
  assert.equal(sync("check", "--bogus", "--warn").status, 0);
  assert.equal(sync("check", "--bogus").status, 2);
});

test("pull run from the app copy replaces the copy itself", () => {
  install(app, studio);
  writeFileSync(join(studio, "scripts/studio-sync.mjs"), readFileSync(join(studio, "scripts/studio-sync.mjs"), "utf8") + "\n// v2\n");
  const out = sync("pull");
  assert.equal(out.status, 0, out.stderr);
  assert.match(readFileSync(join(app, ".claude/studio/studio-sync.mjs"), "utf8"), /\/\/ v2/);
});

test("a file deleted upstream but edited here is kept unless forced", () => {
  install(app, studio);
  rmSync(join(studio, "plugins/studio/agents/qa.md"));
  writeFileSync(join(app, ".claude/agents/qa.md"), "local\n");
  assert.deepEqual(pull(app, studio).skipped, [".claude/agents/qa.md"]);
  assert.ok(existsSync(join(app, ".claude/agents/qa.md")));
  assert.deepEqual(pull(app, studio, { force: true }).deleted, [".claude/agents/qa.md"]);
});

test("install leaves an existing settings.json alone", () => {
  mkdirSync(join(app, ".claude"), { recursive: true });
  writeFileSync(join(app, ".claude/settings.json"), "{}\n");
  assert.ok(!install(app, studio).templates.includes(".claude/settings.json"));
  assert.equal(readFileSync(join(app, ".claude/settings.json"), "utf8"), "{}\n");
});
