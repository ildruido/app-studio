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
  assert.deepEqual(names, ["artifact", "base", "web"]);
  install(app, studio);
  const r = addPacks(app, studio, ["web", "artifact"], { slug: "demo-app", title: "Demo App" });
  assert.deepEqual(r.kept, [], "base, web and artifact never ship the same file");
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
