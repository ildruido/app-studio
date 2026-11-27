// Run: node --test scripts/studio-sync.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ensureSubagentHook, link, skillModels, subagentModels } from "./studio-env.mjs";
import {
  ack,
  applyRelease,
  pendingInRange,
  syncReport,
  proposeBump,
  releasePrepare,
  releaseCut,
  tagCheck,
  studioStatus,
  studioVersion,
  activateHooks,
  addPacks,
  compare,
  drift,
  featureGaps,
  holdReason,
  install,
  inventory,
  listPacks,
  missingModules,
  packClosure,
  packKind,
  patchProfile,
  pull,
  readLock,
  releasedView,
  removePacks,
} from "./studio-sync.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "studio-sync-"));
// Cloud wiring goes to the user settings (~/.claude/settings.json); tests use a file under tmp instead.
const userSettings = join(tmp, "home/.claude/settings.json");
process.env.STUDIO_USER_SETTINGS = userSettings;
let studio, app;
/** A release record in a studio checkout (the shape release.mjs reads), with overrides. */
const record = (dir, version, over = {}) => {
  mkdirSync(join(dir, "releases"), { recursive: true });
  const r = { version, date: "2026-11-22", summary: `Summary of ${version}`, kind: "app-facing", refs: { issues: [], ideas: [], pr: null }, appCreator: [], appActions: [], adminActions: [], checks: { branch: [], main: [] }, status: { main: "not needed" }, notVerified: [], ...over };
  writeFileSync(join(dir, "releases", `${version}.json`), JSON.stringify(r, null, 2));
};
const PENDING = { checks: { branch: [], main: ["s1"] }, status: { main: "pending" } };

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

const DISCOVERY_ROWS = "| Phase | discovery |\n| Id prefix | `DM` |\n| Repo | https://github.com/o/demo |\n| Stack | TBD (decided at build start) |\n| AI | TBD |\n| Access model | TBD |\n| Storage shape | TBD |";

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

test("pack add refuses packs that conflict, in either order, and changes nothing", () => {
  twoPacks();
  writePack("site", { extra: { conflictsWith: ["base"] }, starter: { "astro.config.mjs": "// {{slug}}\n" } });
  install(app, studio);
  assert.throws(() => addPacks(app, studio, ["site", "web"], { slug: "a", title: "A" }), /can't be in the same app as "base"/);
  assert.ok(!existsSync(join(app, "astro.config.mjs")), "nothing was written");
  addPacks(app, studio, ["site"], { slug: "a", title: "A" });
  assert.throws(() => addPacks(app, studio, ["web"]), /can't be in the same app as "base"/);
  assert.deepEqual(Object.keys(readLock(app).packs), ["site"]);
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
  assert.deepEqual(names, ["ai", "ai-web", "artifact", "base", "discovery", "human-docs", "mirror", "research", "roadmap", "static-site", "user", "web"]);
  install(app, studio);
  const r = addPacks(app, studio, ["web", "artifact", "mirror", "ai-web", "user", "research", "discovery"], { slug: "demo-app", title: "Demo App" });
  assert.deepEqual(r.kept, [], "no two packs ship the same file");
  assert.equal(drift(compare(app, studio)), false);
  const left = Object.keys(readLock(app).starters).filter((p) => /\{\{(slug|title)\}\}/.test(readFileSync(join(app, p), "utf8")));
  assert.deepEqual(left, []);
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(pkg.scripts["build:web"] !== undefined && pkg.scripts["build:artifact"] !== undefined, true);
  assert.equal(pkg.scripts.build, "npm run build:web", "the first pack named decides what build means");
});

test("the static-site pack stands alone: fills in its name, and refuses the Vite packs", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  assert.deepEqual(packClosure(studio, ["static-site"]), ["static-site"]);
  const r = addPacks(app, studio, ["static-site"], { slug: "my-site", title: "My Site" });
  assert.deepEqual(r.kept, []);
  assert.equal(drift(compare(app, studio)), false);
  const left = Object.keys(readLock(app).starters).filter((p) => /\{\{(slug|title)\}\}/.test(readFileSync(join(app, p), "utf8")));
  assert.deepEqual(left, []);
  assert.ok(existsSync(join(app, ".github/workflows/harness.yml")) && existsSync(join(app, "astro.config.mjs")));
  assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).scripts.build, "astro build");
  for (const other of ["web", "artifact", "ai"])
    assert.throws(() => addPacks(app, studio, [other]), /can't be in the same app as|requires/, other);
  // The Roadmap list is a process module: it needs no platform layer, so a site can have it (#190).
  assert.deepEqual(packClosure(studio, ["static-site", "roadmap"]), ["static-site", "roadmap"]);
  assert.deepEqual(addPacks(app, studio, ["roadmap"]).added, ["roadmap"]);
  for (const path of ["scripts/roadmap/roadmap.ts", "scripts/roadmap/cli.ts", "tests/unit/roadmap.test.ts"])
    assert.ok(existsSync(join(app, path)), `${path} comes with roadmap`);
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.ok(pkg.scripts["roadmap:check"] && pkg.devDependencies.tsx);
  assert.equal(pkg.scripts.build, "astro build");
  assert.equal(drift(compare(app, studio)), false);
});

test("the human-docs module ships its skill, which pull keeps and pack remove deletes", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  const skill = join(app, ".claude/skills/human-docs/SKILL.md");
  assert.ok(!existsSync(skill), "the core does not have it");
  assert.deepEqual(addPacks(app, studio, ["human-docs"]).added, ["human-docs"]);
  assert.match(readFileSync(skill, "utf8"), /^name: human-docs$/m);
  assert.ok(existsSync(join(app, ".claude/packs/human-docs/STACK.md")));
  assert.equal(drift(compare(app, studio)), false);
  assert.deepEqual(removePacks(app, studio, ["human-docs"]).skipped, []);
  assert.ok(!existsSync(skill), "removing the module removes its skill");
  assert.equal(readLock(app).files[".claude/skills/human-docs/SKILL.md"], undefined);
});

// ---------- modules that ship skills and agents (#352) ----------

