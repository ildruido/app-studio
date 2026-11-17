// Run: node --test scripts/studio-sync.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ack,
  activateHooks,
  addPacks,
  compare,
  drift,
  featureGaps,
  holdReason,
  install,
  inventory,
  listPacks,
  livePending,
  missingModules,
  packClosure,
  packKind,
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
  profile("| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |");

/** Writes a CLAUDE.md whose App profile table holds the given rows. */
function profile(rows) {
  writeFileSync(join(app, "CLAUDE.md"), `# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n| App | Demo |\n${rows}\n\n## Roles\n`);
}

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

function writePack(name, { version = "1.0.0", requires = [], managed = {}, starter = {}, packageJson, kind, extra = {} } = {}) {
  const dir = join(studio, "packs", name);
  const put = (base, files) =>
    Object.entries(files).forEach(([path, text]) => {
      mkdirSync(dirname(join(dir, base, path)), { recursive: true });
      writeFileSync(join(dir, base, path), text);
    });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pack.json"), JSON.stringify({ name, version, kind, requires, packageJson, ...extra }));
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

test("a feature module installs like a pack, is named as a module, and a bad kind is refused", () => {
  twoPacks();
  writePack("feat", { kind: "module", requires: ["base"], starter: { "src/modules/feat.ts": "// {{title}} feature\n" } });
  install(app, studio);
  assert.equal(packKind(studio, "web"), "stack");
  assert.equal(packKind(studio, "feat"), "module");
  const out = sync("pack", "add", "web", "feat", "--slug", "demo", "--title", "Demo");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Packs added.*: base, web; modules: feat\./);
  assert.equal(readFileSync(join(app, "src/modules/feat.ts"), "utf8"), "// Demo feature\n");
  assert.deepEqual(readLock(app).packs, { base: "1.0.0", web: "1.0.0", feat: "1.0.0" });
  assert.equal(drift(compare(app, studio)), false);
  assert.throws(() => addPacks(app, studio, []), /Available: base, web; modules: feat/);
  writePack("odd", { kind: "plugin", requires: ["base"] });
  assert.throws(() => addPacks(app, studio, ["odd"]), /kind "plugin"; use "stack" or "module"/);
});

test("the seed makes no AI call; the ai module brings the AI demo and its tests", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  addPacks(app, studio, ["web", "artifact"], { slug: "demo-app", title: "Demo App" });
  const seed = ["index.html", "src/main.ts", "tests/unit/platform.test.ts", "e2e/artifact/smoke.spec.ts", "e2e/web/smoke.spec.ts"];
  for (const f of seed) assert.doesNotMatch(readFileSync(join(app, f), "utf8"), /\bAI\b|sample\(/, `${f} mentions AI`);
  // The platform itself has no AI until the module adds it (#89).
  const platform = ["src/env.d.ts", "src/platform/types.ts", "src/platform/index.ts", "src/platform/fake.ts", "src/platform/artifact.ts", "src/platform/web.ts", "src/platform/web-http.ts"];
  for (const f of platform) assert.doesNotMatch(readFileSync(join(app, f), "utf8"), /sample|permissionState|\/api\/ai/, `${f} has AI in it`);
  assert.ok(!existsSync(join(app, "src/modules")));
  assert.equal(packKind(studio, "ai"), "module");
  const r = addPacks(app, studio, ["ai"]);
  assert.deepEqual(r.added, ["ai"]);
  assert.deepEqual(r.created.sort(), ["src/ai.d.ts", "src/modules/ai.ts", "src/platform/capabilities/ai.ts", "tests/unit/ai.test.ts"]);
  assert.match(readFileSync(join(app, "src/modules/ai.ts"), "utf8"), /export async function mount/);
  assert.ok(existsSync(join(app, ".claude/packs/ai/STACK.md")));
  assert.equal(drift(compare(app, studio)), false);
});

/** base + web packs, an `ai`-like module that adds a platform method, and its web partner. */
function modulePacks() {
  writePack("base", { starter: { "src/platform/types.ts": "// sample() v1\n" } });
  writePack("web", { requires: ["base"], starter: { "src/platform/web.ts": "// web v1\n" } });
  writePack("ai", {
    kind: "module",
    requires: ["base"],
    starter: { "src/platform/capabilities/ai.ts": "// ai\n" },
    extra: { platformMethods: ["sample", "permissionState"], alsoWith: { web: "ai-web" } },
  });
  writePack("ai-web", { kind: "module", requires: ["web", "ai"], starter: { "src/platform/web-providers/ai.ts": "// ai-web\n" } });
}

