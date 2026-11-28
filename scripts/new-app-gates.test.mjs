// Run: node --test scripts/new-app-gates.test.mjs
// The push and merge gates on the three commits of a new app that hold no hand-written code (issue #441, fixes 2 and 3):
// the bootstrap (`install --discovery`), "start building" (`pack add` of a stack) and a release that only moves the version. Each
// asks for no review or QA; the same commit with one thing written or edited by hand still does. A lockfile is never exempt: code
// reads its entries, a clean new one gets the standard review, and one with an entry from elsewhere or without a hash the deep one.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { lockfileProblems } from "../plugins/studio/hooks/review-precheck.mjs";
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
/** "Start building" on top of a merged bootstrap: the stack packs, not yet committed and without the lockfile `npm install` writes. */
function building() {
  const { app } = bootstrapped();
  land(app, "chore/start-building");
  const add = master(app, "pack", "add", "artifact", "--slug", "tip-splitter", "--title", "Tip Splitter");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  return app;
}
/** The lockfile `npm install` writes for the app's package.json as it stands. */
const npmInstall = (app, change = (l) => l) => put(app, "package-lock.json", change(lockfileFor(json(app, "package.json"))));

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

test("the start building commit asks for no review or QA: starter files and package.json as pack add left it", () => {
  const app = building();
  commit(app, "chore: start building Tip Splitter as an artifact prototype");
  const lock = lockOf(app);
  const code = changed(app).filter((p) => !/\.md$|^\.claude\/|^docs\//.test(p));
  assert.ok(code.includes("package.json") && code.some((p) => p.startsWith("src/")));
  assert.deepEqual(Object.keys(lock.generated), ["package.json"]);
  assert.deepEqual(code.filter((p) => !(p in lock.starters) && p !== "package.json"), [], "nothing else is code");
  assert.ok(Number(/(\d+) insertion/.exec(git(app, "diff", "--shortstat", "main...HEAD").stdout)?.[1]) > 400, "far past the size that alone asks for the deep reviewer");
  const r = push(app);
  assert.equal(r.status, 0, `the push gate asks for nothing: ${r.stderr}`);

  // A feature written on top is judged as always.
  put(app, "src/modules/split.ts", "export const share = (total: number, people: number) => total / people;\n");
  commit(app, "feat: split");
  assert.match(push(app).stderr, NEEDS);
});

test("a new lockfile is never exempt: a clean one gets the standard review, whatever its size", () => {
  const app = building();
  npmInstall(app);
  commit(app, "chore: start building Tip Splitter as an artifact prototype");
  assert.ok(Number(git(app, "diff", "--numstat", "main...HEAD", "--", "package-lock.json").stdout.split("\t")[0]) > 400, "the lockfile alone is past the deep reviewer's size");
  const r = push(app);
  assert.match(r.stderr, NEEDS);
  assert.match(r.stderr, /run the `reviewer` agent/);
  assert.doesNotMatch(r.stderr, /reviewer-deep|npm registry/);
  const risk = riskOf(app);
  assert.equal(risk.reviewer, "reviewer", `the size is counted without the lockfile (${risk.lines} lines)`);
  assert.deepEqual(risk.lockfile, []);
  assert.deepEqual(JSON.parse(gate(app, "review-precheck.mjs", "--json").stdout).findings.filter((x) => x.id === "lockfile-source"), []);
});

test("a lockfile with an entry from another source, or without an integrity hash, is named and needs the deep review", () => {
  const cases = {
    "another registry": [(e) => ({ ...e, resolved: "https://registry.example.com/dep-3/-/dep-3-1.0.3.tgz" }), /node_modules\/dep-3: comes from https:\/\/registry\.example\.com\/dep-3\/-\/dep-3-1\.0\.3\.tgz, not the npm registry/],
    "a git source": [(e) => ({ ...e, resolved: "git+ssh://git@github.com/someone/dep-3.git#abc123" }), /node_modules\/dep-3: comes from git\+ssh:/],
    "a look-alike host": [(e) => ({ ...e, resolved: "https://registry.npmjs.org.example.com/dep-3.tgz" }), /node_modules\/dep-3: comes from/],
    "no integrity hash": [({ integrity, ...e }) => e, /node_modules\/dep-3: no integrity hash/],
    "no source at all": [({ resolved, ...e }) => e, /node_modules\/dep-3: names no source/],
    "a link to a local folder": [() => ({ resolved: "vendor/dep-3", link: true }), /node_modules\/dep-3: a link to a local folder, not the npm registry; no integrity hash/],
  };
  for (const [name, [change, said]] of Object.entries(cases)) {
    const app = building();
    npmInstall(app, (l) => ({ ...l, packages: { ...l.packages, "node_modules/dep-3": change(l.packages["node_modules/dep-3"]) } }));
    commit(app, "chore: start building");
    const risk = riskOf(app);
    assert.equal(risk.reviewer, "reviewer-deep", name);
    assert.equal(risk.lockfile.length, 1, name);
    assert.match(risk.lockfile[0], said, name);
    assert.match(gate(app, "review-precheck.mjs", "risk").stdout, said, `${name}: the risk report names it`);
    const r = push(app);
    assert.match(r.stderr, /run the `reviewer-deep` agent/, name);
    assert.match(r.stderr, said, `${name}: the gate names it`);
    assert.ok(JSON.parse(gate(app, "review-precheck.mjs", "--json").stdout).findings.some((x) => x.id === "lockfile-source" && said.test(x.message)), `${name}: the reviewer gets it as a lead`);
    // A plain reviewer's approval does not clear it.
    const wrote = spawnSync(process.execPath, [join(app, ".claude/hooks/verdict.mjs"), "write", "review"], { cwd: app, encoding: "utf8", env, input: JSON.stringify({ reviewer: "reviewer", verdict: "approve", findings: [] }) });
    assert.equal(wrote.status, 0, wrote.stderr);
    assert.match(push(app).stderr, /run the `reviewer-deep` agent, not `reviewer`/, name);
  }
});

test("a changed lockfile is read the same way: clean it is judged as before, one bad entry asks for the deep review", () => {
  const app = building();
  npmInstall(app);
  commit(app, "chore: start building");
  land(app, "feat/dep");
  const p = json(app, "package.json");
  put(app, "package.json", { ...p, dependencies: { ...p.dependencies, "dep-200": "^1.0.0" } });
  const add = (entry) => npmInstall(app, (l) => ({ ...l, packages: { ...l.packages, "node_modules/dep-200": entry } }));
  add({ version: "1.0.0", resolved: "https://registry.npmjs.org/dep-200/-/dep-200-1.0.0.tgz", integrity: "sha512-abc" });
  commit(app, "feat: a dependency");
  assert.equal(riskOf(app).reviewer, "reviewer");
  assert.match(push(app).stderr, NEEDS);
  add({ version: "1.0.0", resolved: "https://example.com/dep-200-1.0.0.tgz", integrity: "sha512-abc" });
  commit(app, "feat: the dependency from elsewhere");
  assert.equal(riskOf(app).reviewer, "reviewer-deep");
  assert.match(push(app).stderr, /node_modules\/dep-200: comes from https:\/\/example\.com/);

  // A large change to a lockfile that was already there still counts for the size, as before.
  const big = building();
  npmInstall(big);
  commit(big, "chore: start building");
  land(big, "chore/deps");
  put(big, "package-lock.json", lockfileFor(json(big, "package.json"), 400));
  commit(big, "chore: many more packages");
  assert.deepEqual(riskOf(big).lockfile, []);
  assert.equal(riskOf(big).reviewer, "reviewer-deep");
});

test("start building with a starter file or package.json changed by hand is reviewed", () => {
  const starter = building();
  put(starter, "src/main.ts", `${read(starter, "src/main.ts")}\nconsole.log("mine");\n`);
  commit(starter, "chore: start building");
  assert.match(push(starter).stderr, NEEDS);

  const pkg = building();
  const edited = json(pkg, "package.json");
  put(pkg, "package.json", { ...edited, dependencies: { ...edited.dependencies, "left-pad": "^1.3.0" } });
  commit(pkg, "chore: start building");
  assert.match(push(pkg).stderr, NEEDS);
});

test("package.json edited by hand before pack add is reviewed, committed or not; two pack adds in a row are still code alone", () => {
  const own = { name: "tip-splitter", version: "0.0.0", private: true, type: "module", scripts: { postinstall: "node own.js" } };
  const add = (app, ...packs) => { const r = master(app, "pack", "add", ...packs, "--slug", "tip-splitter", "--title", "Tip Splitter"); assert.equal(r.status, 0, r.stdout + r.stderr); };

  const uncommitted = bootstrapped().app;
  land(uncommitted, "chore/start-building");
  put(uncommitted, "package.json", own);
  add(uncommitted, "artifact");
  commit(uncommitted, "chore: start building");
  assert.match(push(uncommitted).stderr, NEEDS);

  const committed = bootstrapped().app;
  land(committed, "chore/start-building");
  put(committed, "package.json", own);
  commit(committed, "chore: my own package.json");
  add(committed, "artifact");
  commit(committed, "chore: start building");
  assert.match(push(committed).stderr, NEEDS, "committed on the branch is not reviewed");

  const twice = bootstrapped().app;
  land(twice, "chore/start-building");
  add(twice, "artifact");
  add(twice, "web");
  assert.ok(lockOf(twice).generated["package.json"].from.includes(""), "the record still starts from no file");
  commit(twice, "chore: start building");
  const r = push(twice);
  assert.equal(r.status, 0, `the push gate asks for nothing: ${r.stderr}`);
});

test("a later pack add on an app with a stack: package.json is code alone, and an old record covers no hand edit", () => {
  const app = building();
  npmInstall(app);
  commit(app, "chore: start building");
  land(app, "chore/add-web");
  const add = master(app, "pack", "add", "web");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.ok(add.stdout.includes("package.json entries added"), add.stdout);
  commit(app, "chore(harness): add the web pack");
  assert.equal(push(app).status, 0, "package.json alone, from main's text: nothing to review");

  // Back to the text an old record names, on a branch that also moves the lock: the base is not what that record started from.
  const back = building();
  commit(back, "chore: start building");
  const generated = read(back, "package.json");
  land(back, "feat/dep");
  const p = json(back, "package.json");
  put(back, "package.json", { ...p, dependencies: { ...p.dependencies, "left-pad": "^1.3.0" } });
  commit(back, "feat: a dependency");
  land(back, "chore/revert");
  put(back, "package.json", generated);
  const lock = lockOf(back);
  put(back, ".claude/studio/lock.json", { ...lock, since: "2026-01-01" });
  commit(back, "chore: drop the dependency");
  assert.match(push(back).stderr, NEEDS);
});

test("the lock's generated record covers package.json and no other path", () => {
  const app = building();
  put(app, "src/own.ts", "export const own = 1;\n");
  const lock = lockOf(app);
  lock.generated["src/own.ts"] = { from: [""], to: sha("export const own = 1;\n") };
  put(app, ".claude/studio/lock.json", lock);
  commit(app, "chore: start building");
  assert.match(push(app).stderr, NEEDS);
});

test("lockfileProblems names every entry that is not from the npm registry or has no integrity hash", () => {
  const text = (o) => JSON.stringify(o);
  const lock = lockfileFor({ name: "a", version: "1.0.0", dependencies: { x: "^1.0.0" } }, 3);
  assert.deepEqual(lockfileProblems(text(lock)), [], "the root package is not an entry");
  const bundled = { ...lock, packages: { ...lock.packages, "node_modules/parent/node_modules/inside": { version: "1.0.0", inBundle: true } } };
  assert.deepEqual(lockfileProblems(text(bundled)), [], "a package bundled in another's tarball has no source of its own");
  const two = { ...lock, packages: { ...lock.packages, "node_modules/dep-0": { version: "1.0.0", resolved: "http://registry.npmjs.org/dep-0.tgz", integrity: "sha512-x" }, "node_modules/dep-1": { version: "1.0.1", resolved: "https://registry.npmjs.org/dep-1/-/dep-1-1.0.1.tgz", integrity: "" } } };
  assert.deepEqual(lockfileProblems(text(two)), ["node_modules/dep-0: comes from http://registry.npmjs.org/dep-0.tgz, not the npm registry", "node_modules/dep-1: no integrity hash"]);
  assert.equal(lockfileProblems(text({ name: "a", version: "1.0.0", lockfileVersion: 1, dependencies: {} })).length, 1, "an old format cannot be checked: that is the problem");
  assert.equal(lockfileProblems("not json").length, 1);
  assert.equal(lockfileProblems(null).length, 1);
  assert.equal(lockfileProblems(text({ packages: { "node_modules/x": null } })).length, 1);
});

// ---------- fix 2: a release that only moves the version ----------

/** An app on main with code, a package.json and its lockfile, on a release branch. */
function released() {
  const app = building();
  npmInstall(app);
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