/** A test module in the studio copy: one skill (with a second file) and one agent. */
function notesModule(name = "notes", skill = "note-taker", agent = "note-checker") {
  const dir = join(studio, "packs", name);
  mkdirSync(join(dir, "skills", skill), { recursive: true });
  mkdirSync(join(dir, "agents"), { recursive: true });
  mkdirSync(join(dir, "managed"), { recursive: true });
  writeFileSync(join(dir, "pack.json"), JSON.stringify({ name, version: "0.1.0", kind: "module", description: "Test module.", requires: [] }));
  writeFileSync(join(dir, "managed/STACK.md"), `# ${name}\n\nShips the \`${skill}\` skill and the \`${agent}\` agent.\n`);
  writeFileSync(join(dir, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: Takes notes - when asked.\nmodel: inherit\n---\n\n# ${skill}\n`);
  writeFileSync(join(dir, "skills", skill, "format.md"), "# Format\n");
  writeFileSync(join(dir, "agents", `${agent}.md`), `---\nname: ${agent}\ndescription: Checks notes.\nmodel: inherit\n---\n\nCheck the notes.\n`);
}
const NOTES = [".claude/agents/note-checker.md", ".claude/skills/note-taker/SKILL.md", ".claude/skills/note-taker/format.md"];

test("a module's skill and agent install, update with pull, count as the harness's in health, and go with pack remove", () => {
  notesModule();
  install(app, studio);
  fillProfile();
  const r = addPacks(app, studio, ["notes"]);
  assert.deepEqual(r.added, ["notes"]);
  for (const f of NOTES) assert.ok(r.written.includes(f) && existsSync(join(app, f)), f);
  assert.deepEqual(NOTES.filter((f) => !(f in readLock(app).files)), [], "the lock tracks them like core files");
  assert.equal(drift(compare(app, studio)), false);
  assert.doesNotMatch(sync("health").stdout, /note-taker|note-checker|name clash/, "not the app's own, no clash");

  // An update in app-studio arrives with pull; a file the module dropped is deleted.
  writeFileSync(join(studio, "packs/notes/agents/note-checker.md"), "---\nname: note-checker\ndescription: Checks notes twice.\nmodel: inherit\n---\n");
  rmSync(join(studio, "packs/notes/skills/note-taker/format.md"));
  assert.deepEqual(compare(app, studio).behind, [".claude/agents/note-checker.md"]);
  const up = pull(app, studio);
  assert.deepEqual(up.written, [".claude/agents/note-checker.md"]);
  assert.deepEqual(up.deleted, [".claude/skills/note-taker/format.md"]);
  assert.match(readFileSync(join(app, ".claude/agents/note-checker.md"), "utf8"), /twice/);

  // An edit here is refused like any shared file, then removal takes skill and agent with it.
  writeFileSync(join(app, ".claude/agents/note-checker.md"), "edited here\n");
  assert.match(sync("health").stdout, /shared harness files edited here[^\n]*note-checker/);
  assert.deepEqual(removePacks(app, studio, ["notes"]).skipped, [".claude/agents/note-checker.md"]);
  assert.ok(readLock(app).packs?.notes, "kept registered while a file of it is left");
  const gone = removePacks(app, studio, ["notes"], { force: true });
  assert.deepEqual(gone.skipped, []);
  for (const f of [...NOTES, ".claude/packs/notes/STACK.md"]) assert.ok(!existsSync(join(app, f)), `${f} removed`);
  assert.equal(readLock(app).packs, undefined);
  assert.ok(existsSync(join(app, ".claude/agents/reviewer.md")), "the core's agents stay");
  assert.equal(drift(compare(app, studio)), false);
});

test("a module installs in a discovery app: no base pack, no package.json, no stack", () => {
  notesModule();
  install(app, studio);
  profile(DISCOVERY_ROWS);
  const out = sync("pack", "add", "notes");
  assert.equal(out.status, 0, out.stderr + out.stdout);
  assert.match(out.stdout, /Packs added to .*: modules: notes\./);
  assert.deepEqual(Object.keys(readLock(app).packs), ["notes"], "no base pack comes with it");
  assert.ok(!existsSync(join(app, "package.json")), "no package.json is made");
  for (const f of NOTES) assert.ok(existsSync(join(app, f)), f);
  assert.equal(sync("phase").stdout.trim(), "discovery");
  assert.doesNotMatch(sync("health").stdout, /notes|note-|package\.json|harness\.yml/, "health has nothing to say about the module");
  assert.equal(sync("pull").status, 0);
  const rm = sync("pack", "remove", "notes");
  assert.equal(rm.status, 0, rm.stderr + rm.stdout);
  for (const f of NOTES) assert.ok(!existsSync(join(app, f)), `${f} removed`);
});

test("a name clash fails cleanly: a module against the core, another module, or the app's own skill or agent", () => {
  notesModule();
  notesModule("core-twin", "release", "extra-agent");
  notesModule("notes-twin", "other-skill", "note-checker");
  install(app, studio);
  fillProfile();
  const before = JSON.stringify(readLock(app));
  const coreSkill = readFileSync(join(app, ".claude/skills/release/SKILL.md"), "utf8");

  // Against the core: nothing is copied, the core's skill stays as it was.
  assert.throws(() => addPacks(app, studio, ["core-twin"]), /Name clash, nothing was added:\n.*the core-twin pack ships the skill "release", which the core already ships/);
  assert.equal(JSON.stringify(readLock(app)), before);
  assert.equal(readFileSync(join(app, ".claude/skills/release/SKILL.md"), "utf8"), coreSkill);
  assert.ok(!existsSync(join(app, ".claude/agents/extra-agent.md")));

  // Against the app's own skill and agent: refused with the exit code, own files untouched.
  mkdirSync(join(app, ".claude/skills/note-taker"), { recursive: true });
  writeFileSync(join(app, ".claude/skills/note-taker/SKILL.md"), "---\nname: note-taker\ndescription: The app's own.\n---\n");
  const own = sync("pack", "add", "notes");
  assert.equal(own.status, 1);
  assert.match(own.stderr, /Name clash, nothing was added:\n.*the app's own skill "note-taker" has the name of one the notes pack ships\. Rename[^\n]*then run pack add again/);
  assert.equal(JSON.stringify(readLock(app)), before);
  assert.ok(!existsSync(join(app, ".claude/skills/note-taker/format.md")), "nothing lands in the app's own folder");
  assert.ok(!existsSync(join(app, ".claude/agents/note-checker.md")));
  rmSync(join(app, ".claude/skills/note-taker"), { recursive: true });

  // Against another module, in either order and in one command.
  assert.deepEqual(addPacks(app, studio, ["notes"]).added, ["notes"]);
  const locked = JSON.stringify(readLock(app));
  assert.throws(() => addPacks(app, studio, ["notes-twin"]), /the notes-twin pack ships the agent "note-checker", which the notes pack already ships/);
  assert.equal(JSON.stringify(readLock(app)), locked);
  assert.ok(!existsSync(join(app, ".claude/skills/other-skill")));
  assert.equal(drift(compare(app, studio)), false);

  // A clash that arrives later (the module gains a skill the app already has): pull leaves the app's own whole, and pull and health fail on it.
  mkdirSync(join(app, ".claude/skills/late"), { recursive: true });
  writeFileSync(join(app, ".claude/skills/late/SKILL.md"), "---\nname: late\ndescription: The app's own.\n---\n");
  mkdirSync(join(studio, "packs/notes/skills/late"), { recursive: true });
  writeFileSync(join(studio, "packs/notes/skills/late/SKILL.md"), "---\nname: late\ndescription: The module's.\nmodel: inherit\n---\n");
  writeFileSync(join(studio, "packs/notes/skills/late/extra.md"), "# Extra\n");
  const late = sync("pull");
  assert.equal(late.status, 1);
  assert.match(late.stdout, /name clash: \.claude\/skills\/late: the app's own skill "late" has the name of one the notes pack ships\. Rename/);
  assert.match(readFileSync(join(app, ".claude/skills/late/SKILL.md"), "utf8"), /The app's own/);
  assert.ok(!existsSync(join(app, ".claude/skills/late/extra.md")), "no module file is mixed into the app's own folder");
  const h = sync("health");
  assert.equal(h.status, 1);
  assert.match(h.stdout, /name clash: \.claude\/skills\/late/);
  // --force is for edited shared files: it never overwrites what the app wrote itself.
  const forced = pull(app, studio, { force: true });
  assert.equal(forced.clashes.length, 1);
  assert.match(readFileSync(join(app, ".claude/skills/late/SKILL.md"), "utf8"), /The app's own/);
  assert.equal(readLock(app).files[".claude/skills/late/SKILL.md"], undefined);
  // Renaming the app's own clears it. The empty folder a rename can leave is nobody's skill.
  rmSync(join(app, ".claude/skills/late"), { recursive: true });
  mkdirSync(join(app, ".claude/skills/late"));
  assert.equal(sync("pull").status, 0);
  assert.match(readFileSync(join(app, ".claude/skills/late/SKILL.md"), "utf8"), /The module's/);
  assert.doesNotMatch(sync("health").stdout, /name clash/);
});

test("a clash that arrives with an update (a module against the core): pull says so, the core keeps its skill, removal leaves it", () => {
  notesModule();
  install(app, studio);
  addPacks(app, studio, ["notes"]);
  const core = readFileSync(join(app, ".claude/skills/release/SKILL.md"), "utf8");
  mkdirSync(join(studio, "packs/notes/skills/release"), { recursive: true });
  writeFileSync(join(studio, "packs/notes/skills/release/SKILL.md"), "---\nname: release\ndescription: The module's.\nmodel: inherit\n---\n");
  const out = sync("pull");
  assert.equal(out.status, 1);
  assert.match(out.stdout, /name clash: the notes pack ships the skill "release", which the core already ships/);
  assert.equal(readFileSync(join(app, ".claude/skills/release/SKILL.md"), "utf8"), core);
  // The app's own file inside a module's skill folder, and the core's skill of the clashing name, survive removal.
  writeFileSync(join(app, ".claude/skills/note-taker/mine.md"), "# Mine\n");
  assert.deepEqual(removePacks(app, studio, ["notes"]).skipped, []);
  assert.equal(readFileSync(join(app, ".claude/skills/release/SKILL.md"), "utf8"), core);
  assert.ok(existsSync(join(app, ".claude/skills/note-taker/mine.md")));
  assert.ok(!existsSync(join(app, ".claude/skills/note-taker/SKILL.md")));
});

test("the loader links a module's skill and agent like the core's", () => {
  notesModule();
  install(app, studio);
  addPacks(app, studio, ["notes"]);
  const r = link(tmp);
  assert.equal(r.app, app);
  for (const n of ["skills/note-taker", "agents/note-checker.md", "skills/release", "agents/reviewer.md"]) assert.ok(r.linked.includes(n), n);
  assert.match(readFileSync(join(tmp, ".claude/skills/note-taker/SKILL.md"), "utf8"), /^name: note-taker$/m);
  assert.match(readFileSync(join(tmp, ".claude/agents/note-checker.md"), "utf8"), /^name: note-checker$/m);
  removePacks(app, studio, ["notes"]);
  assert.ok(!link(tmp).linked.some((n) => /note-/.test(n)), "and drops them once the module is removed");
  assert.ok(!existsSync(join(tmp, ".claude/skills/note-taker")));
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
  assert.deepEqual(packClosure(studio, ["roadmap"]), ["roadmap"]);
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

test("owner-merged repos: health checks the row, and the merge hook refuses merge, auto-merge and approval there", () => {
  install(app, studio);
  gitApp();
  fillProfile();
  assert.equal(health().status, 0, health().stdout);
  const setRow = (v) => {
    const f = join(app, "CLAUDE.md");
    let t = readFileSync(f, "utf8");
    // fillProfile may drop the row: then add it after the Access model row.
    t = /\| Owner-merged repos \|/.test(t) ? t.replace(/\| Owner-merged repos \|[^\n]*\|/, `| Owner-merged repos | ${v} |`) : t.replace(/(\| Access model \|[^\n]*\n)/, `$1| Owner-merged repos | ${v} |\n`);
    writeFileSync(f, t);
  };
  setRow("not a repo");
  assert.match(health().stdout, /Owner-merged repos must be/);
  setRow("`ildruido/content`, o/other");
  assert.equal(health().status, 0, health().stdout);
  const target = { owner: "ildruido", repo: "content", pullNumber: 3 };
  for (const [tool, input] of [
    ["mcp__github__merge_pull_request", target],
    ["mcp__github__enable_pr_auto_merge", target],
    ["mcp__github__pull_request_review_write", { ...target, method: "create", event: "APPROVE" }],
  ]) {
    const out = runHook("merge", { tool_name: tool, tool_input: input });
    assert.equal(out.status, 2, tool);
    assert.match(out.stderr, /only the App Creator merges in ildruido\/content/);
  }
  assert.equal(runHook("merge", { tool_name: "mcp__github__pull_request_review_write", tool_input: { ...target, method: "create", event: "COMMENT" } }).status, 0, "a comment review is fine");
  assert.equal(runHook("merge", { tool_name: "mcp__github__enable_pr_auto_merge", tool_input: { owner: "ildruido", repo: "my-app", pullNumber: 1 } }).status, 0, "other repos are untouched");
  // The merge hook must cover auto-merge and approvals once a repo is listed.
  const sf = join(app, ".claude/settings.json");
  writeFileSync(sf, readFileSync(sf, "utf8").replace("(merge_pull_request|enable_pr_auto_merge|pull_request_review_write)", "merge_pull_request"));
  assert.match(health().stdout, /does not cover enable_pr_auto_merge/);
  setRow("`none`");
  assert.equal(health().status, 0, health().stdout);
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

test("health fails when two backlog items share an id", () => {
  install(app, studio);
  fillProfile();
  const put = (path, text) => {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), text);
  };
  put("docs/BACKLOG.md", "## Roadmap\n- **Now:** HT-006, HT-007\n\n## Ready\n### HT-006 Empty screen\n### HT-007 Other\n");
  put("docs/BACKLOG-DONE.md", "### HT-005 Done thing\n");
  assert.equal(health().status, 0, health().stdout);
  put("docs/BACKLOG.md", "## Ready\n### HT-006 Empty screen\n### HT-006 Habit limit copy\n");
  const out = health();
  assert.equal(out.status, 1);
  assert.match(out.stdout, /backlog id HT-006 is used 2 times/);
  put("docs/BACKLOG.md", "## Ready\n### HT-005 Reused from done\n");
  assert.match(health().stdout, /backlog id HT-005 is used 2 times/);
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
  // install alone doesn't turn it on in the test env; check --warn (the session-start hook) and hooks do.
  const on = spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "hooks"], { encoding: "utf8", env: env() });
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

test("check and health only report: they change no git config or settings, and name the command that does", () => {
  install(app, studio);
  gitApp();
  git("config", "--unset", "core.hooksPath");
  mkdirSync(dirname(userSettings), { recursive: true });
  writeFileSync(userSettings, "{}\n");
  const sync = join(app, ".claude/studio/studio-sync.mjs");
  for (const cmd of ["check", "health"]) {
    const out = spawnSync(process.execPath, [sync, cmd], { encoding: "utf8", env: env({ CLAUDE_CODE_REMOTE: "true" }) });
    assert.match(out.stdout, /pre-commit health check is off/);
    assert.match(out.stdout, /only reports.*hooks/);
  }
  assert.equal(git("config", "--get", "core.hooksPath").stdout.trim(), "");
  assert.equal(readFileSync(userSettings, "utf8"), "{}\n");
  assert.equal(existsSync(join(tmp, ".claude/settings.json")), false);
  // The SessionStart hook (check --warn) and `hooks` are what turn them on.
  spawnSync(process.execPath, [sync, "check", "--warn"], { encoding: "utf8", env: env() });
  assert.equal(git("config", "--get", "core.hooksPath").stdout.trim(), ".claude/hooks");
});

test("in a cloud session the app's hooks are forwarded to the user settings, once, and old parent copies go", () => {
  install(app, studio);
  const run = () =>
    spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), "hooks"], {
      encoding: "utf8",
      env: env({ CLAUDE_CODE_REMOTE: "true" }),
    });
  const parent = join(tmp, ".claude/settings.json");
  writeFileSync(join(tmp, "keep.txt"), "");
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(dirname(userSettings), { recursive: true });
  const old = `node "${app.split("\\").join("/")}/.claude/hooks/check.mjs" test`;
  writeFileSync(parent, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: old }, { type: "command", command: "echo theirs" }] }] } }));
  writeFileSync(userSettings, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }));
  assert.match(run().stdout, /forwarded the app's hooks/);
  assert.doesNotMatch(run().stdout, /forwarded/, "a second run changes nothing");
  assert.deepEqual(commandsOf(settingsHooks(parent)), ["echo theirs"], "the old copy in the parent folder is dropped, others kept");
  const cmds = commandsOf(settingsHooks(userSettings));
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
  assert.equal(merge({ owner: "ildruido", repo: "app-studio", pullNumber: 1 }).status, 2, "app-studio is never merged from an app");
});

test("the write hook blocks GitHub API file writes to this app's repo only", () => {
  install(app, studio);
  gitApp("http://local_proxy@127.0.0.1:1234/git/ildruido/my-app");
  const write = (repo) => runHook("write", { tool_name: "mcp__github__push_files", tool_input: { owner: "ildruido", repo } });
  const out = write("My-App");
  assert.equal(out.status, 2);
  assert.match(out.stderr, /local clone/);
  assert.equal(write("app-studio").status, 2, "app-studio is never written from an app");
});

