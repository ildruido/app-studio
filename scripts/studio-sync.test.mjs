// Run: node --test scripts/studio-sync.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ack,
  addPacks,
  compare,
  drift,
  install,
  listPacks,
  packClosure,
  pull,
  readLock,
  removePacks,
} from "./studio-sync.mjs";

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

/** An app whose App profile is filled in, so the placeholder note doesn't show. */
const fillProfile = () =>
  writeFileSync(join(app, "CLAUDE.md"), "# Demo\n\n## App profile\n\n| App | Demo |\n\n## Roles\n");

test("check names App profile placeholders that were never filled in", () => {
  install(app, studio);
  assert.match(sync("check").stdout, /unfilled placeholders[\s\S]*<App name>/);
  fillProfile();
  assert.doesNotMatch(sync("check").stdout, /placeholders/);
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
  fillProfile();
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

// ---------- stack packs ----------

function writePack(name, { version = "1.0.0", requires = [], managed = {}, starter = {}, packageJson } = {}) {
  const dir = join(studio, "packs", name);
  const put = (base, files) =>
    Object.entries(files).forEach(([path, text]) => {
      mkdirSync(dirname(join(dir, base, path)), { recursive: true });
      writeFileSync(join(dir, base, path), text);
    });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pack.json"), JSON.stringify({ name, version, requires, packageJson }));
  put("managed", managed);
  put("starter", starter);
}

function twoPacks() {
  writePack("base", {
    managed: { "STACK.md": "base notes\n" },
    starter: { "src/main.ts": "// {{title}}\n", ".gitignore": "node_modules/\n" },
    packageJson: { scripts: { test: "vitest run" }, devDependencies: { vite: "^8.0.0" } },
  });
  writePack("web", {
    requires: ["base"],
    managed: { "QA.md": "web qa\n" },
    starter: { ".github/workflows/ci.yml": "name: {{slug}} CI\n" },
    packageJson: { scripts: { build: "vite build", test: "other" } },
  });
}

test("pack add installs requirements first, fills in the name, and writes dotfiles", () => {
  twoPacks();
  install(app, studio);
  const r = addPacks(app, studio, ["web"], { slug: "my-app", title: "My App" });
  assert.deepEqual(r.added, ["base", "web"]);
  assert.equal(readFileSync(join(app, "src/main.ts"), "utf8"), "// My App\n");
  assert.equal(readFileSync(join(app, ".github/workflows/ci.yml"), "utf8"), "name: my-app CI\n");
  assert.ok(existsSync(join(app, ".gitignore")));
  assert.ok(existsSync(join(app, ".claude/packs/base/STACK.md")));
  assert.ok(existsSync(join(app, ".claude/packs/web/QA.md")));

  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(pkg.name, "my-app");
  assert.deepEqual(pkg.scripts, { test: "vitest run", build: "vite build" }, "an existing key is never overwritten");
  assert.deepEqual(pkg.devDependencies, { vite: "^8.0.0" });

  const lock = readLock(app);
  assert.deepEqual(lock.packs, { base: "1.0.0", web: "1.0.0" });
  assert.deepEqual(lock.app, { slug: "my-app", title: "My App" });
  assert.deepEqual(Object.keys(lock.starters), [".github/workflows/ci.yml", ".gitignore", "src/main.ts"]);
  assert.equal(drift(compare(app, studio)), false);
  assert.deepEqual(compare(app, studio).starters, []);
});

test("pack add keeps a starter file the app already has, and adding again is a no-op", () => {
  twoPacks();
  install(app, studio);
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src/main.ts"), "// mine\n");
  const r = addPacks(app, studio, ["base"], { slug: "x", title: "X" });
  assert.deepEqual(r.kept, ["src/main.ts"]);
  assert.equal(readFileSync(join(app, "src/main.ts"), "utf8"), "// mine\n");
  assert.ok(!(("src/main.ts") in readLock(app).starters));
  const again = addPacks(app, studio, ["base"]);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.created, []);
  assert.equal(readLock(app).app.slug, "x", "the name chosen first is kept");
});

test("a managed pack file that changes upstream is drift; pull brings it in", () => {
  twoPacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  writeFileSync(join(studio, "packs/web/managed/QA.md"), "web qa v2\n");
  assert.deepEqual(compare(app, studio).behind, [".claude/packs/web/QA.md"]);
  pull(app, studio);
  assert.equal(readFileSync(join(app, ".claude/packs/web/QA.md"), "utf8"), "web qa v2\n");
  assert.equal(drift(compare(app, studio)), false);
});

test("a starter changed upstream is a note: refreshed when unedited, left alone when edited, cleared by ack", () => {
  twoPacks();
  install(app, studio);
  fillProfile();
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  writeFileSync(join(studio, "packs/web/starter/.github/workflows/ci.yml"), "name: {{slug}} CI v2\n");
  writeFileSync(join(studio, "packs/base/starter/src/main.ts"), "// {{title}} v2\n");
  writeFileSync(join(app, "src/main.ts"), "// my own code\n");

  const r = compare(app, studio);
  assert.equal(drift(r), false, "starters never count as drift");
  assert.deepEqual(r.starters, [
    { path: ".github/workflows/ci.yml", pack: "web", refreshable: true },
    { path: "src/main.ts", pack: "base", refreshable: false },
  ]);
  const out = sync("check", "--warn");
  assert.match(out.stdout, /starter files changed/);
  assert.equal(out.status, 0);

  const p = pull(app, studio);
  assert.deepEqual(p.refreshed, [".github/workflows/ci.yml"]);
  assert.deepEqual(p.starterNotes, ["src/main.ts"]);
  assert.equal(readFileSync(join(app, ".github/workflows/ci.yml"), "utf8"), "name: a CI v2\n");
  assert.equal(readFileSync(join(app, "src/main.ts"), "utf8"), "// my own code\n");
  assert.deepEqual(compare(app, studio).starters.map((n) => n.path), ["src/main.ts"]);

  assert.deepEqual(ack(app, studio), ["src/main.ts"]);
  assert.deepEqual(compare(app, studio).starters, []);
  assert.equal(sync("check", "--warn").stdout, "");
});

test("pack remove drops a pack's managed files and lock entries, and keeps the app's own files", () => {
  twoPacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  const r = removePacks(app, studio, ["web"]);
  assert.deepEqual(r.deleted, [".claude/packs/web/QA.md"]);
  assert.deepEqual(r.startersKept, [".github/workflows/ci.yml"]);
  assert.ok(!existsSync(join(app, ".claude/packs/web/QA.md")));
  assert.ok(existsSync(join(app, ".github/workflows/ci.yml")));
  assert.ok(existsSync(join(app, ".claude/packs/base/STACK.md")));
  assert.deepEqual(Object.keys(readLock(app).packs), ["base"]);
});

test("pack remove refuses a required pack, an unknown pack, and an edited file without --force", () => {
  twoPacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  assert.throws(() => removePacks(app, studio, ["base"]), /requires "base"/);
  assert.throws(() => removePacks(app, studio, ["nope"]), /no pack named "nope"/);
  writeFileSync(join(app, ".claude/packs/web/QA.md"), "mine\n");
  const r = removePacks(app, studio, ["web"]);
  assert.deepEqual(r.skipped, [".claude/packs/web/QA.md"]);
  assert.ok("web" in readLock(app).packs);
  removePacks(app, studio, ["web"], { force: true });
  assert.ok(!("web" in readLock(app).packs));
});

test("pack problems are reported clearly", () => {
  twoPacks();
  install(app, studio);
  assert.throws(() => addPacks(app, studio, ["nope"]), /No pack named "nope"/);
  assert.throws(() => addPacks(app, studio, []), /Name at least one pack/);
  writePack("a", { requires: ["b"] });
  writePack("b", { requires: ["a"] });
  assert.throws(() => packClosure(studio, ["a"]), /loop/);
  writePack("c", { starter: { "src/main.ts": "x" } });
  assert.throws(() => addPacks(app, studio, ["base", "c"]), /both ship src\/main\.ts/);
});

test("pack add from the command line", () => {
  twoPacks();
  install(app, studio);
  const out = sync("pack", "add", "web", "--slug", "demo", "--title", "Demo");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Packs added.*base, web/);
  assert.ok(existsSync(join(app, ".github/workflows/ci.yml")));
});

