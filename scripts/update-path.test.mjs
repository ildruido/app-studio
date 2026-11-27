// Run: node --test scripts/update-path.test.mjs
// The update path across a large version gap (issue #358): an app copy as an old release installed it (0.18.1, 0.28.1, 0.31.0, the
// versions the three real apps ran) takes `check`, `pull` and `health` of the current harness and ends sound: lock updated,
// harness-owned sections replaced, the app's own text and files untouched, hooks wired, no file lost.
// The old copies are saved fixtures built from git history: node scripts/old-app-fixtures.mjs build.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { FIXTURES, listTree, unpack } from "./old-app-fixtures.mjs";
import { actionStep, compare, drift, hashText, readLock, studioVersion, syncReport } from "./studio-sync.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "update-path-"));
// The app-studio the apps update from: this checkout's harness, packs, scripts and release records. Its unreleased entries are left
// out, so the sync tool reads the folder as it is (as it does right after a release is cut) and no test needs git history.
const studio = join(tmp, "app-studio");
const env = { ...process.env, HOME: join(tmp, "home"), STUDIO_USER_SETTINGS: join(tmp, "home/.claude/settings.json") };
delete env.CLAUDE_CODE_REMOTE;
delete env.CI;
delete env.STUDIO_DIR;
let current;