test("pull holds back starter files while the app calls a module it doesn't have, and lets them in once it is added", () => {
  modulePacks();
  install(app, studio);
  fillProfile();
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  mkdirSync(join(app, "src/features"), { recursive: true });
  writeFileSync(join(app, "src/features/coach.ts"), "await (await getPlatform().sample())?.(prompt);\n");
  // app-studio drops sample() from the base platform and the web adapter, and adds a file.
  writeFileSync(join(studio, "packs/base/starter/src/platform/types.ts"), "// v2, no sample\n");
  writeFileSync(join(studio, "packs/web/starter/src/platform/web.ts"), "// web v2\n");
  writeFileSync(join(studio, "packs/base/starter/src/platform/registry.ts"), "// registry\n");

  const r = compare(app, studio);
  assert.match(r.held, /sample\(\) \(ai module\).*pack add ai/);
  assert.ok(r.starters.every((n) => !n.refreshable));
  assert.match(sync("check").stdout, /held back: the app calls sample\(\)/);
  const p = pull(app, studio);
  assert.deepEqual(p.refreshed, []);
  assert.deepEqual(p.created, []);
  assert.deepEqual(p.held.sort(), ["src/platform/registry.ts", "src/platform/types.ts", "src/platform/web.ts"]);
  assert.equal(readFileSync(join(app, "src/platform/types.ts"), "utf8"), "// sample() v1\n", "old platform kept");
  assert.ok(!existsSync(join(app, "src/platform/registry.ts")));

  const added = addPacks(app, studio, ["ai"]);
  assert.deepEqual(added.created, ["src/platform/capabilities/ai.ts", "src/platform/registry.ts"], "held files come in with the module");
  assert.deepEqual(added.partners, ["ai on web needs ai-web too: run pack add ai-web"]);
  assert.match(sync("check").stdout, /Module: ai on web needs ai-web too/);
  assert.deepEqual(addPacks(app, studio, ["ai-web"]).partners, []);
  const after = compare(app, studio);
  assert.equal(after.held, undefined);
  assert.deepEqual(after.newStarters, []);
  assert.equal(readFileSync(join(app, "src/platform/types.ts"), "utf8"), "// v2, no sample\n", "refreshed once ai is there");
  assert.ok(existsSync(join(app, "src/platform/registry.ts")), "a file new in its pack is added");
  assert.ok(existsSync(join(app, "src/platform/web-providers/ai.ts")));
});