test("every real pack installs cleanly and fills in every placeholder", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  const names = listPacks(studio);
  assert.deepEqual(names, ["artifact", "base", "mirror", "web"]);
  install(app, studio);
  const r = addPacks(app, studio, ["web", "artifact", "mirror"], { slug: "demo-app", title: "Demo App" });
  assert.deepEqual(r.kept, [], "base, web, artifact and mirror never ship the same file");
  assert.equal(drift(compare(app, studio)), false);
  const left = Object.keys(readLock(app).starters).filter((p) => /\{\{(slug|title)\}\}/.test(readFileSync(join(app, p), "utf8")));
  assert.deepEqual(left, []);
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(pkg.scripts["build:web"] !== undefined && pkg.scripts["build:artifact"] !== undefined, true);
  assert.equal(pkg.scripts.build, "npm run build:web", "the first pack named decides what build means");
});

test("names are validated, the first name sticks, and ack takes backslash paths", () => {
  twoPacks();
  install(app, studio);
  assert.throws(() => addPacks(app, studio, ["base"], { slug: "My App", title: "X" }), /--slug/);
  assert.throws(() => addPacks(app, studio, ["base"], { slug: "ok", title: 'Say "hi"' }), /--title/);
  addPacks(app, studio, ["base"], { slug: "first", title: "A B" });
  assert.equal(readFileSync(join(app, "src/main.ts"), "utf8"), "// A B\n");
  addPacks(app, studio, ["web"], { slug: "second", title: "Other" });
  assert.equal(readLock(app).app.slug, "first");
  assert.match(readFileSync(join(app, ".github/workflows/ci.yml"), "utf8"), /first CI/);

  writeFileSync(join(studio, "packs/base/starter/src/main.ts"), "// {{title}} v2\n");
  writeFileSync(join(app, "src/main.ts"), "mine\n");
  assert.deepEqual(ack(app, studio, ["src\\main.ts"]), ["src/main.ts"]);
});

