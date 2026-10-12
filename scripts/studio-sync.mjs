#!/usr/bin/env node
// studio-sync: keeps an app's copy of the studio harness in step with app-studio, the master copy.
//
//   node studio-sync.mjs install [--app <dir>] [--studio <dir>]   first copy into an app, plus templates
//   node studio-sync.mjs check   [--app <dir>] [--studio <dir>] [--warn]
//   node studio-sync.mjs pull    [--app <dir>] [--studio <dir>] [--force]
//
// Runs from app-studio (scripts/studio-sync.mjs, app defaults to the current folder) or from an
// app's copy (.claude/studio/studio-sync.mjs, app-studio defaults to $STUDIO_DIR, then ../app-studio).
// The app's .claude/studio/lock.json pins the studio version and a hash of every managed file.
// Exit codes: 0 in step, 1 drift or skipped files, 2 usage error. --warn always exits 0 and prints
// only when something needs attention (for a SessionStart hook).
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LOCK = ".claude/studio/lock.json";
const SELF = ".claude/studio/studio-sync.mjs";

// Master folders in app-studio and where their files land in an app.
const TREES = [
  ["plugins/studio/skills", ".claude/skills"],
  ["plugins/studio/agents", ".claude/agents"],
  ["plugins/studio/hooks", ".claude/hooks"],
];
// Copied once by install when the app doesn't have them yet; never managed afterwards.
const TEMPLATES = [
  ["plugins/studio/templates/CLAUDE.md", "CLAUDE.md"],
  ["plugins/studio/templates/settings.json", ".claude/settings.json"],
];

const toPosix = (p) => p.split(sep).join("/");

