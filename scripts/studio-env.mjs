#!/usr/bin/env node
// Loads the studio harness when a session starts in the folder that holds the repos (every thread of
// a Claude Code Project, and cloud sessions with several repos), where Claude Code would otherwise load
// none of the app's skills, agents or hooks. The "app-studio apps" cloud environment (scripts/env-setup.sh)
// installs a small launcher in <top>/.claude/ that calls this file from the app-studio checkout on every
// session start and hook, so threads always run the current harness, even when the environment's setup
// was cached before app-studio or the app changed.
//   studio-env.mjs link <top>          link skills and agents into <top>/.claude/ (the app's copy once it
//                                      has the harness, app-studio's before that)
//   studio-env.mjs session <top>       SessionStart: link, get the app ready, say which app is loaded
//   studio-env.mjs hook <mode> <top>   run the app's .claude/hooks/check.mjs <mode> with the hook input;
//                                      without an app, do nothing
// Shared studio harness file: change it in app-studio, not in an app.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const has = (d, f) => existsSync(join(d, f));
export const HOOK_LOG = process.env.STUDIO_HOOK_LOG || "/tmp/studio-hooks.log";
export const isStudio = (d) => has(d, "plugins/studio/.claude-plugin/plugin.json");
export const isApp = (d) => has(d, ".claude/studio/lock.json");
const dirs = (d) => {
  try {
    return readdirSync(d)
      .sort()
      .map((n) => join(d, n))
      .filter((p) => statSync(p).isDirectory());
  } catch {
    return [];
  }
};

/** The app-studio checkout and the app (the repo with a harness lock) among the folders in top. */
export function find(top) {
  const kids = dirs(top);
  return { studio: kids.find(isStudio) ?? null, app: kids.find((d) => isApp(d) && !isStudio(d)) ?? null };
}

/**
 * Links each skill folder and agent file into <top>/.claude/, so they always show the repos' current
 * files. Our old links are replaced; a real file or folder of the same name is left alone.
 */
export function link(top) {
  const { studio, app } = find(top);
  const src = app ? join(app, ".claude") : studio ? join(studio, "plugins/studio") : null;
  const linked = [];
  for (const kind of ["skills", "agents"]) {
    const dst = join(top, ".claude", kind);
    mkdirSync(dst, { recursive: true });
    // Harness names: a real copy under one of them is left from an older setup, so it goes too.
    const harness = new Set(studio && existsSync(join(studio, "plugins/studio", kind)) ? readdirSync(join(studio, "plugins/studio", kind)) : []);
    for (const name of readdirSync(dst)) {
      const p = join(dst, name);
      const ours = lstatSync(p).isSymbolicLink() && resolve(dst, readlinkSync(p)).startsWith(resolve(top));
      if (ours || harness.has(name)) rmSync(p, { recursive: true, force: true });
    }
    if (!src || !existsSync(join(src, kind))) continue;
    for (const name of readdirSync(join(src, kind))) {
      if (existsSync(join(dst, name))) continue;
      symlinkSync(join(src, kind, name), join(dst, name));
      linked.push(`${kind}/${name}`);
    }
  }
  return { studio, app, linked };
}

/**
 * Removes the hooks that the app's own studio-sync.mjs forwards to <top>/.claude/settings.json in a
 * cloud session: the environment's launcher already runs them, so they would run twice.
 */
export function dropForwarded(top, app) {
  const file = join(top, ".claude/settings.json");
  if (!app || !existsSync(file)) return;
  let s;
  try {
    s = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return;
  }
  const mine = `${app.split("\\").join("/")}/.claude/hooks/`;
  const before = JSON.stringify(s);
  for (const e of Object.keys(s.hooks ?? {}))
    s.hooks[e] = s.hooks[e]
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !String(h.command ?? "").includes(mine)) }))
      .filter((g) => g.hooks.length);
  if (JSON.stringify(s) !== before) writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
}

function session(top) {
  const { studio, app } = link(top);
  if (!app) {
    console.log(
      studio
        ? "Studio harness loaded from app-studio. No repo here has the harness yet, which is expected before new-app has run: app-studio's skills are loaded, and the app's own skills and hooks start in the first thread after its bootstrap is merged. To start a new app, use the new-app skill. (Working on app-studio itself? Ignore this.)"
        : "The app-studio apps environment found neither app-studio nor an app here.",
    );
    return 0;
  }
  const run = (file, args) =>
    spawnSync(process.execPath, [join(app, file), ...args], { cwd: app, encoding: "utf8", timeout: 280_000 });
  // Dependencies, the browser path and the app's own setup, when they're missing or stale.
  const setup = has(app, ".claude/hooks/cloud-setup.mjs") ? run(".claude/hooks/cloud-setup.mjs", []) : null;
  // Sync warnings, and the git pre-commit health check turned on.
  const check = has(app, ".claude/studio/studio-sync.mjs") ? run(".claude/studio/studio-sync.mjs", ["check", "--warn"]) : null;
  dropForwarded(top, app);
  const notes = [setup, check]
    .map((r) => (r?.stdout ?? "").trim())
    .filter((t) => t && t !== "Cloud setup done." && !t.startsWith("Harness hooks: forwarded"));
  console.log(
    [
      `Studio harness loaded for the app repo ${app.split(/[\\/]/).pop()} (${app}). Work on the app inside that folder. Each hook run is logged in ${HOOK_LOG}.`,
      ...notes,
    ].join("\n"),
  );
  return 0;
}

function hook(mode, top) {
  const { app } = find(top);
  const script = app && join(app, ".claude/hooks/check.mjs");
  if (!script || !existsSync(script)) return 0;
  const input = (() => {
    try {
      return readFileSync(0);
    } catch {
      return "";
    }
  })();
  const r = spawnSync(process.execPath, [script, mode], { input, stdio: ["pipe", "inherit", "inherit"] });
  // Hooks are silent when they pass, so leave a trace that they ran.
  try {
    appendFileSync(HOOK_LOG, `${new Date().toISOString()} ${mode} exit=${r.status ?? 0}\n`);
  } catch {
    // Logging must never break a hook.
  }
  return r.status ?? 0;
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  const top = resolve(rest.at(-1) ?? process.cwd());
  if (cmd === "link") {
    const r = link(top);
    console.log(`[studio-env] ${r.app ? `app ${r.app}` : r.studio ? `app-studio ${r.studio}` : "nothing"}: linked ${r.linked.length} skills and agents in ${join(top, ".claude")}`);
    return 0;
  }
  if (cmd === "session") return session(top);
  if (cmd === "hook" && rest.length >= 1) return hook(rest[0], top);
  console.error("Usage: studio-env.mjs link|session <top> | hook <mode> <top>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