test("a locked pack that vanished from app-studio stops pull before any file moves", () => {
  twoPacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  rmSync(join(studio, "packs/web"), { recursive: true });
  assert.throws(() => pull(app, studio), /No pack named "web"/);
  assert.ok(existsSync(join(app, ".claude/packs/web/QA.md")));
});

// ---------- harness health (pre-commit hook and CI) ----------

const health = () => sync("health");
const hook = (command) =>
  spawnSync(process.execPath, [join(app, ".claude/hooks/check.mjs"), "commit"], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { command } }),
  });

test("health passes on a fresh install with a filled App profile", () => {
  install(app, studio);
  fillProfile();
  const out = health();
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /is healthy/);
});

test("health fails on an unfilled profile, an edited or missing shared file, and a missing hook", () => {
  install(app, studio);
  assert.match(health().stdout, /placeholder/);
  fillProfile();
  writeFileSync(join(app, ".claude/skills/release/SKILL.md"), "changed\n");
  rmSync(join(app, ".claude/agents/qa.md"));
  const settings = JSON.parse(readFileSync(join(app, ".claude/settings.json"), "utf8"));
  delete settings.hooks.PreToolUse;
  writeFileSync(join(app, ".claude/settings.json"), JSON.stringify(settings));
  const out = health();
  assert.equal(out.status, 1);
  assert.match(out.stdout, /edited here.*release\/SKILL\.md/);
  assert.match(out.stdout, /missing here.*agents\/qa\.md/);
  assert.match(out.stdout, /PreToolUse hook "hooks\/check\.mjs commit"/);
  assert.doesNotMatch(out.stdout, /placeholder/);
});

test("health checks the app's own skills and agents, and its doc links", () => {
  install(app, studio);
  fillProfile();
  const put = (path, text) => {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), text);
  };
  put(".claude/skills/good/SKILL.md", "---\nname: good\ndescription: Does a thing.\n---\n");
  put(".claude/agents/helper.md", "---\nname: helper\ndescription: Helps.\n---\n");
  put("docs/PRD.md", "See [backlog](BACKLOG.md), [site](https://x.dev), [top](#top) and `[code](nope.md)`.\n");
  put("docs/BACKLOG.md", "Back to [the PRD](./PRD.md#goals).\n");
  assert.equal(health().status, 0, health().stdout);

  put(".claude/skills/empty/notes.md", "no skill file\n");
  put(".claude/skills/bad/SKILL.md", "no front matter\n");
  put(".claude/skills/dupe/SKILL.md", "---\nname: release\ndescription: Clash.\n---\n");
  put(".claude/agents/vague.md", "---\nname: vague\n---\n");
  put("docs/BACKLOG.md", "Back to [the spec](SPEC.md).\n");
  const out = health();
  assert.equal(out.status, 1);
  assert.match(out.stdout, /skills\/empty: a skill folder needs a SKILL\.md/);
  assert.match(out.stdout, /skills\/bad\/SKILL\.md: front matter needs/);
  assert.match(out.stdout, /skill name "release" clashes/);
  assert.match(out.stdout, /agents\/vague\.md: front matter needs/);
  assert.match(out.stdout, /docs\/BACKLOG\.md: broken link to SPEC\.md/);
  assert.doesNotMatch(out.stdout, /PRD\.md: broken/);
});