test("inventory is a read-only look at an old AI app: modules needed, drift, database and profile (issue #36)", () => {
  modulePacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  // An old AI app: its own feature calls the built-in AI, its platform file is edited, its usage table has another name.
  mkdirSync(join(app, "src/features"), { recursive: true });
  writeFileSync(join(app, "src/features/coach.ts"), "await getPlatform().sample();\n");
  writeFileSync(join(app, "src/platform/web.ts"), "// web, edited by the app\n");
  mkdirSync(join(app, "server/migrations"), { recursive: true });
  writeFileSync(join(app, "server/migrations/002.sql"), "CREATE TABLE coach_usage (user_id text);\n");
  mkdirSync(join(app, "scripts/roadmap"), { recursive: true });
  profile("| AI | on |\n| AI plan | the owner's key |");
  const before = readFileSync(join(app, ".claude/studio/lock.json"), "utf8");

  const text = inventory(app, studio).join("\n");
  assert.match(text, /calls sample\(\), permissionState\(\)|calls sample\(\)/);
  assert.match(text, /modules to switch on: ai, ai-web/);
  assert.match(text, /not set \(the server then means invite-only/);
  assert.match(text, /roadmap tooling: present .*do not add the roadmap module/);
  assert.match(text, /differ \(merge by hand, then ack\): src\/platform\/web\.ts/);
  assert.match(text, /coach_usage: NOT the module's ai_usage\. Stop and ask/);
  assert.match(text, /missing: the App profile has no Access model/);
  assert.equal(readFileSync(join(app, ".claude/studio/lock.json"), "utf8"), before, "the lock is untouched");
  assert.ok(!existsSync(join(app, "src/platform/capabilities")), "no file was added");

  const run = sync("inventory");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Inventory of .*read-only/);
  // An app that already has the module-era table is told it is safe.
  writeFileSync(join(app, "server/migrations/002.sql"), "CREATE TABLE ai_usage (user_id text);\n");
  assert.match(inventory(app, studio).join("\n"), /ai_usage and monthly_allowance exist/);
});

test("a starter the app already matches in full is not a note, a pull records it, and inventory agrees (#111)", () => {
  twoPacks();
  install(app, studio);
  fillProfile();
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  // app-studio changes the starter; the app's file differs from the last install but already equals the new one.
  writeFileSync(join(studio, "packs/base/starter/src/main.ts"), "// {{title}} v2\n");
  writeFileSync(join(app, "src/main.ts"), "// A v2\n");
  assert.deepEqual(compare(app, studio).starters, [], "nothing to merge");
  assert.doesNotMatch(sync("check", "--warn").stdout, /merge by hand/);
  assert.match(inventory(app, studio).join("\n"), /differ: 0/);
  const p = pull(app, studio);
  assert.deepEqual(p.starterNotes, []);
  assert.equal(readFileSync(join(app, "src/main.ts"), "utf8"), "// A v2\n", "the app's file is untouched");
  assert.deepEqual(compare(app, studio).starters, []);
});

test("inventory reports AI, access model, storage and the modules on, from the App profile and the lock (#111)", () => {
  modulePacks();
  writePack("user", { kind: "module", requires: ["base"], starter: { "src/modules/user.ts": "// user\n" } });
  install(app, studio);
  addPacks(app, studio, ["web", "user"], { slug: "a", title: "A" });
  profile("| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |");
  let text = inventory(app, studio).join("\n");
  assert.match(text, /on now: user \(user = who is signed in\)/);
  assert.match(text, /the code needs, not on yet: none/);
  assert.match(text, /AI: off/);
  assert.match(text, /Access model \(who can get in\): only invited people/);
  assert.match(text, /Storage shape: per-person documents/);
  assert.match(text, /sign-in mode: not set/);
  profile("| AI | on |");
  text = inventory(app, studio).join("\n");
  assert.match(text, /AI: on/);
  assert.match(text, /Access model \(who can get in\): no row/);
});

test("the sync guard ignores the harness's own old platform code and untouched starter copies, not the app's code", () => {
  modulePacks();
  install(app, studio);
  fillProfile();
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  // Old harness code that calls the built-in AI: an app without AI still has it.
  writeFileSync(join(app, "src/platform/web.ts"), "export const web = { sample: () => p.sample() };\n");
  writeFileSync(join(studio, "packs/base/starter/src/legacy.ts"), "x.sample();\n");
  addPacks(app, studio, ["base"], { slug: "a", title: "A" });
  assert.ok("src/legacy.ts" in readLock(app).starters || existsSync(join(app, "src/legacy.ts")));
  assert.equal(compare(app, studio).held, undefined, "platform layer and untouched starters hold nothing back");
  // Editing the copy makes it the app's own code.
  writeFileSync(join(app, "src/legacy.ts"), "x.sample(); // mine\n");
  assert.match(compare(app, studio).held ?? "", /sample\(\) \(ai module\)/);
  writeFileSync(join(app, "src/legacy.ts"), "x.sample();\n");
  assert.equal(compare(app, studio).held, undefined);
  // The app's own code that calls it does.
  mkdirSync(join(app, "src/features"), { recursive: true });
  writeFileSync(join(app, "src/features/coach.ts"), "await getPlatform().sample();\n");
  assert.match(compare(app, studio).held, /sample\(\) \(ai module\)/);
});

test("the sync guard ignores the harness's platform tests, even edited, but not the app's own tests", () => {
  modulePacks();
  install(app, studio);
  fillProfile();
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  mkdirSync(join(app, "tests/unit"), { recursive: true });
  writeFileSync(join(app, "tests/unit/artifact-platform.test.ts"), "expect(p.sample()); // edited\n");
  assert.equal(compare(app, studio).held, undefined, "platform tests call every method");
  writeFileSync(join(app, "tests/unit/coach.test.ts"), "await p.sample();\n");
  assert.match(compare(app, studio).held, /sample\(\) \(ai module\)/, "the app's own test still counts");
});

test("an app directly under a system temp folder gets no forwarded settings file there", () => {
  install(app, studio);
  const top = mkdtempSync(join(tmpdir(), "studio-top-"));
  const direct = join(tmpdir(), `studio-direct-${process.pid}`);
  cpSync(app, direct, { recursive: true });
  const stray = join(tmpdir(), ".claude/settings.json");
  const before = existsSync(stray) ? readFileSync(stray, "utf8") : null;
  try {
    const notes = activateHooks(direct, { CLAUDE_CODE_REMOTE: "true" });
    assert.deepEqual(notes.filter((n) => n.includes("forwarded")), []);
    assert.equal(existsSync(stray) ? readFileSync(stray, "utf8") : null, before, "nothing written under the temp folder");
    // Under a project folder it still forwards.
    const inTop = join(top, "app");
    cpSync(app, inTop, { recursive: true });
    assert.ok(activateHooks(inTop, { CLAUDE_CODE_REMOTE: "true" }).some((n) => n.includes("forwarded")));
  } finally {
    rmSync(direct, { recursive: true, force: true });
    rmSync(top, { recursive: true, force: true });
  }
});

test("pull adds a starter file new in a pack when nothing is in the way, and a call it doesn't know about holds nothing", () => {
  modulePacks();
  install(app, studio);
  addPacks(app, studio, ["base"], { slug: "a", title: "A" });
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src/stats.ts"), "export const sample = (xs: number[]) => xs[0];\nsample([1]);\n");
  writeFileSync(join(studio, "packs/base/starter/src/platform/registry.ts"), "// registry\n");
  writeFileSync(join(studio, "packs/base/starter/src/kept.ts"), "// upstream\n");
  writeFileSync(join(app, "src/kept.ts"), "// mine\n");
  assert.deepEqual(compare(app, studio).newStarters, ["src/platform/registry.ts"]);
  const p = pull(app, studio);
  assert.deepEqual(p.created, ["src/platform/registry.ts"]);
  assert.deepEqual(p.held, []);
  assert.equal(readFileSync(join(app, "src/kept.ts"), "utf8"), "// mine\n", "a file in the way is left alone");
  assert.ok("src/platform/registry.ts" in readLock(app).starters);
});

test("every real pack installs cleanly and fills in every placeholder", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  const names = listPacks(studio);
  assert.deepEqual(names, ["ai", "ai-web", "artifact", "base", "mirror", "roadmap", "user", "web"]);
  install(app, studio);
  const r = addPacks(app, studio, ["web", "artifact", "mirror", "ai-web", "user"], { slug: "demo-app", title: "Demo App" });
  assert.deepEqual(r.kept, [], "no two packs ship the same file");
  assert.equal(drift(compare(app, studio)), false);
  const left = Object.keys(readLock(app).starters).filter((p) => /\{\{(slug|title)\}\}/.test(readFileSync(join(app, p), "utf8")));
  assert.deepEqual(left, []);
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(pkg.scripts["build:web"] !== undefined && pkg.scripts["build:artifact"] !== undefined, true);
  assert.equal(pkg.scripts.build, "npm run build:web", "the first pack named decides what build means");
});

test("an app that calls user() without the user module is told to add it (issue #88)", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  assert.deepEqual(missingModules(app, studio, ["base", "web"]), []);
  writeFileSync(join(app, "src/who.ts"), "export const who = async () => (await getPlatform().user())?.id();\n");
  assert.deepEqual(missingModules(app, studio, ["base", "web"]), [{ pack: "user", methods: ["user"] }]);
  assert.match(holdReason(missingModules(app, studio, ["base", "web"])), /user\(\) \(user module\).*pack add user/);
  assert.deepEqual(missingModules(app, studio, ["base", "web", "user"]), []);
});