// Line endings don't count as a change (Windows checkouts).
export function hashFile(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  // Dotfiles (.DS_Store, editor swap files) are never part of the harness.
  return readdirSync(dir).filter((name) => !name.startsWith(".")).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export function isStudio(dir) {
  return !!dir && existsSync(join(dir, "plugins", "studio", ".claude-plugin", "plugin.json"));
}

export function studioVersion(studio) {
  return JSON.parse(readFileSync(join(studio, "plugins/studio/.claude-plugin/plugin.json"), "utf8"))
    .version;
}

// { "<app path>": { src: "<absolute master path>", hash } }
export function masterFiles(studio) {
  const files = {};
  for (const [from, to] of TREES) {
    const base = join(studio, from);
    for (const src of listFiles(base)) {
      files[`${to}/${toPosix(relative(base, src))}`] = { src, hash: hashFile(src) };
    }
  }
  const self = join(studio, "scripts", "studio-sync.mjs");
  files[SELF] = { src: self, hash: hashFile(self) };
  return files;
}

export function readLock(app) {
  const p = join(app, LOCK);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function writeLock(app, version, files) {
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  mkdirSync(dirname(join(app, LOCK)), { recursive: true });
  writeFileSync(join(app, LOCK), `${JSON.stringify({ studio: version, files: sorted }, null, 2)}\n`);
}

const localHash = (app, path) => (existsSync(join(app, path)) ? hashFile(join(app, path)) : null);

// Pure comparison; studio may be null (then only local edits are checked).
export function compare(app, studio) {
  const lock = readLock(app);
  const report = { installed: !!lock, edited: [], missing: [], behind: [], added: [], removed: [] };
  if (!lock) return report;
  report.version = lock.studio;
  for (const [path, hash] of Object.entries(lock.files)) {
    const cur = localHash(app, path);
    if (cur === null) report.missing.push(path);
    else if (cur !== hash) report.edited.push(path);
  }
  if (studio) {
    report.studioVersion = studioVersion(studio);
    const master = masterFiles(studio);
    for (const [path, { hash }] of Object.entries(master)) {
      if (!(path in lock.files)) report.added.push(path);
      else if (lock.files[path] !== hash) report.behind.push(path);
    }
    for (const path of Object.keys(lock.files)) if (!(path in master)) report.removed.push(path);
  }
  return report;
}

export const drift = (r) =>
  !r.installed ||
  [r.edited, r.missing, r.behind, r.added, r.removed].some((list) => list.length > 0);

export function pull(app, studio, { force = false } = {}) {
  let lock;
  try {
    lock = readLock(app) ?? { files: {} };
  } catch (e) {
    // A corrupt lock: --force rebuilds it from what is on disk.
    if (!force) throw new Error(`${LOCK} is unreadable (${e.message}). Pass --force to rebuild it.`);
    lock = { files: {} };
  }
  const files = { ...lock.files };
  const result = { written: [], deleted: [], skipped: [] };
  const master = masterFiles(studio);

  for (const [path, { src, hash }] of Object.entries(master)) {
    const cur = localHash(app, path);
    if (cur === hash) {
      files[path] = hash;
      continue;
    }
    // Keep a local change (or an unmanaged file in the way) unless forced.
    const known = files[path];
    if (cur !== null && cur !== known && !force) {
      result.skipped.push(path);
      continue;
    }
    mkdirSync(dirname(join(app, path)), { recursive: true });
    copyFileSync(src, join(app, path));
    files[path] = hash;
    result.written.push(path);
  }
  for (const path of Object.keys(files)) {
    if (path in master) continue;
    const cur = localHash(app, path);
    if (cur !== null && cur !== files[path] && !force) {
      result.skipped.push(path);
      continue;
    }
    if (cur !== null) rmSync(join(app, path));
    delete files[path];
    result.deleted.push(path);
  }
  writeLock(app, studioVersion(studio), files);
  return result;
}

export function install(app, studio, opts) {
  const result = pull(app, studio, opts);
  result.templates = [];
  for (const [from, to] of TEMPLATES) {
    if (existsSync(join(app, to))) continue;
    mkdirSync(dirname(join(app, to)), { recursive: true });
    copyFileSync(join(studio, from), join(app, to));
    result.templates.push(to);
  }
  return result;
}

function parseArgs(argv) {
  const opts = { cmd: argv[0], warn: false, force: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--warn") opts.warn = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--app" || a === "--studio") opts[a.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function locate(opts) {
  const here = dirname(fileURLToPath(import.meta.url));
  const fromStudio = isStudio(join(here, ".."));
  const app = resolve(opts.app ?? (fromStudio ? process.cwd() : join(here, "..", "..")));
  const candidates = fromStudio
    ? [opts.studio, join(here, "..")]
    : [opts.studio, process.env.STUDIO_DIR, join(app, "..", "app-studio")];
  const studio = candidates.filter(Boolean).map((d) => resolve(d)).find(isStudio) ?? null;
  if (opts.studio && !isStudio(resolve(opts.studio)))
    throw new Error(`Not an app-studio checkout: ${opts.studio}`);
  return { app, studio };
}

const list = (label, paths) => (paths.length ? [`  ${label}: ${paths.join(", ")}`] : []);

function main() {
  const argv = process.argv.slice(2);
  let opts, app, studio;
  try {
    opts = parseArgs(argv);
    ({ app, studio } = locate(opts));
  } catch (e) {
    console.error(e.message);
    return argv.includes("--warn") ? 0 : 2;
  }

  if (opts.cmd === "check") {
    let r;
    try {
      r = compare(app, studio);
    } catch (e) {
      console.log(`Studio harness check failed: ${e.message}`);
      return opts.warn ? 0 : 1;
    }
    if (!drift(r)) {
      if (!opts.warn)
        console.log(
          `Studio harness v${r.version} is in step${studio ? "" : " with its lock (app-studio not found, so not compared with the master copy)"}.`,
        );
      return 0;
    }
    const lines = r.installed
      ? [
          `Studio harness v${r.version}${r.studioVersion ? ` (app-studio has v${r.studioVersion})` : ""} is out of step:`,
          ...list("behind app-studio", r.behind),
          ...list("new in app-studio", r.added),
          ...list("removed in app-studio", r.removed),
          ...list("edited here", r.edited),
          ...list("missing here", r.missing),
          "Use the harness-sync skill to bring it in step.",
        ]
      : [`No studio harness lock in ${app} (${LOCK}). Install it with the new-app or harness-sync skill.`];
    console.log(lines.join("\n"));
    return opts.warn ? 0 : 1;
  }

  if (opts.cmd === "pull" || opts.cmd === "install") {
    if (!studio) {
      console.error("app-studio not found. Pass --studio <dir> or set STUDIO_DIR.");
      return 2;
    }
    let r;
    try {
      r = (opts.cmd === "install" ? install : pull)(app, studio, opts);
    } catch (e) {
      console.error(e.message);
      return 1;
    }
    const lines = [
      `Studio harness v${studioVersion(studio)} ${opts.cmd === "install" ? "installed in" : "pulled into"} ${app}.`,
      ...list("updated", r.written),
      ...list("deleted", r.deleted),
      ...list("added from templates", r.templates ?? []),
      ...list("skipped (changed here; move the change to app-studio, or pass --force)", r.skipped),
    ];
    console.log(lines.join("\n"));
    return r.skipped.length ? 1 : 0;
  }

  console.error("Usage: studio-sync.mjs <install|check|pull> [--app <dir>] [--studio <dir>] [--warn] [--force]");
  return 2;
}

// Run main only when executed directly, not when imported by the tests.
const same = (a, b) => {
  const norm = (p) => realpathSync(p)[process.platform === "win32" ? "toLowerCase" : "toString"]();
  return norm(a) === norm(b);
};
if (process.argv[1] && existsSync(process.argv[1]) && same(process.argv[1], fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