test("being behind app-studio is a note, never a health failure", () => {
  install(app, studio);
  fillProfile();
  writeFileSync(join(studio, "plugins/studio/skills/release/SKILL.md"), "newer upstream\n");
  const out = health();
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /note: behind app-studio/);
});

test("the app copy finds app-studio cloned beside it under another name", () => {
  install(app, studio);
  fillProfile();
  const other = join(tmp, "studio-clone");
  cpSync(studio, other, { recursive: true });
  rmSync(studio, { recursive: true, force: true });
  writeFileSync(join(other, "plugins/studio/skills/release/SKILL.md"), "newer upstream\n");
  assert.match(sync("check").stdout, /behind app-studio/);
});

test("the commit hook blocks a git commit while the harness is unhealthy, and nothing else", () => {
  install(app, studio);
  for (const cmd of ["git commit -m x", "git add -A && git commit -m x", "git -C . commit --amend"]) {
    const out = hook(cmd);
    assert.equal(out.status, 2, cmd);
    assert.match(out.stderr, /Commit blocked[\s\S]*placeholder/);
  }
  for (const cmd of ["git status", "git log --grep commit", "npm test"]) assert.equal(hook(cmd).status, 0, cmd);
  fillProfile();
  assert.equal(hook("git commit -m x").status, 0);
});

test("a real app with every pack is healthy once its profile is filled", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  addPacks(app, studio, ["web", "artifact", "mirror"], { slug: "demo-app", title: "Demo App" });
  fillProfile();
  const out = health();
  assert.equal(out.status, 0, out.stdout);
  assert.ok(existsSync(join(app, ".github/workflows/harness.yml")));
});

// --- Hooks that must hold wherever a session starts (0.5.0) ---

const env = (extra = {}) => {
  const e = { ...process.env, ...extra };
  delete e.CI;
  if (!("CLAUDE_CODE_REMOTE" in extra)) delete e.CLAUDE_CODE_REMOTE;
  return e;
};
const git = (...args) => spawnSync("git", ["-C", app, ...args], { encoding: "utf8", env: env() });
const gitApp = (origin = "https://github.com/ildruido/my-app.git") => {
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("remote", "add", "origin", origin);
};
const runHook = (mode, payload) =>
  spawnSync(process.execPath, [join(app, ".claude/hooks/check.mjs"), mode], {
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: env(),
  });
const settingsHooks = (file) => JSON.parse(readFileSync(file, "utf8")).hooks;
const commandsOf = (hooks) => Object.values(hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));

test("the template wires every hook the health check requires", () => {
  const cmds = commandsOf(settingsHooks(join(repo, "plugins/studio/templates/settings.json")));
  for (const need of ["cloud-setup.mjs", "studio-sync.mjs check", "check.mjs commit", "check.mjs merge", "check.mjs write", "check.mjs lint", "check.mjs test"])
    assert.ok(cmds.some((c) => c.includes(need)), need);
});

test("health fails when the merge or write hook is missing", () => {
  install(app, studio);
  fillProfile();
  const file = join(app, ".claude/settings.json");
  const s = JSON.parse(readFileSync(file, "utf8"));
  s.hooks.PreToolUse = s.hooks.PreToolUse.filter((g) => g.matcher === "Bash");
  writeFileSync(file, JSON.stringify(s));
  const out = health();
  assert.equal(out.status, 1);
  assert.match(out.stdout, /hooks\/check\.mjs merge/);
  assert.match(out.stdout, /hooks\/check\.mjs write/);
});

test("a real git commit runs the health check once any studio-sync command has run", () => {
  install(app, studio);
  gitApp();
  // install alone doesn't turn it on in the test env; check does, like the session-start hook.
  const on = spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "check"], { encoding: "utf8", env: env() });
  assert.match(on.stdout, /turned on the git pre-commit health check/);
  assert.equal(git("config", "--get", "core.hooksPath").stdout.trim(), ".claude/hooks");
  git("add", "-A");
  const bad = git("commit", "-qm", "unhealthy");
  assert.notEqual(bad.status, 0, "an unfilled profile must block the commit");
  assert.match(`${bad.stdout}${bad.stderr}`, /health check failed/);
  fillProfile();
  git("add", "-A");
  const good = git("commit", "-qm", "healthy");
  assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);
});

