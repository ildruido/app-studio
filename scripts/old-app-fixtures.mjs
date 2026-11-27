#!/usr/bin/env node
// Old app copies for the update-path tests (scripts/update-path.test.mjs): what `install` (and `pack add`) of an
// old app-studio release left in an app, so the tests can pull the current harness over it.
//
//   node scripts/old-app-fixtures.mjs build    rebuild every fixture from git history (needs a full clone)
//   node scripts/old-app-fixtures.mjs verify   exit 1 when a rebuilt fixture differs from the saved one
//   node scripts/old-app-fixtures.mjs list
//
// Each fixture is made by the old release's own sync script, read out of git at the commit that released it, so
// nothing in it is written by hand. It is saved as one gzipped JSON file (path -> text) in scripts/fixtures/old-apps/:
// an unpacked copy would be hundreds of old skill files that the lints and searches of this repo would read as live.
// What a real app adds on top (a filled App profile, its own skills, edited files) is added by the tests.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "fixtures", "old-apps");

/** The versions the three real apps ran when the update path was first proven (issue #358), and the commit that released each. */
export const FIXTURES = [
  { name: "web-0.18.1", version: "0.18.1", commit: "86f70ab", packs: ["web"] },
  { name: "plain-0.28.1", version: "0.28.1", commit: "1a33ce3", packs: [] },
  { name: "static-site-0.31.0", version: "0.31.0", commit: "f4dbf31", packs: ["static-site"] },
];
export const SLUG = "old-app";
export const TITLE = "Old App";

const fileOf = (name) => join(DIR, `${name}.json.gz`);

/** Every file under `dir` (dotfiles too, never .git), as posix paths relative to it. */
export function listTree(dir, rel = "") {
  return readdirSync(join(dir, rel)).flatMap((name) => {
    if (!rel && name === ".git") return [];
    const p = rel ? `${rel}/${name}` : name;
    return statSync(join(dir, p)).isDirectory() ? listTree(dir, p) : [p];
  }).sort();
}

/** Writes the saved fixture `name` into `dir` and returns its description ({ name, version, commit, packs }). */
export function unpack(name, dir) {
  const { fixture, files, exec } = JSON.parse(gunzipSync(readFileSync(fileOf(name))).toString("utf8"));
  for (const [path, text] of Object.entries(files)) {
    const to = join(dir, ...path.split("/"));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, text);
    if (exec.includes(path)) chmodSync(to, 0o755);
  }
  return fixture;
}

/** Builds one fixture from git history: the old release's own script installs into an empty folder. Returns the bytes to save. */
export function build(fixture, repo = join(here, "..")) {
  const tmp = mkdtempSync(join(tmpdir(), "old-app-fixture-"));
  try {
    const studio = join(tmp, "app-studio");
    const app = join(tmp, "app");
    mkdirSync(studio);
    mkdirSync(app);
    const tar = join(tmp, "studio.tar");
    const git = spawnSync("git", ["-C", repo, "archive", "--format=tar", "-o", tar, fixture.commit], { encoding: "utf8" });
    if (git.status !== 0) throw new Error(`commit ${fixture.commit} (v${fixture.version}) is not in this clone's history (a full clone is needed): ${git.stderr.trim()}`);
    if (spawnSync("tar", ["-xf", tar, "-C", studio]).status !== 0) throw new Error("could not unpack the old release");
    const was = JSON.parse(readFileSync(join(studio, "plugins/studio/.claude-plugin/plugin.json"), "utf8")).version;
    if (was !== fixture.version) throw new Error(`commit ${fixture.commit} holds v${was}, not v${fixture.version}`);
    // The old script must not reach this machine's own settings: its home is the temp folder.
    const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, STUDIO_USER_SETTINGS: join(tmp, "user-settings.json") };
    delete env.CLAUDE_CODE_REMOTE;
    delete env.STUDIO_DIR;
    // --live-check: at its own commit a release still said "Live check: pending", which is all the flag skips.
    const old = (...args) => {
      const r = spawnSync(process.execPath, [join(studio, "scripts/studio-sync.mjs"), ...args, "--live-check", "--app", app, "--studio", studio], { encoding: "utf8", env });
      if (r.status !== 0) throw new Error(`v${fixture.version} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
    };
    old("install");
    if (fixture.packs.length) old("pack", "add", ...fixture.packs, "--slug", SLUG, "--title", TITLE);
    const paths = listTree(app);
    const files = Object.fromEntries(paths.map((p) => [p, readFileSync(join(app, ...p.split("/")), "utf8")]));
    const exec = paths.filter((p) => statSync(join(app, ...p.split("/"))).mode & 0o100);
    return gzipSync(JSON.stringify({ fixture, files, exec }), { level: 9 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const cmd = process.argv[2];
  if (cmd === "list") {
    for (const f of FIXTURES) console.log(`${f.name}  v${f.version} (${f.commit})  packs: ${f.packs.join(", ") || "none"}  ${existsSync(fileOf(f.name)) ? "saved" : "MISSING"}`);
    return 0;
  }
  if (cmd !== "build" && cmd !== "verify") {
    console.error("Usage: old-app-fixtures.mjs build | verify | list");
    return 2;
  }
  let bad = 0;
  for (const f of FIXTURES) {
    let bytes;
    try {
      bytes = build(f);
    } catch (e) {
      console.error(`${f.name}: ${e.message}`);
      bad++;
      continue;
    }
    // Compared unpacked: the same content may compress to other bytes on another zlib.
    const same = existsSync(fileOf(f.name)) && gunzipSync(readFileSync(fileOf(f.name))).equals(gunzipSync(bytes));
    if (cmd === "verify") {
      console.log(`${f.name}: ${same ? "matches git history" : "DIFFERS from git history"}`);
      if (!same) bad++;
    } else if (same) console.log(`${f.name}: unchanged`);
    else {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(fileOf(f.name), bytes);
      console.log(`${f.name}: written (${fileOf(f.name).split(sep).slice(-4).join("/")})`);
    }
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