test("the web pack alone has no AI; the ai-web module brings its server side with web and ai", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  assert.deepEqual(packClosure(studio, ["ai-web"]), ["base", "web", "ai", "ai-web"]);
  assert.equal(packKind(studio, "ai-web"), "module");
  addPacks(app, studio, ["web"], { slug: "demo-app", title: "Demo App" });
  for (const path of ["server/src/ai", "server/migrations/ai_001_usage.sql", "server/e2e/modules", "server/tests/ai.test.ts"])
    assert.equal(existsSync(join(app, path)), false, `${path} only comes with ai-web`);
  assert.doesNotMatch(readFileSync(join(app, "server/migrations/002_auth.sql"), "utf8"), /monthly_allowance/);
  assert.doesNotMatch(readFileSync(join(app, "server/src/config.ts"), "utf8"), /ANTHROPIC/);
  const r = addPacks(app, studio, ["ai-web"]);
  assert.deepEqual(r.added.sort(), ["ai", "ai-web"]);
  for (const path of ["server/src/ai/routes.ts", "server/src/modules/ai.ts", "server/migrations/ai_001_usage.sql", "server/e2e/modules/ai.ts", "server/tests/ai.test.ts", "src/modules/ai.ts"])
    assert.ok(existsSync(join(app, path)), `${path} comes with ai-web`);
  assert.ok(existsSync(join(app, ".claude/packs/ai-web/STACK.md")));
  assert.equal(drift(compare(app, studio)), false);
});