test("a foreign core.hooksPath is left alone and reported", () => {
  install(app, studio);
  gitApp();
  git("config", "core.hooksPath", ".husky");
  const out = spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "hooks"], { encoding: "utf8", env: env() });
  assert.match(out.stdout, /core\.hooksPath is "\.husky"/);
  assert.equal(git("config", "--get", "core.hooksPath").stdout.trim(), ".husky");
});

test("in a cloud session the app's hooks are forwarded to the parent folder, once", () => {
  install(app, studio);
  const run = () =>
    spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "hooks"], {
      encoding: "utf8",
      env: env({ CLAUDE_CODE_REMOTE: "true" }),
    });
  const parent = join(tmp, ".claude/settings.json");
  writeFileSync(join(tmp, "keep.txt"), "");
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(parent, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }));
  assert.match(run().stdout, /forwarded the app's hooks/);
  assert.doesNotMatch(run().stdout, /forwarded/, "a second run changes nothing");
  const cmds = commandsOf(settingsHooks(parent));
  assert.ok(cmds.includes("echo mine"), "other hooks are kept");
  for (const mode of ["merge", "write", "lint", "test"])
    assert.equal(cmds.filter((c) => c.includes("my-app/.claude/hooks/check.mjs") && c.endsWith(` ${mode}`)).length, 1, mode);
});

test("the merge hook blocks until the PR's checks were read after the last push and are all green", () => {
  install(app, studio);
  gitApp();
  const transcript = join(tmp, "t.jsonl");
  const pr = { owner: "ildruido", repo: "my-app", pullNumber: 7 };
  let n = 0;
  const lines = [];
  const use = (name, input) => {
    const id = `t${n++}`;
    lines.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }));
    return id;
  };
  const result = (id, text) =>
    lines.push(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } }));
  const readChecks = (runs) => result(use("mcp__github__pull_request_read", { method: "get_check_runs", ...pr }), JSON.stringify({ check_runs: runs }));
  const merge = (target = pr) => {
    writeFileSync(transcript, lines.join("\n"));
    return runHook("merge", { tool_name: "mcp__github__merge_pull_request", tool_input: target, transcript_path: transcript });
  };

  let out = merge();
  assert.equal(out.status, 2);
  assert.match(out.stderr, /hasn't read the PR's checks/);
  readChecks([{ name: "Harness", status: "in_progress" }]);
  assert.match(merge().stderr, /still running: Harness/);
  readChecks([{ name: "CI", status: "completed", conclusion: "failure" }]);
  assert.match(merge().stderr, /not green: CI \(failure\)/);
  readChecks([{ name: "CI", status: "completed", conclusion: "skipped" }]);
  assert.match(merge().stderr, /no check has passed/);
  readChecks([
    { name: "CI", status: "completed", conclusion: "skipped" },
    { name: "Harness", status: "completed", conclusion: "success" },
  ]);
  out = merge();
  assert.equal(out.status, 0, out.stderr);
  result(use("Bash", { command: "git push -u origin claude/x" }), "pushed");
  assert.match(merge().stderr, /push after the last time/);
  readChecks([{ name: "Harness", status: "completed", conclusion: "success" }]);
  assert.equal(merge().status, 0);
  // Other repos (app-studio itself, say) are not this hook's business.
  lines.length = 0;
  assert.equal(merge({ owner: "ildruido", repo: "app-studio", pullNumber: 1 }).status, 0);
});

test("the write hook blocks GitHub API file writes to this app's repo only", () => {
  install(app, studio);
  gitApp("http://local_proxy@127.0.0.1:1234/git/ildruido/my-app");
  const write = (repo) => runHook("write", { tool_name: "mcp__github__push_files", tool_input: { owner: "ildruido", repo } });
  const out = write("My-App");
  assert.equal(out.status, 2);
  assert.match(out.stderr, /local clone/);
  assert.equal(write("app-studio").status, 0);
});

test("health checks links in the app's own .claude Markdown and needs the Harness workflow", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  addPacks(app, studio, ["artifact"], { slug: "demo-app", title: "Demo App" });
  fillProfile();
  assert.equal(health().status, 0, health().stdout);
  mkdirSync(join(app, ".claude/skills/mine/templates"), { recursive: true });
  writeFileSync(join(app, ".claude/skills/mine/SKILL.md"), "---\nname: mine\ndescription: Mine.\n---\nSee [the form](templates/form.md).\n");
  rmSync(join(app, ".github/workflows/harness.yml"));
  const out = health();
  assert.equal(out.status, 1);
  assert.match(out.stdout, /skills\/mine\/SKILL\.md: broken link to templates\/form\.md/);
  assert.match(out.stdout, /harness\.yml is missing/);
});
