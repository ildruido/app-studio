// Run: node --test scripts/new-app-gates.test.mjs
// The push and merge gates on the three commits of a new app that hold no hand-written code (issue #441, fixes 2 and 3):
// the bootstrap (`install --discovery`), "start building" (`pack add` of a stack, then `npm install`) and a release that only
// moves the version. Each asks for no review or QA; the same commit with one thing written or edited by hand still does.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { lockfileMatches } from "../plugins/studio/hooks/review-precheck.mjs";
import { versionOnly } from "../plugins/studio/hooks/verdict.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "new-app-gates-"));
// The app-studio the app installs from: this checkout without its unreleased entries, read as it is right after a release.
const studio = join(tmp, "app-studio");
const env = { ...process.env, HOME: join(tmp, "home"), STUDIO_USER_SETTINGS: join(tmp, "home/.claude/settings.json") };
delete env.CLAUDE_CODE_REMOTE;
delete env.CI;
delete env.STUDIO_DIR;

before(() => {
  for (const d of ["plugins", "packs", "releases"]) cpSync(join(repo, d), join(studio, d), { recursive: true, filter: (src) => !src.endsWith("unreleased") });
  cpSync(join(repo, "scripts"), join(studio, "scripts"), { recursive: true, filter: (src) => !src.endsWith("fixtures") });
  mkdirSync(join(studio, "docs"), { recursive: true });
  cpSync(join(repo, "docs/CHANGELOG-legacy.md"), join(studio, "docs/CHANGELOG-legacy.md"));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const git = (app, ...args) => spawnSync("git", ["-C", app, ...args], { encoding: "utf8", env });
const master = (app, ...args) => spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app, "--studio", studio], { encoding: "utf8", env });
const gate = (app, script, ...args) => spawnSync(process.execPath, [join(app, ".claude/hooks", script), ...args], { cwd: app, encoding: "utf8", env });
const push = (app) => gate(app, "verdict.mjs", "check", "--push");
const riskOf = (app) => JSON.parse(gate(app, "review-precheck.mjs", "risk", "--json").stdout);
const read = (app, path) => readFileSync(join(app, path), "utf8");
const json = (app, path) => JSON.parse(read(app, path));
const lockOf = (app) => json(app, ".claude/studio/lock.json");
const put = (app, path, text) => {
  mkdirSync(dirname(join(app, path)), { recursive: true });
  writeFileSync(join(app, path), typeof text === "string" ? text : `${JSON.stringify(text, null, 2)}\n`);
};
const commit = (app, message) => {
  git(app, "add", "-A");
  const r = spawnSync("git", ["-C", app, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--no-verify", "-m", message], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
/** Squash-merges the branch the way an app's PR lands, and opens the next branch from the new main. */
const land = (app, next) => {
  const branch = git(app, "rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
  assert.equal(git(app, "switch", "-q", "main").status, 0);
  assert.equal(git(app, "merge", "-q", "--ff-only", branch).status, 0);
  assert.equal(git(app, "switch", "-q", "-c", next).status, 0);
};
const changed = (app) => git(app, "diff", "--name-only", "main...HEAD").stdout.split("\n").filter(Boolean);
const NEEDS = /no review result for/;
const sha = (text) => createHash("sha256").update(text).digest("hex");

/** A repo that holds only a README on main, on the branch the bootstrap is committed on. */
function emptyApp() {
  const app = join(mkdtempSync(join(tmp, "app-")), "tip-splitter");
  mkdirSync(app, { recursive: true });
  assert.equal(git(app, "init", "-q", "-b", "main").status, 0);
  put(app, "README.md", "# Tip Splitter\n");
  commit(app, "chore: start the repo");
  assert.equal(git(app, "switch", "-q", "-c", "chore/bootstrap").status, 0);
  return app;
}
/** The lockfile npm writes for a package.json: the root package repeats its dependencies, then one entry per resolved package. */
function lockfileFor(pkg, resolved = 150) {
  const packages = { "": { name: pkg.name, version: pkg.version, ...(pkg.dependencies && { dependencies: pkg.dependencies }), ...(pkg.devDependencies && { devDependencies: pkg.devDependencies }), ...(pkg.engines && { engines: pkg.engines }) } };
  for (let i = 0; i < resolved; i++) packages[`node_modules/dep-${i}`] = { version: `1.0.${i}`, resolved: `https://registry.npmjs.org/dep-${i}/-/dep-${i}-1.0.${i}.tgz`, integrity: `sha512-${"a".repeat(20)}${i}`, dev: true };
  return { name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages };
}
/** The bootstrap as new-app's discovery path runs it, committed. */
function bootstrapped() {
  const app = emptyApp();
  const install = master(app, "install", "--discovery");
  assert.equal(install.status, 0, install.stdout + install.stderr);
  const add = master(app, "pack", "add", "discovery");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  commit(app, "chore: bootstrap harness with discovery and research modules");
  return { app, install };
}
/** "Start building" on top of a merged bootstrap: the stack packs, then the lockfile `npm install` would write, committed. */
function building() {
  const { app } = bootstrapped();
  land(app, "chore/start-building");
  const add = master(app, "pack", "add", "artifact", "--slug", "tip-splitter", "--title", "Tip Splitter");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  put(app, "package-lock.json", lockfileFor(json(app, "package.json")));
  return app;
}

// ---------- fix 3: the bootstrap and "start building" ----------

test("the bootstrap commit asks for no review or QA: install --discovery writes the Harness workflow and .nvmrc and the lock records them", () => {
  const { app, install } = bootstrapped();
  assert.match(install.stdout, /bootstrap files added[^\n]*: \.github\/workflows\/harness\.yml, \.nvmrc/);
  for (const p of [".github/workflows/harness.yml", ".nvmrc"]) {
    assert.equal(read(app, p), read(studio, `packs/base/starter/${p}`), `${p} is the base pack's file`);
    assert.equal(lockOf(app).starters[p]?.pack, "base");
  }
  assert.ok(changed(app).includes(".nvmrc") && changed(app).includes(".github/workflows/harness.yml"));
  const r = push(app);
  assert.equal(r.status, 0, `the push gate asks for nothing: ${r.stderr}`);
  assert.equal(gate(app, "verdict.mjs", "check").status, 0, "nor does the merge gate's check");
  assert.equal(riskOf(app).reviewer, "reviewer");

  // The same file changed by hand no longer matches the lock: it is reviewed.
  put(app, ".nvmrc", "20\n");
  commit(app, "chore: another Node");
  assert.match(push(app).stderr, NEEDS);
});

test("a bootstrap file copied by hand, with no record in the lock, is still reviewed; one the app already had is left as it is", () => {
  const app = emptyApp();
  put(app, ".nvmrc", "20\n");
  const install = master(app, "install", "--discovery");
  assert.equal(install.status, 0, install.stdout + install.stderr);
  assert.equal(read(app, ".nvmrc"), "20\n", "the app's own file is not replaced");
  assert.equal(lockOf(app).starters?.[".nvmrc"], undefined, "and not recorded as the harness's");
  assert.ok(lockOf(app).starters[".github/workflows/harness.yml"]);
  commit(app, "chore: bootstrap");
  assert.match(push(app).stderr, NEEDS);

  // A plain install (no flag) writes neither file: a stack pack brings them.
  const plain = emptyApp();
  assert.equal(master(plain, "install").status, 0);
  assert.deepEqual(changed(plain).filter((p) => !/^\.claude\/|\.md$/.test(p)), []);
  put(plain, ".nvmrc", read(studio, "packs/base/starter/.nvmrc"));
  commit(plain, "chore: bootstrap");
  assert.match(push(plain).stderr, NEEDS, "the same text, copied by hand: nothing records where it came from");
});

test("a later pack add of the base pack accepts the bootstrap files as they are", () => {
  const { app } = bootstrapped();
  land(app, "chore/start-building");
  const add = master(app, "pack", "add", "artifact", "--slug", "tip-splitter", "--title", "Tip Splitter");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.doesNotMatch(add.stdout, /kept[^\n]*(harness\.yml|\.nvmrc)/);
  assert.equal(lockOf(app).starters[".nvmrc"].pack, "base");
  assert.ok(!changed(app).includes(".nvmrc"), "nothing rewrote it");
});

test("the start building commit asks for no review or QA: starter files, package.json as pack add left it and the lockfile npm wrote for it", () => {
  const app = building();
  commit(app, "chore: start building Tip Splitter as an artifact prototype");
  const lock = lockOf(app);
  const files = changed(app);
  const code = files.filter((p) => !/\.md$|^\.claude\/|^docs\//.test(p));
  assert.ok(code.includes("package.json") && code.includes("package-lock.json") && code.some((p) => p.startsWith("src/")));
  assert.equal(typeof lock.generated["package.json"], "string");
  assert.deepEqual(code.filter((p) => !(p in lock.starters) && !["package.json", "package-lock.json"].includes(p)), [], "nothing else is code");
  assert.ok(Number(/(\d+) insertion/.exec(git(app, "diff", "--shortstat", "main...HEAD").stdout)?.[1]) > 400, "far past the size that alone asks for the deep reviewer");
  const r = push(app);
  assert.equal(r.status, 0, `the push gate asks for nothing: ${r.stderr}`);
  const risk = riskOf(app);
  assert.equal(risk.reviewer, "reviewer", `the risk is rated on what is left (${risk.lines} lines)`);

  // A feature written on top is judged as always.
  put(app, "src/modules/split.ts", "export const share = (total: number, people: number) => total / people;\n");
  commit(app, "feat: split");
  assert.match(push(app).stderr, NEEDS);
});

test("start building with anything written by hand is reviewed: a starter file, package.json, or a lockfile that is not package.json's", () => {
  const starter = building();
  put(starter, "src/main.ts", `${read(starter, "src/main.ts")}\nconsole.log("mine");\n`);
  commit(starter, "chore: start building");
  assert.match(push(starter).stderr, NEEDS);

  const pkg = building();
  const edited = json(pkg, "package.json");
  edited.dependencies = { ...edited.dependencies, "left-pad": "^1.3.0" };
  put(pkg, "package.json", edited);
  put(pkg, "package-lock.json", lockfileFor(edited));
  commit(pkg, "chore: start building");
  const blocked = push(pkg);
  assert.match(blocked.stderr, NEEDS);
  assert.match(blocked.stderr, /reviewer-deep/, "and the unreviewed lockfile counts for the risk again");

  const lockfile = building();
  const other = json(lockfile, "package.json");
  put(lockfile, "package-lock.json", lockfileFor({ ...other, devDependencies: { ...other.devDependencies, "left-pad": "^1.3.0" } }));
  commit(lockfile, "chore: start building");
  assert.match(push(lockfile).stderr, NEEDS);
});

test("pack add records package.json only when it starts from the committed file: an edit made by hand before it is reviewed", () => {
  const { app } = bootstrapped();
  land(app, "chore/start-building");
  put(app, "package.json", { name: "tip-splitter", version: "0.0.0", private: true, type: "module", scripts: { postinstall: "node own.js" } });
  const add = master(app, "pack", "add", "artifact", "--slug", "tip-splitter", "--title", "Tip Splitter");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.equal(lockOf(app).generated?.["package.json"], undefined);
  commit(app, "chore: start building");
  assert.match(push(app).stderr, NEEDS);
});

test("the lock's generated record covers package.json and no other path", () => {
  const app = building();
  put(app, "src/own.ts", "export const own = 1;\n");
  const lock = lockOf(app);
  lock.generated["src/own.ts"] = sha("export const own = 1;\n");
  put(app, ".claude/studio/lock.json", lock);
  commit(app, "chore: start building");
  assert.match(push(app).stderr, NEEDS);
});

test("lockfileMatches compares name, version and the root package's dependencies", () => {
  const pkg = { name: "a", version: "1.0.0", dependencies: { x: "^1.0.0" }, devDependencies: { z: "^3.0.0", y: "^2.0.0" } };
  const text = (o) => JSON.stringify(o);
  assert.equal(lockfileMatches(text(pkg), text(lockfileFor(pkg, 2))), true);
  assert.equal(lockfileMatches(text({ ...pkg, devDependencies: { y: "^2.0.0", z: "^3.0.0" } }), text(lockfileFor(pkg, 2))), true, "key order aside");
  assert.equal(lockfileMatches(text({ ...pkg, version: "1.0.1" }), text(lockfileFor(pkg, 2))), false);
  assert.equal(lockfileMatches(text({ ...pkg, dependencies: {} }), text(lockfileFor(pkg, 2))), false);
  assert.equal(lockfileMatches(text(pkg), text({ name: "a", version: "1.0.0", lockfileVersion: 1, dependencies: {} })), false, "no root package to compare");
  assert.equal(lockfileMatches(text(pkg), "not json"), false);
  assert.equal(lockfileMatches(null, null), false);
});

// ---------- fix 2: a release that only moves the version ----------

/** An app on main with code, a package.json and its lockfile, on a release branch. */
function released() {
  const app = building();
  put(app, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n- Split a bill.\n");
  commit(app, "chore: start building");
  land(app, "release/v0.1.0");
  return app;
}
/** What `release-cut` and `npm install --package-lock-only` leave: the version in package.json, twice in the lockfile, and the changelog section. */
function bump(app, version, { pkg = (p) => p, lock = (l) => l } = {}) {
  const p = pkg({ ...json(app, "package.json"), version });
  put(app, "package.json", p);
  const l = json(app, "package-lock.json");
  l.version = version;
  l.packages[""].version = version;
  put(app, "package-lock.json", lock(l));
  put(app, "CHANGELOG.md", read(app, "CHANGELOG.md").replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - 2026-11-28`));
}

test("a release commit that only moves the version asks for no review or QA at the push gate and the merge gate", () => {
  const app = released();
  bump(app, "0.1.0");
  commit(app, "chore(release): v0.1.0");
  assert.deepEqual(changed(app).sort(), ["CHANGELOG.md", "package-lock.json", "package.json"]);
  const r = push(app);
  assert.equal(r.status, 0, `the push gate asks for nothing: ${r.stderr}`);

  // The merge gate (the PreToolUse hook on the merge call) reads the same answer.
  assert.equal(git(app, "remote", "add", "origin", "https://github.com/me/demo.git").status, 0);
  const transcript = join(app, ".git", "t.jsonl");
  writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "c1", name: "mcp__github__pull_request_read", input: { method: "get_check_runs", owner: "me", repo: "demo", pullNumber: 7 } }] } })}\n${JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "c1", content: JSON.stringify({ check_runs: [{ name: "CI gate", status: "completed", conclusion: "success" }] }) }] } })}\n`);
  const merge = (tool) => spawnSync(process.execPath, [join(app, ".claude/hooks/check.mjs"), "merge"], { cwd: app, encoding: "utf8", env, input: JSON.stringify({ tool_name: tool, transcript_path: transcript, tool_input: { owner: "me", repo: "demo", pullNumber: 7 } }) });
  const auto = merge("mcp__github__enable_pr_auto_merge");
  assert.equal(auto.status, 0, `auto-merge is not blocked for results: ${auto.stderr}`);
  assert.doesNotMatch(merge("mcp__github__merge_pull_request").stderr, /review and QA results/);

  // Code beside the bump: everything is judged as before.
  put(app, "src/modules/split.ts", "export const share = (total: number, people: number) => total / people;\n");
  commit(app, "feat: split");
  assert.match(push(app).stderr, NEEDS);
  assert.match(merge("mcp__github__enable_pr_auto_merge").stderr, /review and QA results/);
});

test("a release commit with anything else in package.json or the lockfile is judged as before", () => {
  const cases = {
    "a dependency beside the version": { pkg: (p) => ({ ...p, dependencies: { ...p.dependencies, "left-pad": "^1.3.0" } }) },
    "a script beside the version": { pkg: (p) => ({ ...p, scripts: { ...p.scripts, postinstall: "node x.js" } }) },
    "a resolved package changed in the lockfile": { lock: (l) => ({ ...l, packages: { ...l.packages, "node_modules/dep-3": { ...l.packages["node_modules/dep-3"], resolved: "https://example.com/dep-3.tgz" } } }) },
    "a package added to the lockfile": { lock: (l) => ({ ...l, packages: { ...l.packages, "node_modules/extra": { version: "9.9.9" } } }) },
    "a lockfile left on another version": { lock: (l) => ({ ...l, version: "0.0.9" }) },
  };
  for (const [name, change] of Object.entries(cases)) {
    const app = released();
    bump(app, "0.1.0", change);
    commit(app, "chore(release): v0.1.0");
    assert.match(push(app).stderr, NEEDS, name);
  }
});

test("versionOnly names the files of a pure version bump, read against where the branch left main", () => {
  const app = released();
  bump(app, "0.1.0");
  commit(app, "chore(release): v0.1.0");
  assert.deepEqual([...versionOnly(app, "main", ["package-lock.json", "package.json"])].sort(), ["package-lock.json", "package.json"]);
  assert.deepEqual([...versionOnly(app, "main", ["package-lock.json"])], [], "a lockfile alone is not a bump");

  // main moves on with a new dependency after the release branch left it: the branch's own diff is still only the version.
  assert.equal(git(app, "switch", "-q", "main").status, 0);
  const p = json(app, "package.json");
  put(app, "package.json", { ...p, dependencies: { ...p.dependencies, "left-pad": "^1.3.0" } });
  commit(app, "feat: a dependency");
  assert.equal(git(app, "switch", "-q", "release/v0.1.0").status, 0);
  assert.equal(push(app).status, 0);

  // A package.json that is new in the diff has no version to move from: not a bump.
  const fresh = building();
  commit(fresh, "chore: start building");
  assert.deepEqual([...versionOnly(fresh, "main", ["package.json"])], []);
});