test("the base pack has no roadmap tooling; the roadmap module adds it, and an app that has it keeps it", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  assert.equal(packKind(studio, "roadmap"), "module");
  assert.deepEqual(packClosure(studio, ["roadmap"]), ["base", "roadmap"]);
  addPacks(app, studio, ["base"], { slug: "demo-app", title: "Demo App" });
  const scripts = () => JSON.parse(readFileSync(join(app, "package.json"), "utf8")).scripts;
  for (const path of ["scripts/roadmap", "tests/unit/roadmap.test.ts"])
    assert.equal(existsSync(join(app, path)), false, `${path} only comes with roadmap`);
  assert.equal("roadmap:check" in scripts() || "roadmap:data" in scripts(), false);
  const r = addPacks(app, studio, ["roadmap"]);
  assert.deepEqual(r.added, ["roadmap"]);
  for (const path of ["scripts/roadmap/roadmap.ts", "scripts/roadmap/cli.ts", "tests/unit/roadmap.test.ts"])
    assert.ok(existsSync(join(app, path)), `${path} comes with roadmap`);
  assert.ok("roadmap:check" in scripts() && "roadmap:data" in scripts());
  assert.equal(drift(compare(app, studio)), false);
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

test("health: AI off needs no AI plan; blank access model fails; AI on without a plan fails", () => {
  install(app, studio);
  const rows = (ai, plan, access, storage = "| Storage shape | shared documents |") =>
    [ai, plan, access, storage].filter(Boolean).join("\n");
  profile(rows("| AI | off |", "| AI plan | <whose plan pays> |", "| Access model | anyone who signs up |"));
  assert.equal(health().status, 0, health().stdout);
  profile(rows("| AI | off |", "", "| Access model | |"));
  assert.match(health().stdout, /no Access model/);
  profile(rows("| AI | off |", "", "| Access model | <only invited people \\| anyone> |"));
  assert.match(health().stdout, /placeholder/);
  profile(rows("| AI | on |", "", "| Access model | only invited people |"));
  assert.match(health().stdout, /AI is on, so the App profile needs an AI plan/);
  profile(rows("| AI | on |", "| AI plan | <whose plan pays> |", "| Access model | only invited people |"));
  assert.match(health().stdout, /placeholder/);
  profile(rows("| AI | on |", "| AI plan | owner's plan, quick tier |", "| Access model | only invited people |"));
  assert.equal(health().status, 0, health().stdout);
  profile(rows("", "", "| Access model | only invited people |"));
  assert.match(health().stdout, /no AI row/);
  profile(rows("| AI | off |", "", "| Access model | only invited people |", ""));
  assert.match(health().stdout, /no Storage shape/);
});

test("release-gate refuses while the access model is blank", () => {
  install(app, studio);
  profile("| AI | off |\n| Access model | |\n| Storage shape | shared documents |");
  const stopped = sync("release-gate");
  assert.equal(stopped.status, 1);
  assert.match(stopped.stdout, /Release stopped[\s\S]*Access model is blank/);
  profile("| AI | off |\n| Access model | <only invited people \\| anyone> |\n| Storage shape | shared documents |");
  assert.equal(sync("release-gate").status, 1);
  profile("| AI | off |\n| Access model | anyone, no login |\n| Storage shape | shared documents |");
  assert.equal(sync("release-gate").status, 0);
});

test("AI with open sign-up or no login needs a recorded AI public use decision before release", () => {
  install(app, studio);
  const p = (ai, access, decision = "") =>
    profile([`| AI | ${ai} |`, "| AI plan | owner's key |", `| Access model | ${access} |`, decision, "| Storage shape | shared documents |"].filter(Boolean).join("\n"));
  for (const access of ["anyone who signs up", "anyone, no login"]) {
    p("on", access);
    const stopped = sync("release-gate");
    assert.equal(stopped.status, 1, access);
    assert.match(stopped.stdout, /Release stopped[\s\S]*strongly recommended[\s\S]*AI public use/);
    assert.match(health().stdout, /anyone can spend the app's AI/);
    p("on", access, "| AI public use | <the owner's decision> |");
    assert.equal(sync("release-gate").status, 1, "a placeholder is not a decision");
    assert.match(health().stdout, /placeholder/);
    p("on", access, "| AI public use | 50,000 tokens a month per person, spend cap $20 |");
    assert.equal(sync("release-gate").status, 0, access);
    assert.equal(health().status, 0, health().stdout);
    p("on", access, "| AI public use | no cap: the owner accepts the risk for the beta (2026-11-16) |");
    assert.equal(sync("release-gate").status, 0, "a recorded decision without a cap is the owner's call");
  }
  // Invite-only, or AI off: no decision needed, and the template's placeholder row is not a gap.
  p("on", "only invited people", "| AI public use | <the owner's decision> |");
  assert.equal(sync("release-gate").status, 0);
  assert.equal(health().status, 0, health().stdout);
  p("off", "anyone, no login", "| AI public use | <the owner's decision> |");
  assert.equal(sync("release-gate").status, 0);
  assert.equal(health().status, 0, health().stdout);
});

test("release-gate refuses while the host's SIGN_IN_MODE disagrees with the Access model", () => {
  install(app, studio);
  const p = (access) => profile(`| AI | off |\n| Access model | ${access} |\n| Storage shape | shared documents |`);
  const render = (mode) =>
    writeFileSync(join(app, "render.yaml"), `services:\n  - type: web\n    envVars:\n      - key: SIGN_IN_MODE\n        value: "${mode}"\n`);
  mkdirSync(join(app, ".github/workflows"), { recursive: true });
  const ci = (mode) => writeFileSync(join(app, ".github/workflows/ci.yml"), `env:\n  SIGN_IN_MODE: ${mode}\n`);
  const cases = [["only invited people", "invite"], ["anyone who signs up", "open"], ["anyone, no login", "none"]];
  for (const [access, mode] of cases) {
    p(access);
    render(mode);
    ci(mode);
    assert.equal(sync("release-gate").status, 0, access);
    for (const other of cases.map((c) => c[1]).filter((m) => m !== mode)) {
      render(other);
      const stopped = sync("release-gate");
      assert.equal(stopped.status, 1, `${access} with render.yaml ${other}`);
      assert.match(stopped.stdout, new RegExp(`render.yaml sets SIGN_IN_MODE to "${other}"`));
      render(mode);
      ci(other);
      assert.match(sync("release-gate").stdout, /ci\.yml sets SIGN_IN_MODE/);
      ci(mode);
    }
  }
  p("only invited people");
  render("choose: invite, open or none");
  ci("invite");
  assert.match(sync("release-gate").stdout, /render\.yaml sets SIGN_IN_MODE to "choose/, "an unchosen host setting stops the release");
  // No render.yaml (artifact app) or no setting at all (an older web app, where the server defaults to invite).
  rmSync(join(app, "render.yaml"));
  assert.equal(sync("release-gate").status, 0);
  writeFileSync(join(app, "render.yaml"), "services: []\n");
  assert.equal(sync("release-gate").status, 0, "absent means invite, which matches");
  p("anyone, no login");
  assert.equal(sync("release-gate").status, 1, "absent means invite, which is not no login");
});

test("the web pack ships a database setup for cloud sessions", () => {
  const f = join(repo, "packs/web/starter/scripts/cloud-setup.sh");
  assert.ok(existsSync(f), "web starter has scripts/cloud-setup.sh");
  assert.equal(spawnSync("bash", ["-n", f]).status, 0, "valid bash");
  const text = readFileSync(f, "utf8");
  for (const needle of ["DATABASE_URL", "TEST_DATABASE_URL", "CLAUDE_ENV_FILE", "exit 0"]) assert.ok(text.includes(needle), needle);
  assert.ok((statSync(f).mode & 0o111) !== 0, "executable");
});

test("the shipped template has Features rows with no preselected answer", () => {
  const t = readFileSync(join(repo, "plugins/studio/templates/CLAUDE.md"), "utf8");
  for (const f of ["AI", "Access model", "Storage shape"]) assert.match(t, new RegExp(`\\| ${f}\\s+\\| \`<`));
});

test("app instructions say never open a draft PR and to read the PR back (#81)", () => {
  const t = (f) => readFileSync(join(repo, "plugins/studio", f), "utf8");
  assert.match(t("templates/CLAUDE.md"), /Never open a draft PR[\s\S]*`draft: false`/);
  assert.match(t("templates/project-instructions.md"), /never as a draft[\s\S]*`draft: true`/);
  assert.match(t("skills/build-feature/SKILL.md"), /never a draft[\s\S]*`draft: false`/);
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
  // Only each check's latest run counts: a red draft-stage "CI gate" replaced by a green one doesn't block.
  readChecks([
    { id: 7, name: "CI gate", status: "completed", conclusion: "failure" },
    { id: 9, name: "CI gate", status: "completed", conclusion: "success" },
    { id: 8, name: "health", status: "completed", conclusion: "cancelled" },
    { id: 10, name: "health", status: "completed", conclusion: "success" },
  ]);
  assert.equal(merge().status, 0, merge().stderr);
  readChecks([
    { id: 9, name: "CI gate", status: "completed", conclusion: "failure" },
    { id: 7, name: "CI gate", status: "completed", conclusion: "success" },
  ]);
  assert.match(merge().stderr, /not green: CI gate \(failure\)/, "a newer red run still blocks");
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

// --- The "app-studio apps" cloud environment: scripts/env-setup.sh and scripts/studio-env.mjs (0.6.1) ---

const launcher = () => {
  const sh = readFileSync(join(repo, "scripts/env-setup.sh"), "utf8");
  const file = join(tmp, "launch-src.mjs");
  writeFileSync(file, sh.slice(sh.indexOf("<<'EOF'\n") + 8, sh.indexOf("\nEOF\n")));
  return file;
};
const envInstall = () => spawnSync(process.execPath, [launcher(), "install"], { cwd: tmp, encoding: "utf8", env: env() });
const launch = (args, input) =>
  spawnSync(process.execPath, [join(tmp, ".claude/studio-env-launch.mjs"), ...args], {
    encoding: "utf8",
    input,
    env: env({ STUDIO_HOOK_LOG: join(tmp, "hooks.log") }),
  });

test("the environment's setup wires the launcher and links app-studio's skills before an app exists", () => {
  mkdirSync(app, { recursive: true });
  const out = envInstall();
  assert.match(out.stdout, /launcher and hooks installed/);
  const cmds = commandsOf(settingsHooks(join(tmp, ".claude/settings.json")));
  for (const a of ["session", "hook commit", "hook merge", "hook write", "hook lint", "hook test"])
    assert.equal(cmds.filter((c) => c.includes("studio-env-launch.mjs") && c.endsWith(` ${a}`)).length, 1, a);
  assert.equal(readFileSync(join(tmp, ".claude/skills/new-app/SKILL.md"), "utf8"), readFileSync(join(studio, "plugins/studio/skills/new-app/SKILL.md"), "utf8"));
  assert.match(launch(["session"]).stdout, /No repo here has the harness yet, which is expected/);
  assert.equal(launch(["hook", "lint"], "{}").status, 0, "no app: hooks do nothing");
  assert.equal(commandsOf(settingsHooks(join(tmp, ".claude/settings.json"))).length, 6, "a second setup adds nothing");
});

test("links follow the repos: a later app-studio change shows at once, and the app's copy wins once it exists", () => {
  mkdirSync(app, { recursive: true });
  envInstall();
  writeFileSync(join(studio, "plugins/studio/skills/new-app/SKILL.md"), "newer\n");
  assert.equal(readFileSync(join(tmp, ".claude/skills/new-app/SKILL.md"), "utf8"), "newer\n");
  install(app, studio);
  mkdirSync(join(app, ".claude/skills/own"), { recursive: true });
  writeFileSync(join(app, ".claude/skills/own/SKILL.md"), "---\nname: own\ndescription: Mine.\n---\n");
  const out = launch(["session"]);
  assert.match(out.stdout, /Studio harness loaded for the app repo my-app/);
  assert.ok(existsSync(join(tmp, ".claude/skills/own/SKILL.md")), "the app's own skill is linked");
  assert.ok(existsSync(join(tmp, ".claude/agents/reviewer.md")));
});

test("hooks run the app's check.mjs with the hook input and its exit code; forwarding doesn't double them", () => {
  install(app, studio);
  gitApp();
  envInstall();
  // The app's own sync forwards nothing while the environment's launcher is wired.
  const fwd = spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "hooks"], { encoding: "utf8", env: env({ CLAUDE_CODE_REMOTE: "true" }) });
  assert.doesNotMatch(fwd.stdout, /forwarded/);
  assert.ok(!commandsOf(settingsHooks(join(tmp, ".claude/settings.json"))).some((c) => c.includes("my-app/.claude/hooks/")));
  const write = { tool_name: "mcp__github__create_or_update_file", tool_input: { owner: "ildruido", repo: "my-app", path: "x" } };
  const direct = runHook("write", write);
  const viaLauncher = launch(["hook", "write"], JSON.stringify(write));
  assert.equal(direct.status, 2, "writing to the app's own repo through the API is blocked");
  assert.equal(viaLauncher.status, 2, "the launcher passes the block on");
  assert.match(readFileSync(join(tmp, "hooks.log"), "utf8"), /write exit=2\n$/, "each hook run is logged");
  assert.equal(launch(["hook", "write"], JSON.stringify({ ...write, tool_input: { ...write.tool_input, repo: "other" } })).status, 0);
});

test("the Stop hook lints files changed through shell commands, not only through Edit/Write", () => {
  install(app, studio);
  gitApp();
  // A stand-in ESLint: fails for any file that contains BAD.
  const bin = join(app, "node_modules/.bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "eslint"),
    '#!/usr/bin/env node\nconst fs=require("fs");const bad=process.argv.slice(2).filter(a=>!a.startsWith("-")).filter(f=>fs.readFileSync(f.replace(/"/g,""),"utf8").includes("BAD"));if(bad.length){console.log("lint error in "+bad.join(","));process.exit(1)}\n',
  );
  chmodSync(join(bin, "eslint"), 0o755);
  writeFileSync(join(app, "package.json"), JSON.stringify({ scripts: { test: "exit 0" } }));
  git("add", "-A");
  git("commit", "-q", "-m", "init", "--no-verify");
  const stop = () => runHook("test", {});
  assert.equal(stop().status, 0, "nothing changed: passes");
  // A new file written by a shell command (the Edit/Write lint hook never saw it).
  writeFileSync(join(app, "shell-made.ts"), "const BAD = 1;\n");
  const bad = stop();
  assert.equal(bad.status, 2, "an untracked file with a lint error blocks the Stop hook");
  assert.match(bad.stderr, /shell-made\.ts/);
  writeFileSync(join(app, "shell-made.ts"), "const ok = 1;\n");
  assert.equal(stop().status, 0, "fixed: passes");
  // An edit to a tracked file, and a file outside the lint scope.
  writeFileSync(join(app, "notes.md"), "BAD\n");
  writeFileSync(join(app, "shell-made.ts"), "BAD\n");
  assert.equal(stop().status, 2, "an uncommitted edit of a tracked-or-new TS file is linted too");
  rmSync(join(app, "shell-made.ts"));
  assert.equal(stop().status, 0, "a Markdown file is not linted, and a deleted file is skipped");
});

test("a copy left by an older setup is replaced by a link", () => {
  mkdirSync(join(tmp, ".claude/skills/new-app"), { recursive: true });
  writeFileSync(join(tmp, ".claude/skills/new-app/SKILL.md"), "stale\n");
  mkdirSync(app, { recursive: true });
  envInstall();
  assert.notEqual(readFileSync(join(tmp, ".claude/skills/new-app/SKILL.md"), "utf8"), "stale\n");
});

// The loader (scripts/studio-env.mjs) always runs from app-studio's main, so it must keep working with
// every app copy back to 0.6.0 (GOVERNANCE.md section 6). This app copy has only what 0.6.0 had to offer
// the loader: a lock, a hook script, a skill and an agent. No cloud-setup.mjs, no studio-sync.mjs.
test("the current loader works with an app copy as old as 0.6.0", () => {
  mkdirSync(join(app, ".claude/studio"), { recursive: true });
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  mkdirSync(join(app, ".claude/skills/old-skill"), { recursive: true });
  mkdirSync(join(app, ".claude/agents"), { recursive: true });
  writeFileSync(join(app, ".claude/studio/lock.json"), JSON.stringify({ studio: "0.6.0", files: {} }));
  writeFileSync(join(app, ".claude/skills/old-skill/SKILL.md"), "---\nname: old-skill\ndescription: Old.\n---\n");
  writeFileSync(join(app, ".claude/agents/old-agent.md"), "---\nname: old-agent\ndescription: Old.\n---\n");
  // 0.6.0's check.mjs: reads the hook input, exits with a code.
  writeFileSync(join(app, ".claude/hooks/check.mjs"), "process.stdin.resume();process.stdin.on('data',()=>{});process.stdin.on('end',()=>process.exit(process.argv[2]==='merge'?2:0));\n");
  envInstall();
  const out = launch(["session"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Studio harness loaded for the app repo my-app/);
  assert.ok(existsSync(join(tmp, ".claude/skills/old-skill/SKILL.md")), "the old app's skill is linked");
  assert.ok(existsSync(join(tmp, ".claude/agents/old-agent.md")), "the old app's agent is linked");
  assert.equal(launch(["hook", "lint"], "{}").status, 0, "the old app's hook runs");
  assert.equal(launch(["hook", "merge"], "{}").status, 2, "and its exit code is passed on");
});

test("a release marked 'Live check: pending' is refused by install, pull and pack add until confirmed", () => {
  const ver = JSON.parse(readFileSync(join(studio, "plugins/studio/.claude-plugin/plugin.json"), "utf8")).version;
  const changelog = (mark) => writeFileSync(join(studio, "CHANGELOG.md"), `# Changelog\n\n## [Unreleased]\n\n## [${ver}] - 2026-11-10\n\n${mark}\n\nText.\n\n## [0.0.1]\n\nLive check: pending\n`);
  const master = (...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app], { encoding: "utf8" });

  changelog("Live check: pending");
  assert.equal(livePending(studio), ver);
  for (const args of [["install"], ["pack", "add", "artifact"]]) {
    const r = master(...args);
    assert.equal(r.status, 1, args.join(" "));
    assert.match(r.stderr, /not live-checked yet.*nothing was changed/s);
  }
  assert.equal(existsSync(join(app, ".claude")), false, "a refused run changes nothing");

  // The studio-scratch check passes the flag and proceeds.
  assert.equal(master("install", "--live-check").status, 0);
  changelog("Live check: pending");
  const refusedPull = master("pull");
  assert.equal(refusedPull.status, 1);
  assert.match(refusedPull.stderr, /Live check: passed/);

  // Once confirmed, everything proceeds; an older pending entry or no marker never blocks.
  changelog("Live check: passed 2026-11-11");
  assert.equal(livePending(studio), null);
  assert.equal(master("pull").status, 0);
  rmSync(join(studio, "CHANGELOG.md"));
  assert.equal(livePending(studio), null);
  assert.equal(master("pull").status, 0);
});

test("core-lint fails on one app's build name in a pack doc, and passes on stack words a pack names", () => {
  const lint = join(dirname(fileURLToPath(import.meta.url)), "core-lint.mjs");
  const tree = mkdtempSync(join(tmpdir(), "core-lint-"));
  try {
    mkdirSync(join(tree, "plugins/studio"), { recursive: true });
    mkdirSync(join(tree, "packs/artifact/managed"), { recursive: true });
    const doc = join(tree, "packs/artifact/managed/STACK.md");
    const run = () => spawnSync("node", [lint], { env: { ...process.env, CORE_LINT_ROOT: tree }, encoding: "utf8" });
    writeFileSync(doc, "Add only app-specific lines (a Lab-style preview build).\n");
    const bad = run();
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /STACK\.md:1: one app's build name/);
    writeFileSync(doc, "Use `window.claude` and modelTier; under 16 MB; preview on Render.\n");
    assert.equal(run().status, 0);
    assert.equal(spawnSync("node", [lint], { encoding: "utf8" }).status, 0, "the real repo passes");
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
});

// Findings from the 0.17.4 live check (#106, #107).
test("the AI row is read the same with or without the template's backticks", () => {
  mkdirSync(app, { recursive: true });
  const rows = (ai) => `| AI | ${ai} |\n| Access model | \`invite only\` |\n| Storage shape | per-person documents |`;
  for (const ai of ["`off`", "off", "`off` (no AI)", "`on` (Anthropic)"]) {
    writeFileSync(join(app, "CLAUDE.md"), `# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n${rows(ai)}\n| AI plan | the owner's key |\n`);
    assert.deepEqual(featureGaps(app), [], ai);
  }
  writeFileSync(join(app, "CLAUDE.md"), `# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n${rows("`maybe`")}\n`);
  assert.match(featureGaps(app).join(), /must start with "on" or "off"/);
});

test("the web pack's session setup installs the server's packages; the e2e helpers follow ci.yml's sign-in mode", () => {
  const setup = readFileSync(join(repo, "packs/web/starter/scripts/cloud-setup.sh"), "utf8");
  assert.match(setup, /cd server && npm (ci|install)/);
  assert.ok(setup.indexOf("server/node_modules") < setup.indexOf("pg_lsclusters"), "installs before any early exit");
  for (const f of ["packs/web/starter/e2e/web/helpers.ts", "packs/web/starter/server/e2e/server.ts"])
    assert.match(readFileSync(join(repo, f), "utf8"), /\.github\/workflows\/ci\.yml/, f);
});

test("pack add leaves starter files Prettier-clean for a long app name", { skip: spawnSync("prettier", ["--version"]).status !== 0 }, () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "studio-scratch-web-extra-long", title: "Studio Scratch Web Extra Long Name" });
  const files = ["server/tests/auth.test.ts", "src/web/auth-screen.ts"].map((f) => join(app, f));
  const res = spawnSync("prettier", ["--config", join(repo, "packs/base/starter/.prettierrc.json"), "--check", ...files], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test("inventory does not flag files that are exact copies of the ai modules' starters; an edited copy still is (#114)", () => {
  modulePacks();
  const std = "export const sample = async (input) => input;\nconst x = sample(input);\n";
  writeFileSync(join(studio, "packs/ai-web/starter/src/platform/web-providers/ai.ts"), std);
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  mkdirSync(join(app, "src/platform/web-providers"), { recursive: true });
  mkdirSync(join(app, "server/src"), { recursive: true });
  writeFileSync(join(app, "src/platform/web-providers/ai.ts"), std);
  profile("| AI | on |\n| Access model | `only invited people` |\n| Storage shape | `documents` |");
  let text = inventory(app, studio).join("\n");
  assert.doesNotMatch(text, /CUSTOM AI/);
  writeFileSync(join(app, "src/platform/web-providers/ai.ts"), std + "// own change\n");
  text = inventory(app, studio).join("\n");
  assert.match(text, /CUSTOM AI DESIGN found: sample\(\) takes an input/);
});

test("inventory flags a custom AI design and offers harness only; CI path filters and job names are reported; no stray backtick (#114)", () => {
  modulePacks();
  install(app, studio);
  addPacks(app, studio, ["web"], { slug: "a", title: "A" });
  mkdirSync(join(app, "src/features"), { recursive: true });
  mkdirSync(join(app, "server/src"), { recursive: true });
  mkdirSync(join(app, "server/migrations"), { recursive: true });
  writeFileSync(join(app, "src/features/coach.ts"), "await getPlatform().sample({ position });\n");
  writeFileSync(join(app, "server/src/coach.ts"), 'router.post("/api/coach/ask", h);\n');
  writeFileSync(join(app, "server/migrations/002.sql"), "CREATE TABLE coach_usage (u text);\nCREATE TABLE ai_usage (u text);\n");
  mkdirSync(join(app, ".github/workflows"), { recursive: true });
  writeFileSync(join(app, ".github/workflows/ci.yml"), "name: CI\non:\n  pull_request:\n    paths-ignore: [\"**.md\"]\njobs:\n  check:\n    runs-on: ubuntu-latest\n");
  profile("| AI | on |\n| Access model | `only invited people` |\n| Storage shape | `documents` |");
  let text = inventory(app, studio).join("\n");
  assert.match(text, /CUSTOM AI DESIGN found: own AI route/);
  assert.match(text, /sample\(\) takes an input of the app's own/);
  assert.match(text, /HARNESS ONLY/);
  assert.match(text, /modules to switch on: none for now/);
  assert.match(text, /coach_usage and ai_usage both exist/);
  assert.match(text, /job names .*: check \(ci\.yml\)/);
  assert.match(text, /WARNING: ci\.yml skips pull requests by file path/);
  assert.match(text, /Access model \(who can get in\): only invited people\n/);
  // A module-style app (sample() with no input, no own route) is not flagged.
  rmSync(join(app, "server/src/coach.ts"));
  writeFileSync(join(app, "src/features/coach.ts"), "await getPlatform().sample();\n");
  writeFileSync(join(app, ".github/workflows/ci.yml"), "name: CI\non:\n  pull_request:\n    branches: [main]\njobs:\n  gate:\n    name: CI gate\n    runs-on: x\n");
  text = inventory(app, studio).join("\n");
  assert.doesNotMatch(text, /CUSTOM AI/);
  assert.doesNotMatch(text, /WARNING/);
  assert.match(text, /CI gate \(ci\.yml\)/);
});