before(() => {
  for (const d of ["plugins", "packs", "releases"]) cpSync(join(repo, d), join(studio, d), { recursive: true, filter: (src) => !src.endsWith("unreleased") });
  cpSync(join(repo, "scripts"), join(studio, "scripts"), { recursive: true, filter: (src) => !src.endsWith("fixtures") });
  mkdirSync(join(studio, "docs"), { recursive: true });
  cpSync(join(repo, "docs/CHANGELOG-legacy.md"), join(studio, "docs/CHANGELOG-legacy.md"));
  current = studioVersion(studio);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const git = (app, ...args) => spawnSync("git", ["-C", app, ...args], { encoding: "utf8" });
/** The master script, as the harness-sync skill runs it. */
const master = (app, ...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app, "--studio", studio], { encoding: "utf8", env });
/** The app's own copy of the script, as the app's hooks and CI run it. */
const own = (app, ...args) => spawnSync(process.execPath, [join(app, ".claude/studio/studio-sync.mjs"), ...args, "--app", app, "--studio", studio], { encoding: "utf8", env });
const read = (app, path) => readFileSync(join(app, path), "utf8");
const snapshot = (app) => Object.fromEntries(listTree(app).map((p) => [p, hashText(read(app, p))]));

const BUILD = {
  App: "Old App",
  Phase: "build",
  "Id prefix": "`OA` (backlog items are `OA-001`, `OA-002`, …)",
  Stack: "web",
  User: "the player",
  Repo: "https://github.com/example/old-app (private)",
  "Release target": "https://old-app.example",
  "Preview target": "none",
  Capabilities: "none",
  AI: "off",
  "AI plan": "none",
  "Access model": "only invited people",
  "Storage shape": "per-person documents",
  "AI public use": "not applicable (AI is off)",
};
const DISCOVERY = { ...BUILD, Phase: "discovery", Stack: "TBD (decided at build start)", "Release target": "TBD", AI: "TBD", "AI plan": "TBD", "Access model": "TBD", "Storage shape": "TBD" };
const OWN_RULE = "- Castling is never offered while the king is in check.";
const OWN_PRODUCT = "Old App teaches chess openings to club players; the one rule that matters most is that a move shown is always legal.";

/** Fills the old template's App profile the way an app would have: its rows, a domain rule, stack notes, the product paragraph. */
function fillProfile(app, values = BUILD) {
  const lines = read(app, "CLAUDE.md").split("\n").map((l) => {
    const row = /^\|\s*([^|]+?)\s*\|/.exec(l);
    if (row && row[1] in values) return `| ${row[1]} | ${values[row[1]]} |`;
    if (l === "- <rule>") return OWN_RULE;
    if (/^- \*\*(Build|QA|Release|Preview):\*\* </.test(l)) return l.replace(/<.*>$/, "as the stack pack's docs say");
    if (l.startsWith("# <App name>")) return "# Old App: project instructions";
    return l.replace(/^<What the app is[^>]*>/, OWN_PRODUCT);
  });
  writeFileSync(join(app, "CLAUDE.md"), lines.join("\n"));
}

/** An old app copy in its own git repo, profile filled in and committed, as a real app stood before its update. */
function oldApp(name, { profile = BUILD } = {}) {
  const app = join(mkdtempSync(join(tmp, `${name}-`)), "old-app");
  mkdirSync(app, { recursive: true });
  const fixture = unpack(name, app);
  fillProfile(app, profile);
  git(app, "init", "-q");
  return { app, fixture };
}

const lockOf = (app) => JSON.parse(read(app, ".claude/studio/lock.json"));
const writeOwn = (app, files) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), text);
  }
};
const commit = (app, message) => {
  git(app, "add", "-A");
  return spawnSync("git", ["-C", app, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", message], { encoding: "utf8", env });
};
/** The lines of a harness-owned section of a CLAUDE.md text, markers included, or null. */
const owned = (text, name) => {
  const lines = text.split("\n");
  const b = lines.findIndex((l) => l.startsWith(`<!-- studio:begin ${name} `));
  const e = lines.findIndex((l) => l.trim() === `<!-- studio:end ${name} -->`);
  return b < 0 || e < 0 ? null : lines.slice(b, e + 1).join("\n");
};
const template = () => readFileSync(join(studio, "plugins/studio/templates/CLAUDE.md"), "utf8");
const SECTIONS = ["roles", "merge-rule", "thread-reports"];
/** Paths that differ between two snapshots, outside the harness's own folder. */
const changedOutsideHarness = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => !p.startsWith(".claude/") && a[p] !== b[p]).sort();

// ---------- the three versions, as installed ----------

const STACK_OF = { "web-0.18.1": "web", "plain-0.28.1": "artifact", "static-site-0.31.0": "static-site" };

for (const f of FIXTURES)
  test(`an app copy installed by ${f.version} (${f.packs.join(", ") || "no pack"}) takes the current harness in one sync and ends sound`, () => {
    const { app } = oldApp(f.name, { profile: { ...BUILD, Stack: STACK_OF[f.name] } });
    // What only the app has: its lockfile, a feature, and a settings file that is its own since the first install.
    writeOwn(app, { "package-lock.json": '{ "name": "old-app", "lockfileVersion": 3 }\n', "src/features/openings.ts": "export const first = 'e4';\n" });
    assert.equal(commit(app, "the app before its update").status, 0);
    const start = snapshot(app);
    const startClaude = read(app, "CLAUDE.md");
    const oldLock = lockOf(app);
    assert.equal(oldLock.studio, f.version);

    // Looking first changes nothing: the check, then the preview.
    const check = master(app, "check");
    assert.equal(check.status, 1);
    assert.match(check.stdout, new RegExp(`v${f.version.replaceAll(".", "\\.")} \\(app-studio has v${current.replaceAll(".", "\\.")}\\) is out of step`));
    const preview = master(app, "sync", "--dry-run");
    assert.equal(preview.status, 0, preview.stdout + preview.stderr);
    assert.match(preview.stdout, new RegExp(`Dry run: nothing was changed\\. A pull would bring .* from v${f.version.replaceAll(".", "\\.")} to studio harness v${current.replaceAll(".", "\\.")}`));
    assert.match(preview.stdout, /Large jump: \d+ releases in one sync/);
    assert.doesNotMatch(preview.stdout, /is healthy|chore\(harness\)/, "a preview runs no health check and prints no commit line");
    assert.deepEqual(snapshot(app), start, "check and the preview leave every file as it was");
    assert.equal(git(app, "config", "--get", "core.hooksPath").stdout.trim(), "", "and turn no hook on");

    // The update itself.
    const sync = master(app, "sync");
    assert.equal(sync.status, 0, sync.stdout + sync.stderr);
    assert.match(sync.stdout, new RegExp(`Studio harness v${current.replaceAll(".", "\\.")} pulled into`));
    assert.match(sync.stdout, new RegExp(`Studio harness v${current.replaceAll(".", "\\.")} is healthy`));
    assert.match(sync.stdout, new RegExp(`commit "chore\\(harness\\): sync studio v${current.replaceAll(".", "\\.")}"`));
    // Everything the preview said, the sync did: the same lists, file for file.
    const lists = (out) => out.split("\n").filter((l) => /^  (updated|deleted|CLAUDE\.md|pack starters)/.test(l));
    assert.deepEqual(lists(sync.stdout), lists(preview.stdout));

    // Lock updated, every managed file is the master copy's.
    const lock = lockOf(app);
    assert.equal(lock.studio, current);
    const r = compare(app, studio);
    assert.equal(drift(r), false, JSON.stringify({ behind: r.behind, added: r.added, removed: r.removed, edited: r.edited, missing: r.missing }));
    assert.deepEqual(r.starters, [], "no starter file is left waiting");
    assert.deepEqual(r.newStarters, []);
    assert.deepEqual(Object.keys(lock.packs ?? {}), Object.keys(oldLock.packs ?? {}), "the app's packs are the ones it had");

    // No file lost: only harness files that app-studio itself dropped are gone.
    const end = snapshot(app);
    const lost = Object.keys(start).filter((p) => !(p in end));
    assert.deepEqual(lost.filter((p) => !(p in oldLock.files) || p in lock.files), [], "nothing of the app's own is gone");

    // The app's own files are untouched; the only others that changed are the starters the pull named.
    const named = (label) => (new RegExp(`^  ${label}: (.*)$`, "m").exec(sync.stdout)?.[1] ?? "").split(", ").filter(Boolean);
    const touched = [...named("pack starters refreshed"), ...named("pack starters added \\(new in their pack\\)")].sort();
    assert.deepEqual(changedOutsideHarness(start, end), ["CLAUDE.md", ...touched].sort());
    assert.equal(end[".claude/settings.json"], start[".claude/settings.json"], "the app's settings file is its own");
    assert.equal(end["package-lock.json"], start["package-lock.json"], "a pack's own lockfile never replaces the app's");

    // CLAUDE.md: harness-owned sections are the template's, everything else the app wrote is still there.
    const claude = read(app, "CLAUDE.md");
    for (const name of SECTIONS) assert.equal(owned(claude, name), owned(template(), name), `section ${name}`);
    for (const line of [OWN_RULE, OWN_PRODUCT, "| App | Old App |", "| Access model | only invited people |", `| Stack | ${STACK_OF[f.name]} |`]) assert.ok(claude.includes(line), line);
    const startLines = startClaude.split("\n");
    const inOwned = (i) => SECTIONS.some((n) => { const b = startLines.findIndex((l) => l.startsWith(`<!-- studio:begin ${n} `)); const e = startLines.findIndex((l) => l.trim() === `<!-- studio:end ${n} -->`); return b >= 0 && i >= b && i <= e; });
    // 0.18.1 has no markers yet: its Roles bullets and its merge rule (up to "The checks") are the old template's word for word,
    // which the pull replaces, and its heading "Writing for Ale" is renamed.
    const [mergeFrom, mergeTo] = [startLines.findIndex((l) => l.startsWith("- **Merging a PR**")), startLines.findIndex((l) => l.startsWith("- **The checks.**"))];
    const oldTemplate = (l, i) => f.version === "0.18.1" && ((i >= mergeFrom && i < mergeTo) || /^- (\*\*(Ale|Claude) \(|Ask Ale only)|^## Writing for Ale$/.test(l));
    const mine = startLines.filter((l, i) => !inOwned(i) && !oldTemplate(l, i));
    const kept = new Set(claude.split("\n"));
    assert.deepEqual(mine.filter((l) => !kept.has(l)), [], "every other line of the app's CLAUDE.md is still there");

    // Hooks wired: the git pre-commit check is on and really runs, with the app's own (new) copy of the script.
    assert.equal(git(app, "config", "--get", "core.hooksPath").stdout.trim(), ".claude/hooks");
    assert.ok(statSync(join(app, ".claude/hooks/pre-commit")).mode & 0o100, "pre-commit is executable");
    assert.equal(own(app, "health").status, 0);
    const done = commit(app, `chore(harness): sync studio v${current}`);
    assert.equal(done.status, 0, done.stdout + done.stderr);
    writeFileSync(join(app, ".claude/skills/release/SKILL.md"), "edited here\n");
    const refused = commit(app, "an edit to a shared file");
    assert.notEqual(refused.status, 0, "the hook refuses a commit that breaks the harness");
    assert.match(refused.stdout + refused.stderr, /health check failed[\s\S]*shared harness files edited here/);
    git(app, "reset", "-q");
    git(app, "checkout", "HEAD", "--", ".claude/skills/release/SKILL.md");

    // A second sync finds nothing to do.
    const again = master(app, "sync");
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /already in step, nothing to commit/);
    assert.deepEqual(snapshot(app), end);
    assert.equal(own(app, "check").status, 0);
  });

// ---------- the known special cases ----------

const CUSTOM_ROLES = [
  "- **Ale** owns the product: he orders the backlog, tests every release on his phone and never touches git.",
  "- **Claude** writes all the code and ships it.",
  "- **Marta** (club coach) reviews every opening explanation before it ships.",
];

/**
 * The first real app, as issue #361 describes it: on 0.18.1, older than the packs' starter files (its lock names packs but tracks
 * no starter file; CI, configs, server and platform code are its own), without the harness-idea and migrate-app skills, roles
 * named by person in its own words, and its own code calling sample() and user() without the ai and user modules.
 */
function predatesPacks() {
  const { app } = oldApp("web-0.18.1");
  const lock = lockOf(app);
  for (const p of Object.keys(lock.starters)) rmSync(join(app, p));
  delete lock.starters;
  for (const skill of ["harness-idea", "migrate-app"]) {
    rmSync(join(app, ".claude/skills", skill), { recursive: true });
    for (const p of Object.keys(lock.files)) if (p.startsWith(`.claude/skills/${skill}/`)) delete lock.files[p];
  }
  writeFileSync(join(app, ".claude/studio/lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  const lines = read(app, "CLAUDE.md").split("\n");
  const at = lines.findIndex((l) => l.startsWith("- **Ale (PM and tester).**"));
  lines.splice(at, 3, ...CUSTOM_ROLES);
  writeFileSync(join(app, "CLAUDE.md"), lines.join("\n"));
  writeOwn(app, {
    "package.json": '{ "name": "old-app", "version": "0.21.1", "private": true, "scripts": { "check": "node build.js" } }\n',
    "package-lock.json": '{ "name": "old-app", "lockfileVersion": 3 }\n',
    ".github/workflows/ci.yml": "name: CI\non: [pull_request]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run check\n",
    ".github/workflows/harness.yml": "name: Harness\non: [pull_request]\njobs:\n  health:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node .claude/studio/studio-sync.mjs health\n",
    "src/main.ts": "import { coach } from './coach';\ncoach();\n",
    "src/coach.ts": "export async function coach() {\n  const me = await getPlatform().user();\n  return getPlatform().sample({ prompt: `Coach ${me}` });\n}\n",
    "src/platform/index.ts": "export const getPlatform = () => ({ sample: async () => '', user: async () => 'me' });\n",
    "server/index.js": "// the app's own server\n",
  });
  commit(app, "the app before its update");
  return app;
}

test("an app that predates the packs' starter files keeps its own files: a sync adds none, and still none after it adds a module", () => {
  const app = predatesPacks();
  const start = snapshot(app);
  const check = master(app, "check");
  assert.match(check.stdout, /new in app-studio: .*\.claude\/skills\/harness-idea\/SKILL\.md/s, "the skills it never had are named as new");
  assert.doesNotMatch(check.stdout, /pull adds them|held back/, "no starter file is offered to an app that tracks none");

  const sync = master(app, "sync");
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stdout, /pack starters not added: \d+ \(this app never took the starter files of base, web, so it keeps its own/);
  assert.doesNotMatch(sync.stdout, /pack starters (added|refreshed|held back)/);
  const end = snapshot(app);
  assert.deepEqual(changedOutsideHarness(start, end), ["CLAUDE.md"], "no file outside the harness folder was added, changed or removed");
  for (const skill of ["harness-idea", "migrate-app"]) assert.ok(existsSync(join(app, ".claude/skills", skill, "SKILL.md")), `${skill} arrives`);
  assert.equal(lockOf(app).studio, current);
  assert.equal(lockOf(app).starters, undefined);
  assert.deepEqual(lockOf(app).ownStarters, ["base", "web"], "the lock records which packs' starters the app never took");
  assert.equal(drift(compare(app, studio)), false);
  assert.equal(own(app, "health").status, 0, own(app, "health").stdout);

  // Roles in the app's own words are left alone and named for a hand merge, apart from the wording the pull did add.
  const claude = read(app, "CLAUDE.md");
  for (const l of CUSTOM_ROLES) assert.ok(claude.includes(l), l);
  assert.equal(owned(claude, "roles"), null);
  assert.match(sync.stdout, /CLAUDE\.md sections left as they are \(merge by hand\): CLAUDE\.md: section 'roles' has custom wording/);
  assert.match(sync.stdout, /CLAUDE\.md wording added \(app text untouched; commit it with the sync\): .*section 'merge-rule' marked and updated/);
  assert.doesNotMatch(/CLAUDE\.md wording added[^\n]*/.exec(sync.stdout)[0], /by hand/);
  assert.equal(owned(claude, "merge-rule"), owned(template(), "merge-rule"));

  // Moving onto the modules later brings those modules' files only; the stacks' starter files still stay out.
  assert.equal(commit(app, "sync").status, 0);
  const before = snapshot(app);
  const add = master(app, "pack", "add", "ai", "ai-web", "user");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.equal(master(app, "pull").status, 0);
  const lock = lockOf(app);
  const moduleFiles = Object.keys(lock.starters).filter((p) => ["ai", "ai-web", "user"].includes(lock.starters[p].pack));
  assert.deepEqual(Object.keys(lock.starters), moduleFiles, "only the modules' starters are tracked");
  assert.deepEqual(lock.ownStarters, ["base", "web"], "a module added later is not on the list");
  const after = snapshot(app);
  const fresh = Object.keys(after).filter((p) => !(p in before) && !p.startsWith(".claude/"));
  assert.deepEqual(fresh.filter((p) => !moduleFiles.includes(p)), [], "no base or web starter file came in");
  for (const p of ["src/main.ts", "src/coach.ts", "src/platform/index.ts", "server/index.js", ".github/workflows/ci.yml"]) assert.equal(after[p], start[p], `${p} is still the app's own`);
});

test("an app in discovery with its own extra skills keeps them through the sync, and a module that ships the same name is refused whole", () => {
  const { app } = oldApp("plain-0.28.1", { profile: DISCOVERY });
  const ownSkill = (name, about) => `---\nname: ${name}\ndescription: ${about}\n---\n\n# ${name}\n\nThe app's own way of doing this.\n`;
  writeOwn(app, {
    ".claude/skills/research/SKILL.md": ownSkill("research", "Run a study the way this app does"),
    ".claude/skills/research/framework.md": "# Our framework\n",
    ".claude/skills/persona-fill/SKILL.md": ownSkill("persona-fill", "Fill the personas"),
    ".claude/agents/doc-reviewer.md": "---\nname: doc-reviewer\ndescription: Reviews an inception document\n---\n\nReview it.\n",
    "docs/inception/personas.md": "# Personas\n",
  });
  commit(app, "the app before its update");
  const start = snapshot(app);
  const mine = Object.keys(start).filter((p) => /^\.claude\/(skills\/(research|persona-fill)\/|agents\/doc-reviewer\.md)|^docs\//.test(p));
  assert.equal(mine.length, 5);

  const sync = master(app, "sync");
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  let now = snapshot(app);
  for (const p of mine) assert.equal(now[p], start[p], `${p} untouched`);
  assert.equal(own(app, "phase").stdout.trim(), "discovery");
  assert.equal(own(app, "health").status, 0, own(app, "health").stdout);
  assert.equal(commit(app, "sync").status, 0);

  // The research module ships a skill named "research": nothing is added while the app's own has that name.
  const clash = master(app, "pack", "add", "research", "discovery");
  assert.equal(clash.status, 1);
  assert.match(clash.stderr, /Name clash, nothing was added[\s\S]*\.claude\/skills\/research: the app's own skill "research"/);
  assert.deepEqual(snapshot(app), now, "a refused pack add changes nothing");
  // With its own copy out of the way the modules come in, and the app's other skills stay.
  rmSync(join(app, ".claude/skills/research"), { recursive: true });
  const added = master(app, "pack", "add", "research", "discovery");
  assert.equal(added.status, 0, added.stdout + added.stderr);
  now = snapshot(app);
  assert.equal(now[".claude/skills/research/SKILL.md"], hashText(readFileSync(join(studio, "packs/research/skills/research/SKILL.md"), "utf8")));
  for (const p of mine.filter((x) => !x.startsWith(".claude/skills/research/"))) assert.equal(now[p], start[p], `${p} untouched`);
});

test("starter files are held back across the gap while the app calls a module it lacks, an edited one is never overwritten, and the hold lifts with the module", () => {
  const { app } = oldApp("web-0.18.1");
  // The app's own feature calls an AI it has no module for; it also added a line of its own to a starter file that app-studio changed since.
  const EDITED = ".prettierignore";
  writeOwn(app, { "src/features/coach.ts": "export const ask = async () => (await getPlatform().sample())?.('hint');\n", [EDITED]: `${read(app, EDITED)}recordings/\n` });
  commit(app, "the app before its update");
  const start = snapshot(app);
  const oldLock = lockOf(app);

  const check = master(app, "check");
  assert.match(check.stdout, /Pack starter files are held back: the app calls sample\(\) \(ai module\) but doesn't have the module: run pack add ai first\./);
  const sync = master(app, "sync");
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stdout, /pack starters held back \(the app calls sample\(\) \(ai module\)/);
  assert.doesNotMatch(sync.stdout, /pack starters (refreshed|added)/);
  assert.deepEqual(changedOutsideHarness(start, snapshot(app)), ["CLAUDE.md"], "the harness moved; no file of the app's build did");
  assert.deepEqual(lockOf(app).starters, oldLock.starters, "the lock still records the starters as the app has them");
  assert.equal(lockOf(app).studio, current);
  assert.equal(own(app, "health").status, 0, own(app, "health").stdout);
  assert.match(own(app, "check").stdout, /held back/, "every later session is told");

  // With the module the held files come in; the file the app edited is named for a hand merge and left byte for byte.
  const add = master(app, "pack", "add", "ai", "ai-web");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  const pull = master(app, "pull");
  assert.equal(pull.status, 0, pull.stdout + pull.stderr);
  const all = add.stdout + pull.stdout;
  assert.match(all, /starter files of the packs it already had refreshed: /);
  assert.match(all, /changed upstream but edited here \(merge by hand, then ack\): \.prettierignore/);
  assert.equal(snapshot(app)[EDITED], start[EDITED]);
  const r = compare(app, studio);
  assert.equal(r.held, undefined);
  assert.deepEqual(r.newStarters, []);
  assert.deepEqual(r.starters.filter((n) => n.refreshable), [], "nothing unedited is left behind");
  assert.deepEqual(r.starters.map((n) => n.path), [EDITED], "the edited file keeps its note until it is acked");
  assert.equal(master(app, "ack").status, 0);
  assert.deepEqual(compare(app, studio).starters, []);
});

// ---------- the report of a large jump ----------

test("the report of a large jump lists what apps received, counts the rest, and keeps only steps that still ask for something", () => {
  const { app } = oldApp("web-0.18.1");
  const out = master(app, "changelog").stdout;
  assert.match(out, new RegExp(`^Releases 0\\.18\\.1 -> ${current.replaceAll(".", "\\.")}:`));
  assert.match(out, /and \d+ internal releases \(app-studio's own tooling: nothing in them reaches an app\)/);
  assert.match(out, /and \d+ older releases, 0\.18\.2 to 0\.36\.2 /);
  assert.doesNotMatch(out, /^  0\.(1\d|2\d|3[0-6])\.\d+  /m, "releases from before the records are counted, not listed");
  assert.match(out, /Large jump: \d+ releases in one sync\. Before you commit, read part 9 of the harness-sync skill's sync-notes\.md/);
  // Steps: the sentence that asks, not the paragraph around it; an entry that says "none" asks for nothing.
  const needs = out.slice(out.indexOf("Needs you:"));
  assert.doesNotMatch(needs, /Origin:|^\s+\d+\. none\.?$/im);
  assert.match(needs, /0\.31\.2:\n\s+1\. \(existing static-site apps only\): the workflow/);
  assert.match(needs, /0\.30\.1:\n\s+1\. paste the new `scripts\/env-setup\.sh` into the "app-studio apps" environment's setup script \(Settings, Environments\)\.\n/);
  assert.doesNotMatch(needs, /0\.2[45]\.\d+:\n\s+1\. (?!the Project instructions)/, "entries that only mention an action are gone");
  assert.ok(out.length < 12000, `the report of the largest jump stays short (${out.length} characters)`);
});

test("a small jump keeps the plain report: one line per release, no large-jump note", () => {
  const out = syncReport(studio, "0.45.0");
  assert.match(out, /^  0\.45\.1  /m, "an internal release is listed in a short report");
  assert.doesNotMatch(out, /Large jump|internal releases/);
});

test("actionStep keeps the sentence that asks for a step and drops what asks for nothing", () => {
  assert.equal(actionStep("none", "admin"), null);
  assert.equal(actionStep("None.", "app"), null);
  assert.equal(actionStep("Add the row to the App profile", "app"), "Add the row to the App profile");
  const para = "Origin: issue #1. Long story. **Admin action:** paste the script (Settings). **App action:** none (it arrives with the sync). Not verified yet: a live check.";
  assert.equal(actionStep(para, "admin", true), "paste the script (Settings).");
  assert.equal(actionStep(para, "app", true), null);
  assert.equal(actionStep("Origin: x. The step **Admin action** is renamed. No **App action**, no **Admin action**.", "admin", true), null, "a mention is not a step");
  assert.equal(actionStep("App action** (only for an app that uses AI): run pack add ai.", "app", true), "(only for an app that uses AI): run pack add ai.");
  assert.equal(actionStep("A whole old entry with no marker at all.", "app", true), "A whole old entry with no marker at all.", "an unknown shape is kept whole");
});

test("a dry run is refused by every command that has no preview, before it does anything", () => {
  const { app } = oldApp("plain-0.28.1");
  const start = snapshot(app);
  for (const cmd of [["install"], ["check"], ["health"], ["pack", "add", "web"], ["ack"], ["release-prepare", "--apply"], ["release-cut", "--version", "9.9.9"], ["hooks"]]) {
    const r = master(app, ...cmd, "--dry-run");
    assert.equal(r.status, 2, cmd.join(" "));
    assert.match(r.stderr, /--dry-run works with pull and sync only\. Nothing was run or changed\./);
    assert.equal(r.stdout, "", cmd.join(" "));
  }
  assert.deepEqual(snapshot(app), start);
  assert.equal(git(app, "config", "--get", "core.hooksPath").stdout.trim(), "");
});

test("the saved fixtures are what the test expects: one per version the real apps ran, each with its lock", () => {
  assert.deepEqual(FIXTURES.map((f) => f.version), ["0.18.1", "0.28.1", "0.31.0"]);
  for (const f of FIXTURES) {
    const { app, fixture } = oldApp(f.name);
    assert.deepEqual(fixture, f);
    assert.equal(readLock(app).studio, f.version);
    assert.deepEqual(Object.keys(readLock(app).packs ?? {}).filter((p) => p !== "base"), f.packs.filter((p) => p !== "base"));
  }
});