test("an app thread can never change app-studio, with or without approval; issues stay open", () => {
  install(app, studio);
  gitApp("http://local_proxy@127.0.0.1:1234/git/ildruido/my-app");
  const target = { owner: "ildruido", repo: "app-studio", pullNumber: 5 };
  for (const [mode, tool, input] of [
    ["write", "mcp__github__create_or_update_file", { owner: "ildruido", repo: "app-studio", path: "CHANGELOG.md" }],
    ["write", "mcp__github__push_files", { owner: "someone-else", repo: "app-studio" }],
    ["merge", "mcp__github__merge_pull_request", target],
    ["merge", "mcp__github__enable_pr_auto_merge", target],
    ["merge", "mcp__github__pull_request_review_write", { ...target, method: "create", event: "APPROVE" }],
  ]) {
    const out = runHook(mode, { tool_name: tool, tool_input: input });
    assert.equal(out.status, 2, tool);
    assert.match(out.stderr, /nobody changes app-studio from an app Project/);
    assert.match(out.stderr, /harness-idea/);
  }
  // Issues (the harness-idea route) are not covered by the matchers, and other repos are untouched.
  assert.equal(runHook("write", { tool_name: "mcp__github__push_files", tool_input: { owner: "ildruido", repo: "other" } }).status, 0, "other repos are untouched");
  // A git push or commit run inside an app-studio clone, or aimed at its URL, is refused (best effort).
  const clone = join(tmp, "harness-clone");
  mkdirSync(clone, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: clone });
  spawnSync("git", ["remote", "add", "origin", "https://github.com/ildruido/app-studio"], { cwd: clone });
  for (const input of [
    { command: "git push origin HEAD", cwd: clone },
    { command: `git -C ${clone} commit -m x`, cwd: app },
    { command: "git push https://github.com/ildruido/app-studio main", cwd: app },
  ]) {
    const out = runHook("commit", { tool_name: "Bash", tool_input: { command: input.command }, cwd: input.cwd });
    assert.equal(out.status, 2, input.command);
    assert.match(out.stderr, /nobody changes app-studio/);
  }
  const fine = runHook("commit", { tool_name: "Bash", tool_input: { command: "git push -u origin feat" }, cwd: app });
  assert.notEqual(fine.status, 2, "pushing the app itself is not blocked by this rule");
  assert.doesNotMatch(fine.stderr, /nobody changes app-studio/);
});

test("the app-studio lock judges the folder a git commit or push really runs in (#410)", () => {
  install(app, studio);
  gitApp("http://local_proxy@127.0.0.1:1234/git/ildruido/my-app");
  const clone = join(tmp, "harness-clone");
  mkdirSync(clone, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: clone });
  spawnSync("git", ["remote", "add", "origin", "http://local_proxy@127.0.0.1:1234/git/ildruido/app-studio"], { cwd: clone });
  const rel = relative(app, clone).split("\\").join("/");
  const bash = (command, cwd) => runHook("commit", { tool_name: "Bash", tool_input: { command }, cwd });
  const refused = (command, cwd, judged) => {
    const out = bash(command, cwd);
    assert.equal(out.status, 2, command);
    assert.match(out.stderr, /nobody changes app-studio from an app Project/, command);
    assert.match(out.stderr, judged, command);
  };
  const allowed = (command, cwd) => {
    const out = bash(command, cwd);
    assert.doesNotMatch(out.stderr, /nobody changes app-studio/, command);
    if (!/\bcommit\b/.test(command)) assert.equal(out.status, 0, command + "\n" + out.stderr); // a commit goes on to the health check
  };
  const inClone = (what) => new RegExp("Judged: `git " + what + "` in .*harness-clone(.\\.git)?, whose origin is ildruido/app-studio\\.");

  for (const what of ["commit", "push"]) {
    const run = what === "commit" ? "git commit -m x" : "git push -u origin HEAD";
    // The shell sits in the app, the command goes to app-studio: refused, however it gets there.
    for (const command of [
      "cd " + rel + " && " + run,
      "cd " + rel + "; " + run,
      "cd " + rel + "\n" + run,
      'cd "' + clone + '" && git add -A && ' + run + " 2>&1 | tail -3",
      "cd .. && cd harness-clone && " + run,
      "(cd " + rel + " && " + run + ")",
      'bash -c "cd ' + rel + " && " + run + '"',
      "git -C " + rel + " " + run.slice(4),
      "cd .. && git -C harness-clone " + run.slice(4),
      "git --git-dir=" + rel + "/.git " + run.slice(4),
      "GIT_DIR=" + rel + "/.git " + run,
    ])
      refused(command, app, inClone(what));
    refused(run, clone, inClone(what)); // the shell already sits in app-studio
    refused('cd "$WORK/app-studio" && ' + run, app, /could not resolve, "\$WORK\/app-studio"/);

    // The shell sits in app-studio, the command goes to the app: allowed (the false block seen in the hand run).
    for (const command of ['cd "' + app + '" && git add -A && ' + run, "cd " + relative(clone, app) + "; " + run, 'git -C "' + app + '" ' + run.slice(4)])
      allowed(command, clone);
    // A cd that ended (a subshell, a cd back) and words inside a quoted message are not where the command runs.
    allowed("(cd " + rel + " && git status); " + run, app);
    allowed("cd " + rel + ' && git log -1 && cd "' + app + '" && ' + run, app);
    allowed('git status && git commit -m "notes: cd ' + rel + ' && git push later"', app);
  }

  // By URL, and through a second remote of the app that points at app-studio.
  refused("git push https://github.com/ildruido/app-studio main", app, /Judged: a URL on the command line, ildruido\/app-studio\./);
  refused("git push http://local_proxy@127.0.0.1:1234/git/ildruido/app-studio.git HEAD:main", app, /to a URL on the command line, ildruido\/app-studio\./);
  refused("git push git@github.com:ildruido/app-studio.git main", app, /ildruido\/app-studio\./);
  git("remote", "add", "studio", "http://local_proxy@127.0.0.1:1234/git/ildruido/app-studio");
  refused("git push studio HEAD:main", app, /to its remote "studio", which is ildruido\/app-studio\./);
  allowed("git push -u origin feat", app);
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
    env: env({ STUDIO_HOOK_LOG: join(tmp, "hooks.log"), STUDIO_STOP_NOTE: join(tmp, "stop-note.json") }),
  });

test("the environment's setup wires the launcher and links app-studio's skills before an app exists", () => {
  mkdirSync(app, { recursive: true });
  const out = envInstall();
  assert.match(out.stdout, /launcher installed/);
  const cmds = commandsOf(settingsHooks(userSettings));
  for (const a of ["session", "hook commit", "hook merge", "hook write", "hook lint", "hook test", "hook subagent"])
    assert.equal(cmds.filter((c) => c.includes("studio-env-launch.mjs") && c.endsWith(` ${a}`)).length, 1, a);
  const merge = JSON.parse(readFileSync(userSettings, "utf8")).hooks.PreToolUse.find((g) => g.hooks[0].command.endsWith(" hook merge"));
  for (const tool of ["merge_pull_request", "enable_pr_auto_merge", "pull_request_review_write"])
    assert.match(`mcp__github__${tool}`, new RegExp(`^${merge.matcher}$`), tool);
  assert.equal(readFileSync(join(tmp, ".claude/skills/new-app/SKILL.md"), "utf8"), readFileSync(join(studio, "plugins/studio/skills/new-app/SKILL.md"), "utf8"));
  assert.match(launch(["session"]).stdout, /No repo here has the harness yet, which is expected/);
  assert.equal(launch(["hook", "lint"], "{}").status, 0, "no app: hooks do nothing");
  envInstall();
  assert.equal(commandsOf(settingsHooks(userSettings)).length, 7, "a second setup adds nothing");
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
  assert.ok(!commandsOf(settingsHooks(userSettings)).some((c) => c.includes("my-app/.claude/hooks/")));
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

test("hook wiring an older setup left in the start folder is moved to the user settings", () => {
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  const local = join(tmp, ".claude/settings.json");
  writeFileSync(local, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "/x/.claude/studio-env-launch.mjs" hook test' }, { type: "command", command: "echo theirs" }] }] } }));
  mkdirSync(app, { recursive: true });
  envInstall();
  assert.deepEqual(commandsOf(settingsHooks(local)), ["echo theirs"], "only the old studio wiring goes");
  assert.equal(commandsOf(settingsHooks(userSettings)).filter((c) => c.includes("studio-env-launch.mjs")).length, 7);
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

// A Project thread can end a turn although the Stop hook blocked it, so Claude never sees the failure
// (#214). The loader keeps the failure and hands it to Claude at its next tool call in that session, once.
test("a Stop-hook failure Claude didn't see is passed on at its next tool call, once", () => {
  mkdirSync(join(app, ".claude/studio"), { recursive: true });
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  writeFileSync(join(app, ".claude/studio/lock.json"), JSON.stringify({ studio: "0.6.0", files: {} }));
  // A check.mjs whose test mode fails while FAIL exists, like a red unit test.
  writeFileSync(
    join(app, ".claude/hooks/check.mjs"),
    `import { existsSync } from "node:fs";\nprocess.stdin.resume();process.stdin.on("data",()=>{});process.stdin.on("end",()=>{\nif (process.argv[2]==="test" && existsSync(${JSON.stringify(join(app, "FAIL"))})) { process.stderr.write("Fix before finishing:\\nUnit tests failed: 1 problem.\\n- ticks > formats a local day\\n"); process.exit(2); }\nprocess.exit(0);});\n`,
  );
  writeFileSync(join(app, "FAIL"), "");
  envInstall();
  const stop = (extra = {}) => launch(["hook", "test"], JSON.stringify({ session_id: "s1", hook_event_name: "Stop", stop_hook_active: false, ...extra }));
  const bash = (extra = {}) => launch(["hook", "commit"], JSON.stringify({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, ...extra }));
  const context = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : undefined);

  const red = stop();
  assert.equal(red.status, 2, "the Stop hook still blocks");
  assert.match(red.stderr, /formats a local day/, "and still sends the failure to stderr");
  assert.equal(bash({ session_id: "other" }).stdout, "", "another session gets nothing");
  const next = bash();
  assert.equal(next.status, 0);
  assert.equal(context(next)?.hookEventName, "PreToolUse");
  assert.match(context(next)?.additionalContext ?? "", /turn ended before you saw it[\s\S]*formats a local day/, "the next tool call shows the failure");
  assert.equal(bash().stdout, "", "only once");
  assert.match(readFileSync(join(tmp, "hooks.log"), "utf8"), /test exit=2\n.* test note saved\n[\s\S]*test note shown at commit\n/);

  // When the block did reach Claude, the session's transcript shows it: nothing is repeated.
  stop();
  const transcript = join(tmp, "transcript.jsonl");
  writeFileSync(transcript, `${JSON.stringify({ type: "attachment", attachment: { type: "hook_blocking_error", hookEvent: "Stop", blockingError: "Fix before finishing:\nUnit tests failed: 1 problem.\n- ticks > formats a local day\n" } })}\n`);
  assert.equal(bash({ transcript_path: transcript }).stdout, "", "already seen");
  assert.equal(bash().stdout, "", "and cleared");

  // A green end-of-turn run clears a saved failure; the PostToolUse hook gets the note too.
  stop();
  rmSync(join(app, "FAIL"));
  assert.equal(stop().status, 0);
  assert.equal(bash().stdout, "", "fixed before the next tool call: nothing shown");
  writeFileSync(join(app, "FAIL"), "");
  stop();
  const lint = launch(["hook", "lint"], JSON.stringify({ session_id: "s1", tool_name: "Edit", tool_input: { file_path: "x" } }));
  assert.equal(context(lint)?.hookEventName, "PostToolUse");
  // A blocking hook passes its own message on and keeps the note for later.
  stop();
  writeFileSync(join(app, ".claude/hooks/check.mjs"), "process.stdin.resume();process.stdin.on('data',()=>{});process.stdin.on('end',()=>{process.stderr.write('blocked\\n');process.exit(2);});\n");
  const blocked = bash();
  assert.equal(blocked.status, 2);
  assert.equal(blocked.stdout, "");
  assert.match(blocked.stderr, /blocked/);
});

// A thread working on app-studio itself (no app repo): the Stop hook keeps `finish` running until it is DONE.
test("studio threads: the Stop hook blocks once while finish isn't DONE, then lets the turn end", () => {
  envInstall();
  spawnSync("git", ["init", "-q"], { cwd: studio });
  const state = join(studio, ".git/finish.json");
  const stop = (extra = {}) => launch(["hook", "test"], JSON.stringify({ session_id: "s1", hook_event_name: "Stop", stop_hook_active: false, ...extra }));
  const bash = () => launch(["hook", "commit"], JSON.stringify({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }));
  assert.equal(stop().status, 0, "no finish run: nothing to remind");
  writeFileSync(state, JSON.stringify({ version: "9.9.9", pr: 7, lastFacts: { merged: false } }));
  const red = stop();
  assert.equal(red.status, 2);
  assert.match(red.stderr, /finish has not reached DONE \(release 9\.9\.9, PR #7\)[\s\S]*finish\.mjs next/);
  assert.equal(stop({ stop_hook_active: true }).status, 0, "blocks only once per stop");
  assert.match(bash().stdout, /turn ended before you saw it[\s\S]*finish\.mjs next/, "a missed block reaches the next tool call");
  assert.equal(bash().stdout, "", "once");
  writeFileSync(state, JSON.stringify({ version: "9.9.9", pr: 7, lastFacts: { merged: true } }));
  assert.equal(stop().status, 0, "merged: nothing to remind");
});

// #227: the launcher runs the loader from the app-studio checkout at every hook, so a thread that moves
// the checkout to a branch runs the branch loader from its next hook on. Each hook logs the version it ran from.
test("each hook logs the checkout's version, and a moved checkout shows at the next hook", () => {
  mkdirSync(join(app, ".claude/studio"), { recursive: true });
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  writeFileSync(join(app, ".claude/studio/lock.json"), JSON.stringify({ studio: "0.6.0", files: {} }));
  writeFileSync(join(app, ".claude/hooks/check.mjs"), "process.stdin.resume();process.stdin.on('data',()=>{});process.stdin.on('end',()=>process.exit(0));\n");
  envInstall();
  const log = () => readFileSync(join(tmp, "hooks.log"), "utf8").trim().split("\n").filter((l) => / loader /.test(l));
  assert.equal(launch(["hook", "lint"], "{}").status, 0);
  assert.match(log().at(-1), new RegExp(` loader ${studioVersion(studio).replaceAll(".", "\\.")}$`));
  const plugin = join(studio, "plugins/studio/.claude-plugin/plugin.json");
  writeFileSync(plugin, readFileSync(plugin, "utf8").replace(/"version": "[^"]+"/, '"version": "9.9.9"'));
  assert.equal(launch(["hook", "lint"], "{}").status, 0);
  assert.match(log().at(-1), / loader 9\.9\.9$/, "the checkout changed: the next hook runs and reports from it");
});

test("a pending release anywhere between the app's version and app-studio's is refused by install, pull and pack add", () => {
  const ver = studioVersion(studio);
  const master = (...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app], { encoding: "utf8" });

  record(studio, "0.0.1", PENDING); // an OLD release in range, while the newest one is fine
  record(studio, ver);
  assert.deepEqual(pendingInRange(studio, "0.0.0"), ["0.0.1"], "not only the newest release counts");
  assert.deepEqual(pendingInRange(studio, "0.0.1"), [], "an app already past it is not held back");
  assert.deepEqual(pendingInRange(studio, undefined), ["0.0.1"], "a fresh install checks the whole history");
  for (const args of [["install"], ["pack", "add", "artifact"]]) {
    const r = master(...args);
    assert.equal(r.status, 1, args.join(" "));
    assert.match(r.stderr, /v0\.0\.1 is not live-checked yet.*nothing was changed/s);
  }
  assert.equal(existsSync(join(app, ".claude")), false, "a refused run changes nothing");

  // The studio-scratch check passes the flag and proceeds.
  assert.equal(master("install", "--live-check").status, 0);
  const lockFile = join(app, ".claude/studio/lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  lock.studio = "0.0.0";
  writeFileSync(lockFile, JSON.stringify(lock));
  const refusedPull = master("pull");
  assert.equal(refusedPull.status, 1);
  assert.match(refusedPull.stderr, /release\.mjs pending/);

  // Once confirmed everything proceeds; no records at all never blocks.
  record(studio, "0.0.1", { ...PENDING, status: { main: "passed 2026-11-23" } });
  assert.deepEqual(pendingInRange(studio, "0.0.0"), []);
  assert.equal(master("pull").status, 0);
  rmSync(join(studio, "releases"), { recursive: true });
  assert.deepEqual(pendingInRange(studio, "0.0.0"), []);
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

test("core-lint fails on an agent or skill without model and effort, and accepts an explicit inherit", () => {
  const lint = join(dirname(fileURLToPath(import.meta.url)), "core-lint.mjs");
  const tree = mkdtempSync(join(tmpdir(), "core-lint-"));
  try {
    mkdirSync(join(tree, "packs"), { recursive: true });
    mkdirSync(join(tree, "plugins/studio/agents"), { recursive: true });
    mkdirSync(join(tree, "plugins/studio/skills/demo"), { recursive: true });
    const agent = join(tree, "plugins/studio/agents/qa.md");
    const skill = join(tree, "plugins/studio/skills/demo/SKILL.md");
    const run = () => spawnSync("node", [lint], { env: { ...process.env, CORE_LINT_ROOT: tree }, encoding: "utf8" });
    writeFileSync(agent, "---\nname: qa\nmodel: sonnet\n---\nbody\n");
    writeFileSync(skill, "---\nname: demo\n---\nbody\n");
    const bad = run();
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /agents\/qa\.md: `model: sonnet` without `effort:`/);
    assert.match(bad.stderr, /skills\/demo\/SKILL\.md: no `model:`/);
    writeFileSync(agent, "---\nname: qa\nmodel: sonnet\neffort: medium\n---\nbody\n");
    writeFileSync(skill, "---\nname: demo\nmodel: inherit\n---\nbody\n");
    assert.equal(run().status, 0);
    // A module's own skill and agent follow the same rule (#352).
    mkdirSync(join(tree, "packs/notes/agents"), { recursive: true });
    mkdirSync(join(tree, "packs/notes/skills/note-taker"), { recursive: true });
    writeFileSync(join(tree, "packs/notes/agents/note-checker.md"), "---\nname: note-checker\nmodel: haiku\n---\nbody\n");
    writeFileSync(join(tree, "packs/notes/skills/note-taker/SKILL.md"), "---\nname: note-taker\n---\nbody\n");
    const mod = run();
    assert.equal(mod.status, 1);
    assert.match(mod.stderr, /packs\/notes\/agents\/note-checker\.md: `model: haiku` without `effort:`/);
    assert.match(mod.stderr, /packs\/notes\/skills\/note-taker\/SKILL\.md: no `model:`/);
    writeFileSync(join(tree, "packs/notes/agents/note-checker.md"), "---\nname: note-checker\nmodel: haiku\neffort: low\n---\nbody\n");
    writeFileSync(join(tree, "packs/notes/skills/note-taker/SKILL.md"), "---\nname: note-taker\nmodel: inherit\n---\nbody\n");
    assert.equal(run().status, 0);
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
});

test("a finished helper agent's real model is logged from its transcript; an old setup gets the SubagentStop hook added", () => {
  const dir = mkdtempSync(join(tmpdir(), "subagent-"));
  try {
    const entry = (model, extra = {}) => JSON.stringify({ type: "assistant", message: { model }, effort: "medium", ...extra });
    const own = join(dir, "agent.jsonl");
    writeFileSync(own, [entry("claude-sonnet-5-5"), entry("<synthetic>"), "not json"].join("\n"));
    const main = join(dir, "main.jsonl");
    writeFileSync(main, [entry("claude-opus-5-5"), entry("claude-sonnet-5-5", { isSidechain: true })].join("\n"));
    assert.deepEqual(subagentModels({ agent_transcript_path: own }), { models: ["claude-sonnet-5-5"], efforts: ["medium"] });
    assert.deepEqual(subagentModels({ transcript_path: main }).models, ["claude-sonnet-5-5"], "only the sidechain entries count");
    assert.deepEqual(subagentModels({ transcript_path: join(dir, "none") }).models, []);
    const log = join(dir, "hooks.log");
    const run = spawnSync(process.execPath, [join(repo, "scripts/studio-env.mjs"), "hook", "subagent", dir], {
      input: JSON.stringify({ agent_type: "qa", agent_transcript_path: own }),
      env: { ...process.env, STUDIO_HOOK_LOG: log },
      encoding: "utf8",
    });
    assert.equal(run.status, 0);
    assert.match(readFileSync(log, "utf8"), /subagent qa model=claude-sonnet-5-5 effort=medium/);
    const settings = join(dir, "settings.json");
    writeFileSync(settings, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "/x/.claude/studio-env-launch.mjs" hook test' }] }] } }));
    assert.equal(ensureSubagentHook(settings), true);
    assert.equal(ensureSubagentHook(settings), false, "once");
    assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.SubagentStop[0].hooks[0].command, 'node "/x/.claude/studio-env-launch.mjs" hook subagent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

test("pull adds the Decision log row and the 'did not check' line to an older CLAUDE.md, once, without touching app text (#123)", () => {
  install(app, studio);
  const old = `# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n| App | Demo |\n| Storage shape | per-person documents |\n| AI public use | none |\n\n## Roles\n\nMine.\n\n## Writing for the App Creator\n\nPlain English, my own words.\n\n## Last\n\nkeep\n`;
  writeFileSync(join(app, "CLAUDE.md"), old);
  const r = pull(app, studio);
  assert.equal(r.patched.filter((x) => !/merge-rule|'roles'|thread-reports/.test(x)).length, 2);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.match(text, /\| Storage shape \| per-person documents \|\n\| Decision log\s+\|[^\n]*\n\| AI public use/);
  assert.match(text, /my own words\.\n\nBefore saying something is done[^\n]*did not check[^\n]*\n\n## Last\n\nkeep\n/);
  assert.equal(text.replace(/\n\| Decision log[^\n]*/, "").replace(/\n\nBefore saying something is done[^\n]*/, ""), old);
  assert.deepEqual(pull(app, studio).patched.filter((x) => !/merge-rule|'roles'|thread-reports/.test(x)), [], "second pull changes nothing");
});

test("patchProfile keeps an app's own Decision log row and wording, and adds a missing section at the end", () => {
  install(app, studio);
  const own = "# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n| Decision log | `docs/DECISIONS.md` |\n\n## Roles\n\nWe never say what we did not check.\n";
  writeFileSync(join(app, "CLAUDE.md"), own);
  assert.deepEqual(patchProfile(app, studio).filter((x) => !/merge-rule|'roles'|thread-reports/.test(x)), []);
  assert.equal(readFileSync(join(app, "CLAUDE.md"), "utf8"), own);
  writeFileSync(join(app, "CLAUDE.md"), "# Demo\r\n\r\n## Roles\r\n\r\nx\r\n");
  assert.equal(patchProfile(app, studio).filter((x) => !/merge-rule|'roles'|thread-reports/.test(x)).length, 1);
  const t = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.match(t, /## Writing for the App Creator\r\n\r\nBefore saying/);
  assert.doesNotMatch(t.replace(/\r\n/g, ""), /\n/);
});

test("pull marks and updates the harness-owned merge rule in an older CLAUDE.md, leaving app text alone, and keeps it current (#136)", () => {
  install(app, studio);
  const tpl = readFileSync(join(studio, "plugins/studio/templates/CLAUDE.md"), "utf8");
  const block = tpl.slice(tpl.indexOf("<!-- studio:begin merge-rule"), tpl.indexOf("<!-- studio:end merge-rule -->") + "<!-- studio:end merge-rule -->".length);
  const oldRule = "- **Merging a PR** (old wording). Switch on auto-merge only.\n  1. Old step.";
  const old = `# Demo\n\n## Git workflow\n\n- My own rule.\n${oldRule}\n- **The checks.** Mine.\n\n## Last\n\nkeep\n\n## Writing for the App Creator\n\nWe say what we did not check.\n`;
  writeFileSync(join(app, "CLAUDE.md"), old);
  const r = pull(app, studio);
  assert.equal(r.patched.filter((x) => /merge-rule/.test(x)).length, 1);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.ok(text.includes(block));
  assert.equal(text.replace(block, oldRule), old);
  assert.deepEqual(pull(app, studio).patched.filter((x) => !/'roles'|thread-reports/.test(x)), [], "second pull changes nothing");
  writeFileSync(join(app, "CLAUDE.md"), text.replace("Never bypass a check", "Old step").replace("- My own rule.", "- My own rule, edited."));
  assert.equal(pull(app, studio).patched.filter((x) => !/'roles'|thread-reports/.test(x)).length, 1, "an edit inside the markers is replaced");
  const again = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.ok(again.includes(block) && again.includes("- My own rule, edited."));
});

test("pull adds the harness-owned 'thread-reports' rule to an older CLAUDE.md once, before the thread rule it sits next to, and keeps it current (#165)", () => {
  install(app, studio);
  const tpl = readFileSync(join(studio, "plugins/studio/templates/CLAUDE.md"), "utf8");
  const block = tpl.slice(tpl.indexOf("<!-- studio:begin thread-reports"), tpl.indexOf("<!-- studio:end thread-reports -->") + "<!-- studio:end thread-reports -->".length);
  const old = "# Demo\n\n## Models and threads\n\n- Mine.\n- One thread per backlog item. A bug gets a new thread.\n\n## Writing for the App Creator\n\nWe say what we did not check.\n";
  writeFileSync(join(app, "CLAUDE.md"), old);
  const r = pull(app, studio);
  assert.equal(r.patched.filter((x) => /thread-reports/.test(x)).length, 1);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.equal(text.replace(block + "\n", ""), old, "only the block was added");
  assert.ok(text.indexOf(block) < text.indexOf("- One thread per backlog item."));
  assert.deepEqual(pull(app, studio).patched.filter((x) => /thread-reports/.test(x)), [], "second pull changes nothing");
  writeFileSync(join(app, "CLAUDE.md"), text.replace("Point, don't repeat.", "Old words."));
  assert.equal(pull(app, studio).patched.filter((x) => /thread-reports/.test(x)).length, 1, "an edit inside the markers is replaced");
});

test("pull leaves an older CLAUDE.md alone and says so when the merge rule can't be found", () => {
  install(app, studio);
  const own = "# Demo\n\n## Git workflow\n\n- We merge by hand.\n\nWe say what we did not check.\n";
  writeFileSync(join(app, "CLAUDE.md"), own);
  const r = pull(app, studio);
  assert.equal(readFileSync(join(app, "CLAUDE.md"), "utf8"), own);
  assert.match(r.patched.join("\n"), /merge-rule' not found/);
});

test("pull rewrites the old default Roles bullets (Ale / Claude) once, marks them, keeps the app's other text, and a second pull changes nothing", () => {
  install(app, studio);
  const tpl = readFileSync(join(studio, "plugins/studio/templates/CLAUDE.md"), "utf8");
  const block = tpl.slice(tpl.indexOf("<!-- studio:begin roles"), tpl.indexOf("<!-- studio:end roles -->") + "<!-- studio:end roles -->".length);
  const oldRoles = [
    "- **Ale (PM and tester).** Describes requirements, sets priority by ordering the backlog, tests releases and reports results. Ale does not write code, run commands or manage git. The few things only Ale can do (creating a repo, adding a repository secret, a host's settings) Claude hands over as exact clicks.",
    "- **Claude (engineer).** Owns all code, tests, versioning, releases and the harness. Turns Ale's words into PRD and backlog changes, builds, ships and hands over a test script.",
    "- Ask Ale only when a requirement is genuinely ambiguous or a decision is product-level. Ask one question at a time, each with a recommended answer and one line on why. Everything technical is ours to decide.",
  ].join("\n");
  const old = `# Demo\n\n## Roles\n\n${oldRoles}\n- My own role note.\n\n## Last\n\nkeep\n\n## Writing for the App Creator\n\nWe say what we did not check.\n`;
  writeFileSync(join(app, "CLAUDE.md"), old);
  const r = pull(app, studio);
  assert.equal(r.patched.filter((x) => /'roles'/.test(x)).length, 1);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.ok(text.includes(block) && !/Ale \(PM/.test(text));
  assert.ok(text.includes("- My own role note."), "app text outside the markers is kept");
  assert.equal(text.replace(block, oldRoles), old);
  assert.equal(pull(app, studio).patched.filter((x) => /'roles'/.test(x)).length, 0, "second pull changes nothing");
});

test("pull leaves customised Roles wording alone and reports it", () => {
  install(app, studio);
  const own = "# Demo\n\n## Roles\n\n- **Ale (PM and tester).** Our own words about Ale.\n- **Claude (engineer).** Builds.\n\nWe say what we did not check.\n";
  writeFileSync(join(app, "CLAUDE.md"), own);
  const r = pull(app, studio);
  assert.equal(readFileSync(join(app, "CLAUDE.md"), "utf8").includes("Our own words about Ale."), true);
  assert.doesNotMatch(readFileSync(join(app, "CLAUDE.md"), "utf8"), /studio:begin roles/);
  assert.match(r.patched.join("\n"), /'roles' has custom wording/);
});

// ---------- phase: discovery and TBD (#69) ----------


test("discovery: TBD is accepted, build skills stop, and release stops", () => {
  install(app, studio);
  profile(DISCOVERY_ROWS);
  assert.equal(health().status, 0, health().stdout);
  assert.equal(sync("phase").stdout.trim(), "discovery");
  const stop = sync("phase", "--build-only");
  assert.equal(stop.status, 1);
  assert.match(stop.stdout, /in discovery/);
  const gate = sync("release-gate");
  assert.equal(gate.status, 1);
  assert.match(gate.stdout, /in discovery/);
});

test("phase --discovery-only stops once the app is building (mirror of --build-only)", () => {
  install(app, studio);
  profile(DISCOVERY_ROWS);
  assert.equal(sync("phase", "--discovery-only").status, 0);
  assert.equal(sync("phase", "--discovery-only").stdout.trim(), "discovery");
  fillProfile();
  const stop = sync("phase", "--discovery-only");
  assert.equal(stop.status, 1);
  assert.match(stop.stdout, /already building/);
});

// ---------- decision ids (#353) ----------

const DUP_LOG = "# PRD\n\n## Decisions\n\n### D-001 One (2026-01-01)\n- Decision: a\n\n### D-001 Two (2026-01-02)\n- Decision: b\n";
const setSince = (date) => {
  const f = join(app, ".claude/studio/lock.json");
  const lock = JSON.parse(readFileSync(f, "utf8"));
  if (date) lock.since = date;
  else delete lock.since;
  writeFileSync(f, `${JSON.stringify(lock, null, 2)}\n`);
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test("install records the install date; a pull keeps it", () => {
  install(app, studio);
  const since = readLock(app).since;
  assert.match(since, /^\d{4}-\d{2}-\d{2}$/);
  setSince("2026-01-01");
  pull(app, studio);
  assert.equal(readLock(app).since, "2026-01-01");
});

test("health: a duplicate decision id is a note during the grace period and fails after it", () => {
  install(app, studio);
  fillProfile();
  mkdirSync(join(app, "docs"), { recursive: true });
  writeFileSync(join(app, "docs/PRD.md"), DUP_LOG);
  const inside = health();
  assert.equal(inside.status, 0, inside.stdout);
  assert.match(inside.stdout, /note: decision id D-001 used more than once in docs\/PRD\.md/);
  setSince(daysAgo(30));
  const after = health();
  assert.equal(after.status, 1);
  assert.match(after.stdout, /- decision id D-001 used more than once/);
  setSince(null); // an old lock with no date yet: only a note, until the next sync records one
  assert.equal(health().status, 0);
  writeFileSync(join(app, "docs/PRD.md"), DUP_LOG.replace("### D-001 Two", "### D-002 Two"));
  setSince(daysAgo(30));
  assert.equal(health().status, 0);
  assert.doesNotMatch(health().stdout, /decision id/);
});

test("health reads the decision log named in the App profile's Decision log row", () => {
  install(app, studio);
  profile("| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |\n| Decision log | `docs/DECISIONS.md` |");
  mkdirSync(join(app, "docs"), { recursive: true });
  writeFileSync(join(app, "docs/DECISIONS.md"), DUP_LOG);
  setSince(daysAgo(30));
  assert.match(health().stdout, /used more than once in docs\/DECISIONS\.md/);
});

test("build: TBD fails health, and a missing Phase row means build", () => {
  install(app, studio);
  profile("| Phase | build |\n| Id prefix | `DM` |\n| Repo | r |\n| Stack | TBD |\n| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |");
  assert.match(health().stdout, /still says TBD in build: Stack/);
  fillProfile();
  assert.equal(sync("phase").stdout.trim(), "build");
  assert.equal(sync("phase", "--build-only").status, 0);
  assert.equal(health().status, 0, health().stdout);
  // An app that predates Phase and has TBD in it is held to the build rules.
  profile("| Stack | TBD |\n| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |");
  assert.match(health().stdout, /TBD in build/);
});

test("discovery: identity fields can't be TBD, and Phase must be a known value", () => {
  install(app, studio);
  profile("| Phase | discovery |\n| Id prefix | TBD |\n| Repo | TBD |\n| AI | TBD |\n| Access model | TBD |\n| Storage shape | TBD |");
  assert.match(health().stdout, /may not say TBD for Id prefix, Repo/);
  profile("| Phase | planning |\n| AI | off |\n| AI plan | none |\n| Access model | only invited people |\n| Storage shape | per-person documents |");
  assert.match(health().stdout, /Phase must be "discovery" or "build"/);
});

test("discovery start, then packs added later: the Harness workflow copied by hand stays clean", () => {
  cpSync(join(repo, "packs"), join(studio, "packs"), { recursive: true });
  install(app, studio);
  profile(DISCOVERY_ROWS);
  for (const f of [".github/workflows/harness.yml", ".nvmrc"]) {
    mkdirSync(dirname(join(app, f)), { recursive: true });
    copyFileSync(join(studio, "packs/base/starter", f), join(app, f));
  }
  assert.equal(health().status, 0, health().stdout);
  const add = sync("pack", "add", "artifact", "--slug", "demo", "--title", "Demo");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.doesNotMatch(add.stdout, /kept|differ/i);
});

test("harness-idea intake: the issue template and the skill agree, and the duplicate check sees unlabelled ideas (#127)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const tpl = readFileSync(join(root, ".github/ISSUE_TEMPLATE/harness-idea.yml"), "utf8");
  assert.match(tpl, /labels:\s*\["harness-idea"\]/);
  for (const id of ["app", "version"]) {
    assert.match(tpl, new RegExp(`id: ${id}\\n[\\s\\S]*?required: true`), `template field ${id} must be required`);
  }
  const skill = readFileSync(join(root, "plugins/studio/skills/harness-idea/SKILL.md"), "utf8");
  assert.match(skill, /\*\*App name\*\*/);
  assert.match(skill, /\*\*Harness version\*\*/);
  assert.match(skill, /title starts with `\[harness-idea\]`[^\n]*labelled or not/);
  const gov = readFileSync(join(root, "docs/governance/intake.md"), "utf8");
  assert.match(gov, /Closing an idea always leaves exactly one comment/);
  const sync = readFileSync(join(root, "plugins/studio/skills/harness-sync/SKILL.md"), "utf8");
  assert.match(sync, /this app's own ideas that got fixed/);
  // the idea loop: apps send a harness-idea, never the studio-side procedure
  assert.doesNotMatch(sync, /Part B|change the harness itself\n[\s\S]*version/i, "harness-sync must not ship the studio-side procedure");
  assert.match(skill, /search closed issues/i);
  assert.doesNotMatch(skill, /part B/i);
  const bf = readFileSync(join(root, "plugins/studio/skills/build-feature/SKILL.md"), "utf8");
  assert.match(bf, /send it to `app-studio` as a `harness-idea`/);
  assert.doesNotMatch(bf, /part B/);
});

// ---------- project instructions template ----------

const instrTemplate = () => join(studio, "plugins/studio/templates/project-instructions.md");

test("a new app records the instructions template it was given, so check stays quiet", () => {
  install(app, studio);
  fillProfile();
  assert.ok(readLock(app).instructions);
  assert.doesNotMatch(sync("check").stdout, /Project instructions/);
});

test("a changed instructions template is a note with a ready prompt, never drift, until ack instructions", () => {
  install(app, studio);
  fillProfile();
  writeFileSync(instrTemplate(), `${readFileSync(instrTemplate(), "utf8")}\n- A new rule.\n`);
  const r = compare(app, studio);
  assert.equal(r.instructionsChanged, true);
  assert.equal(drift(r), false);
  const out = sync("check", "--studio", studio).stdout;
  assert.match(out, /Project instructions template changed[\s\S]*ask your coordinator to compare and update[\s\S]*Ready prompt/);
  assert.match(out, /ack instructions/);
  assert.match(sync("pull", "--studio", studio, "--live-check").stdout, /ask your coordinator to compare and update/);
  assert.deepEqual(ack(app, studio, ["instructions"]), ["instructions"]);
  assert.doesNotMatch(sync("check", "--studio", studio).stdout, /Project instructions/);
  assert.deepEqual(ack(app, studio, ["instructions"]), []);
});

test("an app with no recorded review is told once; wording outside the template body doesn't count", () => {
  install(app, studio);
  fillProfile();
  const lock = readLock(app);
  delete lock.instructions;
  writeFileSync(join(app, ".claude/studio/lock.json"), JSON.stringify(lock));
  assert.equal(compare(app, studio).instructionsChanged, true);
  ack(app, studio, ["instructions"]);
  const t = readFileSync(instrTemplate(), "utf8");
  writeFileSync(instrTemplate(), t.replace("keep it short", "keep it brief"));
  assert.equal(compare(app, studio).instructionsChanged, false, "the intro above the --- line is not the instructions");
});

test("pull adds the 'did not check' line under the new heading 'Writing for the App Creator' too, without a second heading (rename phase A)", () => {
  install(app, studio);
  const old = "# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n| App | Demo |\n| Decision log | `docs/D.md` |\n\n## Writing for the App Creator\n\nPlain English.\n\n## Last\n\nkeep\n";
  writeFileSync(join(app, "CLAUDE.md"), old);
  pull(app, studio);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.match(text, /## Writing for the App Creator\n\nPlain English\.\n\nBefore saying something is done[^\n]*did not check[^\n]*\n\n## Last/);
  assert.equal((text.match(/^## Writing for/gm) ?? []).length, 1);
});

test("pull renames an app's old heading 'Writing for Ale' and leaves its text alone (rename phase B)", () => {
  install(app, studio);
  const own = "# Demo\n\n## Writing for Ale\n\nPlain English. We say what we did not check.\n\n## Last\n\nkeep\n";
  writeFileSync(join(app, "CLAUDE.md"), own);
  const r = pull(app, studio);
  assert.equal(r.patched.filter((x) => /Writing for Ale/.test(x)).length, 1);
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  assert.match(text, /## Writing for the App Creator\n\nPlain English\. We say what we did not check\.\n\n## Last/);
  assert.doesNotMatch(text, /Writing for Ale/);
  assert.equal(pull(app, studio).patched.filter((x) => /Writing for Ale/.test(x)).length, 0, "second pull changes nothing");
});

test("the harness-idea duplicate search lists labelled, unlabelled and closed issues compactly, and fails cleanly", async () => {
  const { dupSearch } = await import("../plugins/studio/skills/harness-idea/dup-search.mjs");
  const issue = (number, state, title, labels = []) => ({ number, state, title, labels: labels.map((name) => ({ name })) });
  const calls = [];
  const api = {
    search: (q) => {
      calls.push(q);
      return q.includes("release")
        ? [issue(5, "closed", "[harness-idea] release: wording", ["harness-idea"]), issue(9, "open", "Release skill is slow")]
        : [issue(5, "closed", "[harness-idea] release: wording", ["harness-idea"]), issue(7, "open", "[harness-idea] hook: x")];
    },
    comments: (r, n) => (n === 5 ? [{ body: "first" }, { body: "Fixed in 0.9.0 (PR #4).\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_" }] : []),
  };
  const lines = dupSearch("o/r", ["release", "hook"], api);
  assert.equal(calls.length, 2, "one search per term, open and closed together");
  assert.ok(calls.every((q) => q.includes("repo:o/r") && !q.includes("is:open") && !q.includes("is:closed")));
  assert.equal(lines.length, 3, "one line per issue, deduplicated");
  assert.match(lines[0], /^#5 closed \[harness-idea\] .*closing comment: Fixed in 0\.9\.0 \(PR #4\)\.$/, "most matches first, last comment, footer dropped");
  assert.match(lines.join("\n"), /#9 open \[no label\] Release skill is slow/, "unlabelled issues are found");
  const many = Array.from({ length: 40 }, (_, i) => issue(i + 1, "open", `t${i}`));
  assert.equal(dupSearch("o/r", ["a"], { search: () => many, comments: () => [] }).length, 20, "capped at 20 lines");
  const bad = spawnSync(process.execPath, [join(repo, "plugins/studio/skills/harness-idea/dup-search.mjs"), "not-a-repo"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("sync report: one line per release newer than the app, then what needs the App Creator", () => {
  const ver = studioVersion(studio);
  record(studio, "0.0.1", { summary: "Old thing", appActions: ["add a profile row"] });
  record(studio, "0.0.2", { summary: "Middle thing", refs: { issues: [7], ideas: [], pr: 8 }, adminActions: ["paste the script again"] });
  record(studio, ver, { summary: "Newest thing" });
  const r = syncReport(studio, "0.0.1");
  assert.match(r, new RegExp(`Releases 0\\.0\\.1 -> ${ver.replace(/\./g, "\\.")}:`));
  assert.match(r, /0\.0\.2 {2}Middle thing \(#7, PR #8\)/);
  assert.match(r, /Newest thing/);
  assert.ok(!r.includes("Old thing") && !r.includes("add a profile row"), "releases the app already has stay out");
  assert.match(r, /Admin actions[\s\S]*0\.0\.2:[\s\S]*1\. paste the script again/);
  assert.ok(!/App actions \(/.test(r), "no App action in range, none listed");
  assert.match(r, /release\.mjs details <version>/);
  assert.match(syncReport(studio, "0.0.0"), /App actions[\s\S]*1\. add a profile row/);
  rmSync(join(studio, "releases"), { recursive: true });
  record(studio, ver);
  assert.match(syncReport(studio, "0.0.1"), /Needs you:\n {2}nothing/);
  assert.match(syncReport(studio, ver), /nothing to report/);
});

test("changelog command and pull print the report from the records, a few lines instead of the changelog", () => {
  const master = (...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app], { encoding: "utf8" });
  const ver = studioVersion(studio);
  record(studio, ver, { summary: "Brand new", appActions: ["do it"] });
  const r = master("changelog", "--since", "0.0.1");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Brand new/);
  assert.match(r.stdout, /1\. do it/);
  install(app, studio, {});
  const lock = JSON.parse(readFileSync(join(app, ".claude/studio/lock.json"), "utf8"));
  lock.studio = "0.0.1";
  writeFileSync(join(app, ".claude/studio/lock.json"), JSON.stringify(lock));
  const p = master("pull", "--force");
  assert.match(p.stdout, /Releases 0\.0\.1 ->/);
  assert.match(master("changelog").stdout, /nothing to report/, "after the pull the app is up to date");
});

// ---------- release helpers (#172) ----------

const gitIn = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });

test("status: next free version counts versions held by other branches, and the live-check state", () => {
  const origin = join(tmp, "origin.git");
  gitIn(tmp, "init", "-q", "--bare", origin);
  gitIn(studio, "init", "-q", "-b", "main");
  gitIn(studio, "config", "user.email", "t@t");
  gitIn(studio, "config", "user.name", "t");
  const ver = studioVersion(studio);
  record(studio, ver, { ...PENDING, status: { main: "passed 2026-11-11" } });
  gitIn(studio, "add", "-A");
  gitIn(studio, "commit", "-qm", "base");
  gitIn(studio, "remote", "add", "origin", origin);
  gitIn(studio, "push", "-q", "origin", "main");
  gitIn(studio, "checkout", "-q", "-b", "other");
  const pj = join(studio, "plugins/studio/.claude-plugin/plugin.json");
  const [a, b] = ver.split(".").map(Number);
  writeFileSync(pj, readFileSync(pj, "utf8").replace(ver, `${a}.${b + 1}.0`));
  gitIn(studio, "commit", "-qam", "bump");
  gitIn(studio, "push", "-q", "origin", "other");
  gitIn(studio, "checkout", "-q", "main");
  const st = studioStatus(studio);
  assert.equal(st.current, ver);
  assert.equal(st.nextMinor, `${a}.${b + 2}.0`, "a branch already holds the next minor");
  assert.equal(st.nextPatch, `${a}.${b + 1}.1`);
  assert.match(st.live, /^passed/);
  assert.match(st.text, /Versions already held by other branches: .*other/);
});

test("release-prepare: proposes the bump from commit subjects", () => {
  assert.equal(proposeBump(["feat: x", "fix: y"], "0.3.0"), "minor");
  assert.equal(proposeBump(["fix(ui): y"], "0.3.0"), "patch");
  assert.equal(proposeBump(["docs: z", "chore: w"], "0.3.0"), null);
  assert.equal(proposeBump(["feat!: big"], "1.2.0"), "major");
  assert.equal(proposeBump(["feat!: big"], "0.2.0"), "minor");
});

const APP_LOG = `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Added\n\n- New thing.\n\n## [0.2.0] - 2026-01-01\n\n- Old.\n\n[Unreleased]: https://github.com/o/r/compare/v0.2.0...HEAD\n[0.2.0]: https://github.com/o/r/compare/v0.1.0...v0.2.0\n`;

test("release-prepare: moves Unreleased into a dated section and fixes the compare links", () => {
  const r = applyRelease(APP_LOG, "0.3.0", "2026-02-02", { prevTag: "v0.2.0", repoUrl: "https://github.com/o/r.git" });
  assert.match(r.text, /## \[Unreleased\]\n\n## \[0\.3\.0\] - 2026-02-02\n\n### Added\n\n- New thing\.\n\n## \[0\.2\.0\]/);
  assert.match(r.text, /\[Unreleased\]: https:\/\/github\.com\/o\/r\/compare\/v0\.3\.0\.\.\.HEAD\n\[0\.3\.0\]: https:\/\/github\.com\/o\/r\/compare\/v0\.2\.0\.\.\.v0\.3\.0\n\[0\.2\.0\]/);
  assert.equal(r.text.match(/^\[Unreleased\]:/gm).length, 1);
  assert.match(applyRelease("## [Unreleased]\n\n## [0.1.0] - x\n", "0.2.0", "d").error, /no entries/);
  assert.match(applyRelease(APP_LOG, "0.2.0", "d").error, /already has an entry/);
  assert.match(applyRelease("# C\n", "0.2.0", "d").error, /no `## \[Unreleased\]`/);
});

test("release-prepare: dry run changes nothing, --apply writes, an existing tag is refused", () => {
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "CHANGELOG.md"), APP_LOG);
  writeFileSync(join(app, "package.json"), '{"version":"0.2.0"}');
  gitIn(app, "init", "-q", "-b", "main");
  gitIn(app, "config", "user.email", "t@t");
  gitIn(app, "config", "user.name", "t");
  gitIn(app, "remote", "add", "origin", "git@github.com:o/r.git");
  gitIn(app, "add", "-A");
  gitIn(app, "commit", "-qm", "chore: start");
  gitIn(app, "tag", "v0.2.0");
  writeFileSync(join(app, "a.txt"), "a");
  gitIn(app, "add", "-A");
  gitIn(app, "commit", "-qm", "feat: add a");
  const dry = releasePrepare(app, { date: "2026-02-02" });
  assert.ok(dry.ok);
  assert.equal(dry.version, "0.3.0");
  assert.match(dry.text, /Dry run/);
  assert.match(dry.text, /release-cut --version 0\.3\.0/);
  assert.doesNotMatch(dry.text, /--apply/, "the dry run names one route only");
  assert.equal(readFileSync(join(app, "CHANGELOG.md"), "utf8"), APP_LOG, "dry run leaves the file alone");
  const done = releasePrepare(app, { apply: true, date: "2026-02-02" });
  assert.ok(done.ok);
  const text = readFileSync(join(app, "CHANGELOG.md"), "utf8");
  assert.match(text, /## \[0\.3\.0\] - 2026-02-02/);
  assert.match(text, /\[0\.3\.0\]: https:\/\/github\.com\/o\/r\/compare\/v0\.2\.0\.\.\.v0\.3\.0/);
  writeFileSync(join(app, "CHANGELOG.md"), APP_LOG);
  const refused = releasePrepare(app, { version: "0.2.0" });
  assert.equal(refused.ok, false);
  assert.match(refused.text, /already exists/);
});

test("release-prepare finds the last tag in a clone that did not fetch tags (shallow or --no-tags)", () => {
  const origin = join(tmp, "tag-origin");
  mkdirSync(origin, { recursive: true });
  writeFileSync(join(origin, "CHANGELOG.md"), APP_LOG);
  writeFileSync(join(origin, "package.json"), '{"version":"0.2.0"}');
  gitIn(origin, "init", "-q", "-b", "main");
  gitIn(origin, "config", "user.email", "t@t");
  gitIn(origin, "config", "user.name", "t");
  gitIn(origin, "add", "-A");
  gitIn(origin, "commit", "-qm", "chore: start");
  gitIn(origin, "tag", "v0.1.0");
  gitIn(origin, "tag", "v0.2.0");
  writeFileSync(join(origin, "a.txt"), "a");
  gitIn(origin, "add", "-A");
  gitIn(origin, "commit", "-qm", "feat: add a");
  for (const [name, extra] of [["noTags", ["--no-tags"]], ["shallow", ["--depth", "1", "--no-tags"]]]) {
    const clone = join(tmp, `tag-${name}`);
    const c = gitIn(tmp, "clone", "-q", ...extra, `file://${origin}`, clone);
    assert.equal(c.status, 0, c.stderr);
    assert.equal((gitIn(clone, "tag", "--list").stdout ?? "").trim(), "", `${name}: the clone starts without tags`);
    const r = releasePrepare(clone, { date: "2026-02-02" });
    assert.match(r.text, /Last tag: v0\.2\.0;/, `${name}: ${r.text}`);
  }
  // No origin and no tags at all: still answers "none" without failing.
  const bare = join(tmp, "tag-none");
  mkdirSync(bare, { recursive: true });
  writeFileSync(join(bare, "CHANGELOG.md"), APP_LOG);
  gitIn(bare, "init", "-q", "-b", "main");
  gitIn(bare, "config", "user.email", "t@t");
  gitIn(bare, "config", "user.name", "t");
  gitIn(bare, "add", "-A");
  gitIn(bare, "commit", "-qm", "feat: x");
  assert.match(releasePrepare(bare, { date: "2026-02-02" }).text, /Last tag: none;/);
});

test("release-prepare and status run from the command line", () => {
  const cli = join(studio, "scripts/studio-sync.mjs");
  const r = spawnSync("node", [cli, "status", "--studio", studio], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Next free: patch/);
});

// ---------- release-cut, release-tag-check, sync, live-check-pass (mechanical release and update steps) ----------

/** An app repo on main with a bare origin, a v0.2.0 tag, a feat commit and an Unreleased entry. */
function releaseApp() {
  const origin = join(tmp, "app-origin.git");
  gitIn(tmp, "init", "-q", "--bare", "-b", "main", origin);
  mkdirSync(app, { recursive: true });
  profile("| Access model | only invited people |");
  writeFileSync(join(app, "CHANGELOG.md"), APP_LOG);
  writeFileSync(join(app, "package.json"), '{\n  "name": "demo",\n  "version": "0.2.0"\n}\n');
  gitIn(app, "init", "-q", "-b", "main");
  gitIn(app, "config", "user.email", "t@t");
  gitIn(app, "config", "user.name", "t");
  gitIn(app, "add", "-A");
  gitIn(app, "commit", "-qm", "chore: start");
  gitIn(app, "tag", "v0.2.0");
  writeFileSync(join(app, "a.txt"), "a");
  gitIn(app, "add", "-A");
  gitIn(app, "commit", "-qm", "feat: add a");
  gitIn(app, "remote", "add", "origin", origin);
  gitIn(app, "push", "-q", "origin", "main", "v0.2.0");
  return origin;
}
const branchOf = (dir) => gitIn(dir, "rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
const cliIn = (dir, ...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args], { cwd: dir, encoding: "utf8" });

test("release-cut: from a clean, current main it branches, bumps package.json and moves Unreleased", () => {
  releaseApp();
  const r = releaseCut(app, { version: "0.3.0", date: "2026-02-02" });
  assert.ok(r.ok, r.text);
  assert.equal(branchOf(app), "chore/release-v0.3.0");
  assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version, "0.3.0");
  assert.match(readFileSync(join(app, "CHANGELOG.md"), "utf8"), /## \[Unreleased\]\n\n## \[0\.3\.0\] - 2026-02-02\n\n### Added/);
  assert.match(r.text, /tidy the wording/i);
  assert.match(r.text, /chore\(release\): v0\.3\.0/);
  assert.equal(gitIn(app, "log", "-1", "--format=%s").stdout.trim(), "feat: add a", "it never commits");
});

test("release-cut: keeps a session branch that sits on origin/main (cloud)", () => {
  releaseApp();
  gitIn(app, "checkout", "-q", "-b", "claude/session-x");
  const r = releaseCut(app, { version: "0.3.0", date: "2026-02-02" });
  assert.ok(r.ok, r.text);
  assert.equal(branchOf(app), "claude/session-x");
});

test("release-cut: stops and changes nothing on a dirty tree, an unsynced branch, a taken tag, no version or empty Unreleased", () => {
  releaseApp();
  const untouched = () => {
    assert.equal(readFileSync(join(app, "CHANGELOG.md"), "utf8"), APP_LOG);
    assert.equal(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).version, "0.2.0");
  };
  assert.match(releaseCut(app, {}).text, /--version/);
  assert.match(releaseCut(app, { version: "0.2.0" }).text, /already exists/);
  untouched();

  writeFileSync(join(app, "b.txt"), "b");
  const dirty = releaseCut(app, { version: "0.3.0" });
  assert.equal(dirty.ok, false);
  assert.match(dirty.text, /not clean/);
  rmSync(join(app, "b.txt"));
  untouched();
  assert.equal(branchOf(app), "main");

  gitIn(app, "checkout", "-q", "-b", "feature/x");
  writeFileSync(join(app, "c.txt"), "c");
  gitIn(app, "add", "-A");
  gitIn(app, "commit", "-qm", "feat: c");
  const off = releaseCut(app, { version: "0.3.0" });
  assert.equal(off.ok, false);
  assert.match(off.text, /origin\/main/);
  assert.equal(branchOf(app), "feature/x");
  gitIn(app, "checkout", "-q", "main");
  untouched();

  writeFileSync(join(app, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-01-01\n\n- Old.\n");
  gitIn(app, "commit", "-qam", "docs: empty unreleased");
  gitIn(app, "push", "-q", "origin", "main");
  const empty = releaseCut(app, { version: "0.3.0" });
  assert.equal(empty.ok, false);
  assert.match(empty.text, /no entries/);
  assert.equal(branchOf(app), "main", "no branch is made when it stops");
});

test("release-cut: stops while the release gate does (blank access model)", () => {
  releaseApp();
  profile("| Access model | |");
  gitIn(app, "commit", "-qam", "docs: blank");
  gitIn(app, "push", "-q", "origin", "main");
  const r = releaseCut(app, { version: "0.3.0" });
  assert.equal(r.ok, false);
  assert.match(r.text, /Access model is blank/);
});

test("release-cut: pulls main first when origin moved on", () => {
  const origin = releaseApp();
  const other = join(tmp, "other");
  gitIn(tmp, "clone", "-q", origin, other);
  gitIn(other, "config", "user.email", "t@t");
  gitIn(other, "config", "user.name", "t");
  writeFileSync(join(other, "d.txt"), "d");
  gitIn(other, "add", "-A");
  gitIn(other, "commit", "-qm", "fix: d");
  gitIn(other, "push", "-q", "origin", "main");
  const r = releaseCut(app, { version: "0.3.0", date: "2026-02-02" });
  assert.ok(r.ok, r.text);
  assert.ok(existsSync(join(app, "d.txt")), "main was pulled");
});

test("release-tag-check: says whether the tag is on origin, and gives the old-app fallback only without the workflow", () => {
  releaseApp();
  const missing = tagCheck(app, "0.3.0");
  assert.equal(missing.ok, false);
  assert.match(missing.text, /git tag -a v0\.3\.0/, "no release-tag.yml: the fallback is printed");
  mkdirSync(join(app, ".github/workflows"), { recursive: true });
  writeFileSync(join(app, ".github/workflows/release-tag.yml"), "name: Release tag\n");
  const waiting = tagCheck(app, "0.3.0");
  assert.equal(waiting.ok, false);
  assert.doesNotMatch(waiting.text, /git tag -a/);
  assert.match(waiting.text, /Release tag/);
  const found = tagCheck(app, "v0.2.0");
  assert.ok(found.ok, found.text);
  const cli = cliIn(app, "release-tag-check", "0.2.0", "--app", app);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cliIn(app, "release-tag-check", "--app", app).status, 2, "a version is required");
});

test("live-check-pass moved to release.mjs pass-main, and status points there while a release is pending", () => {
  const bad = cliIn(studio, "live-check-pass", "0.9.0", "--studio", studio);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /release\.mjs pass-main/);
  const ver = studioVersion(studio);
  record(studio, ver, PENDING);
  assert.match(studioStatus(studio).text, new RegExp(`release\\.mjs pass-main ${ver.replace(/\./g, "\\.")}`));
});

/** app-studio as a git clone of a bare origin, and an app installed from it. */
function syncSetup() {
  const origin = join(tmp, "studio-origin.git");
  gitIn(tmp, "init", "-q", "--bare", "-b", "main", origin);
  for (const [k, v] of [["init", ["-q", "-b", "main"]], ["config", ["user.email", "t@t"]], ["config", ["user.name", "t"]]]) gitIn(studio, k, ...v);
  gitIn(studio, "add", "-A");
  gitIn(studio, "commit", "-qm", "base");
  gitIn(studio, "remote", "add", "origin", origin);
  gitIn(studio, "push", "-q", "-u", "origin", "main");
  install(app, studio);
  fillProfile();
  // A newer release lands on app-studio's origin from elsewhere.
  const up = join(tmp, "studio-up");
  gitIn(tmp, "clone", "-q", origin, up);
  gitIn(up, "config", "user.email", "t@t");
  gitIn(up, "config", "user.name", "t");
  const skill = "plugins/studio/skills/release/SKILL.md";
  writeFileSync(join(up, skill), `${readFileSync(join(up, skill), "utf8")}\nNew upstream line.\n`);
  gitIn(up, "commit", "-qam", "upstream change");
  gitIn(up, "push", "-q", "origin", "main");
  return { up, skill: ".claude/skills/release/SKILL.md" };
}
const masterSync = (...args) => cliIn(app, "sync", "--app", app, "--studio", studio, ...args);

test("sync: pulls app-studio, updates the app, runs health and prints the commit line", () => {
  const { skill } = syncSetup();
  gitIn(studio, "checkout", "-q", "-b", "claude/session-y"); // a cloud clone: session branch, no upstream
  const r = masterSync();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(readFileSync(join(app, skill), "utf8"), /New upstream line/, "app-studio was pulled before the app was updated");
  assert.match(r.stdout, /pulled into/);
  assert.match(r.stdout, /is healthy/);
  assert.match(r.stdout, /chore\(harness\): sync studio v\d+\.\d+\.\d+/);
});

test("sync: stops before health on an edited file, and goes on with --force", () => {
  const { skill } = syncSetup();
  writeFileSync(join(app, skill), "edited here\n");
  const r = masterSync();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /skipped[\s\S]*release\/SKILL\.md/);
  assert.match(r.stdout, /harness-idea[\s\S]*--force/);
  assert.doesNotMatch(r.stdout, /chore\(harness\)/);
  const forced = masterSync("--force");
  assert.equal(forced.status, 0, forced.stdout + forced.stderr);
  assert.match(readFileSync(join(app, skill), "utf8"), /New upstream line/);
});

/** Upstream gets a new released version with a changelog entry. */
function upstreamRelease(up, ver, line) {
  const pj = join(up, "plugins/studio/.claude-plugin/plugin.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace(/"version": "[^"]+"/, `"version": "${ver}"`));
  record(up, ver, { summary: line, appActions: [line] });
  gitIn(up, "add", "-A");
  gitIn(up, "commit", "-qm", `release ${ver}`);
  gitIn(up, "push", "-q", "origin", "main");
}

test("sync: the release report is printed once", () => {
  const { up } = syncSetup();
  upstreamRelease(up, "9.9.9", "ONCE-MARKER");
  const r = masterSync();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.split("ONCE-MARKER").length - 1, 2, "one summary line and one App action line, nothing repeated");
  assert.equal(r.stdout.split("Releases ").length - 1, 1);
});

test("sync: when already in step it says so and prints no commit line", () => {
  syncSetup();
  assert.equal(masterSync().status, 0);
  const again = masterSync();
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /already in step, nothing to commit/);
  assert.doesNotMatch(again.stdout, /chore\(harness\)/);
});

test("sync: the --force rerun still prints the changelog excerpt from the version the sync started on", () => {
  const { up, skill } = syncSetup();
  gitIn(app, "init", "-q", "-b", "main");
  upstreamRelease(up, "9.9.9", "MARKER-NEW-APP-ACTION");
  writeFileSync(join(app, skill), "edited here\n");
  const first = masterSync();
  assert.equal(first.status, 1);
  assert.match(first.stdout, /MARKER-NEW-APP-ACTION/);
  const forced = masterSync("--force");
  assert.equal(forced.status, 0, forced.stdout + forced.stderr);
  assert.match(forced.stdout, /MARKER-NEW-APP-ACTION/, "excerpt survives the rerun");
  assert.match(forced.stdout, /chore\(harness\): sync studio v9\.9\.9/);
});

test("sync: keeps the live-check gate (pending release changes nothing)", () => {
  const { up } = syncSetup();
  const ver = "9.9.9";
  const pj = join(up, "plugins/studio/.claude-plugin/plugin.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace(/"version": "[^"]+"/, `"version": "${ver}"`));
  record(up, ver, PENDING);
  gitIn(up, "add", "-A");
  gitIn(up, "commit", "-qm", "pending");
  gitIn(up, "push", "-q", "origin", "main");
  const lockBefore = readFileSync(join(app, ".claude/studio/lock.json"), "utf8");
  const r = masterSync();
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /not live-checked yet/);
  assert.doesNotMatch(r.stdout, /Releases /, "a refusal changed nothing, so it shows no report");
  assert.equal(readFileSync(join(app, ".claude/studio/lock.json"), "utf8"), lockBefore);
  assert.doesNotMatch(r.stdout, /chore\(harness\)/);
});

test("sync: stops when app-studio can't be pulled", () => {
  syncSetup();
  gitIn(studio, "remote", "set-url", "origin", join(tmp, "nowhere.git"));
  const r = masterSync();
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /could not pull app-studio/i);
});

test("a skill's real model is read from the transcript's last turn, after the Skill call (#288)", () => {
  const dir = mkdtempSync(join(tmpdir(), "skillmodel-"));
  try {
    const asst = (model, content = [], extra = {}) => JSON.stringify({ type: "assistant", message: { model, content }, effort: "high", ...extra });
    const user = (content) => JSON.stringify({ type: "user", message: { content } });
    const call = { type: "tool_use", name: "Skill", input: { skill: "harness-idea" } };
    const file = join(dir, "t.jsonl");
    writeFileSync(
      file,
      [
        user("old prompt"),
        asst("claude-opus-5-5", [call]),
        user("new prompt"),
        asst("claude-opus-5-5", [call]),
        user([{ type: "tool_result" }]),
        JSON.stringify({ type: "user", isMeta: true, message: { content: "Base directory for this skill: ..." } }),
        asst("claude-haiku-5-5", [], { effort: "low" }),
        asst("claude-sonnet-5-5", [], { isSidechain: true }),
        user("a later notification"),
        asst("claude-opus-5-5"),
      ].join("\n"),
    );
    assert.deepEqual(skillModels({ transcript_path: file }), [{ skill: "harness-idea", before: "claude-opus-5-5", models: ["claude-haiku-5-5"], efforts: ["low"] }]);
    assert.deepEqual(skillModels({ transcript_path: join(dir, "none") }), []);
    const out = spawnSync(process.execPath, [join(repo, "scripts/studio-env.mjs"), "skills", file], { encoding: "utf8" });
    assert.match(out.stdout, /skill harness-idea before=claude-opus-5-5 model=claude-haiku-5-5 effort=low/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- batches (#351): apps get releases, never what merged since the last one ----------

/** Upstream merges a change that reaches apps without a release: one more line in a skill, and its unreleased entry. */
function upstreamUnreleased(up, id, line, kind = "app-facing") {
  const skill = "plugins/studio/skills/release/SKILL.md";
  writeFileSync(join(up, skill), `${readFileSync(join(up, skill), "utf8")}\n${line}\n`);
  mkdirSync(join(up, "releases/unreleased"), { recursive: true });
  writeFileSync(join(up, "releases/unreleased", `${id}.json`), JSON.stringify({ id, date: "2026-11-26", bump: "patch", summary: `Change ${id}`, kind, refs: { issues: [], ideas: [], pr: null }, appCreator: [], appActions: [], adminActions: [], checks: { branch: { none: "test" }, main: [] }, status: { main: "not needed" }, notVerified: [] }));
  gitIn(up, "add", "-A");
  gitIn(up, "commit", "-qm", `change ${id}`);
  gitIn(up, "push", "-q", "origin", "main");
}

test("sync: a change merged without a release does not reach the app; the release that batches it does, as one release", () => {
  const { up, skill } = syncSetup();
  const before = studioVersion(studio);
  upstreamUnreleased(up, "e1", "UNRELEASED-ONE");
  upstreamUnreleased(up, "e2", "UNRELEASED-TWO");
  // The sync tool itself changed upstream too, unreleased: the app's pull and health must run the release's code, not this.
  const tool = join(up, "scripts/studio-sync.mjs");
  writeFileSync(tool, readFileSync(tool, "utf8").replace("function run(argv) {", 'function run(argv) {\n  if (["pull", "health"].includes(argv[0])) console.log("UNRELEASED-CODE-RAN");'));
  gitIn(up, "commit", "-qam", "unreleased tool change");
  gitIn(up, "push", "-q", "origin", "main");
  const r = masterSync();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /UNRELEASED-CODE-RAN/, "a plain sync runs the released sync code in the app");
  assert.match(masterSync("--live-check").stdout, /UNRELEASED-CODE-RAN/, "the live check runs the checkout as it is");
  assert.equal(masterSync().status, 0);
  const text = () => readFileSync(join(app, skill), "utf8");
  assert.match(text(), /New upstream line/, "what was already released arrives");
  assert.doesNotMatch(text(), /UNRELEASED/, "what merged since the release does not");
  assert.equal(readLock(app).studio, before);
  assert.equal(sync("check").status, 0, "the app is in step with the release, whatever main holds");
  assert.match(sync("health").stdout, /is healthy/);
  assert.doesNotMatch(sync("health").stdout, /behind app-studio/);
  // The studio-scratch live check and the packs smoke test try what is not released yet, and stay consistent afterwards.
  assert.equal(sync("pull", "--studio", studio, "--live-check").status, 0);
  assert.match(text(), /UNRELEASED-ONE[\s\S]*UNRELEASED-TWO/);
  assert.equal(readLock(app).unreleased, true);
  assert.equal(sync("check").status, 0, "a preview copy is compared with the checkout it came from");
  assert.equal(sync("pull", "--studio", studio).status, 0);
  assert.doesNotMatch(text(), /UNRELEASED/, "an ordinary pull goes back to the release");
  assert.equal(readLock(app).unreleased, undefined);
  // The cut: one version, one record listing both changes, no entry left.
  const pj = join(up, "plugins/studio/.claude-plugin/plugin.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace(/"version": "[^"]+"/, '"version": "9.9.9"'));
  const change = (id) => JSON.parse(readFileSync(join(up, "releases/unreleased", `${id}.json`), "utf8"));
  record(up, "9.9.9", { summary: "2 changes", changes: [change("e1"), change("e2")] });
  rmSync(join(up, "releases/unreleased"), { recursive: true });
  gitIn(up, "add", "-A");
  gitIn(up, "commit", "-qm", "release 9.9.9");
  gitIn(up, "push", "-q", "origin", "main");
  const cut = masterSync();
  assert.equal(cut.status, 0, cut.stdout + cut.stderr);
  assert.match(text(), /UNRELEASED-ONE[\s\S]*UNRELEASED-TWO/);
  assert.match(cut.stdout, new RegExp(`Releases ${before.replace(/\./g, "\\.")} -> 9\\.9\\.9:\\n {2}9\\.9\\.9 {2}2 changes\\n {6}- Change e1\\n {6}- Change e2`));
  assert.equal((cut.stdout.match(/^ {2}9\.9\.9 /gm) ?? []).length, 1, "the batch shows as one release");
  assert.match(cut.stdout, /chore\(harness\): sync studio v9\.9\.9/);
});

test("released view: internal entries change nothing; a checkout whose history cannot give the release changes nothing in the app", () => {
  const { up, skill } = syncSetup();
  upstreamUnreleased(up, "i1", "INTERNAL-NOTE", "internal");
  gitIn(studio, "pull", "-q", "origin", "main");
  assert.deepEqual(releasedView(studio), { dir: studio }, "an internal change waits for a release without hiding anything");
  upstreamUnreleased(up, "e1", "UNRELEASED-ONE");
  gitIn(studio, "pull", "-q", "origin", "main");
  const view = releasedView(studio);
  assert.notEqual(view.dir, studio);
  assert.doesNotMatch(readFileSync(join(view.dir, "plugins/studio/skills/release/SKILL.md"), "utf8"), /UNRELEASED-ONE/);
  assert.match(readFileSync(join(view.dir, "plugins/studio/skills/release/SKILL.md"), "utf8"), /INTERNAL-NOTE/, "the newest commit that still holds only the release");
  rmSync(view.dir, { recursive: true, force: true });
  // No history to read the release from (a folder copy): refuse, change nothing, and stay quiet under --warn.
  rmSync(join(studio, ".git"), { recursive: true, force: true });
  const lockBefore = readFileSync(join(app, ".claude/studio/lock.json"), "utf8");
  const r = sync("pull", "--studio", studio);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not released yet[\s\S]*nothing was changed/);
  assert.equal(readFileSync(join(app, ".claude/studio/lock.json"), "utf8"), lockBefore);
  assert.doesNotMatch(readFileSync(join(app, skill), "utf8"), /UNRELEASED-ONE/);
  const warn = sync("check", "--studio", studio, "--warn");
  assert.deepEqual([warn.status, warn.stderr], [0, ""]);
  // Only a copy stops. The commit hook's health check and the commands that never read app-studio go on (against the lock alone).
  const h = sync("health");
  assert.equal(h.status, 0, h.stdout + h.stderr);
  assert.match(h.stdout, /is healthy/);
  assert.equal(sync("phase").status, 0);
  const c = sync("check");
  assert.equal(c.status, 0);
  assert.match(c.stderr, /not released yet[\s\S]*Going on without app-studio/, "the reason is said once, not hidden as 'not found'");
  // ack writes what it saw of app-studio into the lock: it stops like a copy rather than record unreleased hashes.
  const a = sync("ack");
  assert.equal(a.status, 1);
  assert.match(a.stderr, /nothing was changed/);
  assert.equal(readFileSync(join(app, ".claude/studio/lock.json"), "utf8"), lockBefore);
});
