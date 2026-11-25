#!/usr/bin/env node
// Loads the studio harness when a session starts in the folder that holds the repos (every thread of
// a Claude Code Project, and cloud sessions with several repos), where Claude Code would otherwise load
// none of the app's skills, agents or hooks. The "app-studio apps" cloud environment (scripts/env-setup.sh)
// installs a small launcher in <top>/.claude/ (wired in the user settings, ~/.claude/settings.json) that calls this file from the app-studio checkout on every
// session start and hook, so threads always run the current loader (this file), even when the environment's
// setup was cached before app-studio or the app changed. The harness content (skills, agents, hook scripts)
// is the app's own pinned copy and changes only through harness-sync. Because this file reaches every app at
// once, it must keep working with every app copy from 0.6.0 on (see the test in studio-sync.test.mjs).
//   studio-env.mjs link <top>          link skills and agents into <top>/.claude/ (the app's copy once it
//                                      has the harness, app-studio's before that)
//   studio-env.mjs session <top>       SessionStart: link, get the app ready, say which app is loaded
//   studio-env.mjs hook <mode> <top>   run the app's .claude/hooks/check.mjs <mode> with the hook input;
//                                      without an app, do nothing. A Stop-hook failure Claude hasn't seen
//                                      is passed on at its next tool call (STOP_NOTE). Each run logs
//                                      `loader <version of the app-studio checkout it ran from>`
//   studio-env.mjs hook subagent <top> SubagentStop: logs `subagent <agent> model=<model that actually ran it> ...`
//                                      from the agent's transcript (#250), so a model pin is judged by code, not by the agent's word.
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
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
 * Removes the hooks that the app's own studio-sync.mjs forwards in a cloud session (to the user settings
 * since 0.30.1, to <top>/.claude/settings.json before): the environment's launcher already runs them.
 */
export function dropForwarded(top, app) {
  if (!app) return;
  for (const file of [join(top, ".claude/settings.json"), process.env.STUDIO_USER_SETTINGS || join(homedir(), ".claude/settings.json")]) dropFile(file, app);
}

function dropFile(file, app) {
  if (!existsSync(file)) return;
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

/** The models (and effort) a finished helper agent really ran on, read from its transcript: the agent's own file, or the sidechain entries of the session's. */
export function subagentModels(hookInput) {
  const models = new Set();
  const efforts = new Set();
  const own = hookInput.agent_transcript_path;
  const file = own && existsSync(own) ? own : hookInput.transcript_path;
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // No transcript: reported as unknown below.
  }
  for (const line of text.split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.type !== "assistant" || !e.message?.model || e.message.model === "<synthetic>") continue;
    if (file !== own && !e.isSidechain) continue;
    if (file !== own && hookInput.agent_id && e.agentId && e.agentId !== hookInput.agent_id) continue;
    models.add(e.message.model);
    if (e.effort) efforts.add(String(e.effort));
  }
  return { models: [...models], efforts: [...efforts] };
}

/** Makes sure the user settings also run the loader at SubagentStop, next to the Stop wiring an older setup wrote. */
export function ensureSubagentHook(file = process.env.STUDIO_USER_SETTINGS || join(homedir(), ".claude", "settings.json")) {
  try {
    const s = JSON.parse(readFileSync(file, "utf8"));
    const all = (e) => (s.hooks?.[e] ?? []).flatMap((g) => g.hooks ?? []).map((h) => String(h.command ?? ""));
    const stop = all("Stop").find((c) => c.includes("studio-env-launch") && c.endsWith(" hook test"));
    if (!stop || all("SubagentStop").some((c) => c.endsWith(" hook subagent"))) return false;
    (s.hooks.SubagentStop ??= []).push({ hooks: [{ type: "command", command: stop.replace(/ hook test$/, " hook subagent"), timeout: 30 }] });
    writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

function subagentHook() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}") ?? {};
  } catch {
    // Not JSON: logged as unknown.
  }
  const { models, efforts } = subagentModels(input);
  try {
    appendFileSync(
      HOOK_LOG,
      [`loader ${loaderVersion()}`, `subagent ${input.agent_type || "unknown"} model=${models.join("+") || "unknown"} effort=${efforts.join("+") || "unknown"}`]
        .map((l) => `${new Date().toISOString()} ${l}\n`)
        .join(""),
    );
  } catch {
    // Logging must never break a hook.
  }
  return 0;
}

function session(top) {
  ensureSubagentHook();
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

/** The version of the app-studio checkout this loader file runs from (its plugin.json), or "unknown". */
export function loaderVersion() {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../plugins/studio/.claude-plugin/plugin.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Where a Stop-hook failure waits until Claude has seen it (see hook() below).
export const STOP_NOTE = process.env.STUDIO_STOP_NOTE || "/tmp/studio-stop-note.json";
const EVENT = { lint: "PostToolUse", test: "Stop", session: "SessionStart" };

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** True when the session's transcript already shows Claude the text (the Stop hook block was delivered). */
function seen(transcript, text) {
  if (!transcript || !existsSync(transcript)) return false;
  try {
    return readFileSync(transcript, "utf8").includes(JSON.stringify(text.trim().slice(0, 200)).slice(1, -1));
  } catch {
    return false;
  }
}

/**
 * The failure a Stop hook reported, for this session, when Claude has not been shown it yet. In a Claude
 * Code Project thread the turn can end even though the Stop hook blocked it (seen 2026-11-22, #214), so the
 * failure would be lost. It is then given to Claude at its next tool call, once.
 */
function pendingNote(hookInput) {
  const note = readJson(STOP_NOTE);
  if (!note?.text || note.session !== (hookInput.session_id ?? null)) return "";
  rmSync(STOP_NOTE, { force: true });
  if (seen(hookInput.transcript_path, note.text)) return "";
  return `The end-of-turn check (Stop hook) failed after your last turn, but the turn ended before you saw it. Its message:\n${note.text.trim()}\nFix this before you hand back. (If you have already fixed it, ignore this.)`;
}

function hook(mode, top) {
  if (mode === "subagent") return subagentHook();
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
  let hookInput = {};
  try {
    hookInput = JSON.parse(String(input)) ?? {};
  } catch {
    // Not JSON: run the hook as before, without the Stop note.
  }
  const r = spawnSync(process.execPath, [script, mode], { input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout ?? Buffer.alloc(0);
  const err = r.stderr ?? Buffer.alloc(0);
  if (err.length) process.stderr.write(err);
  const status = r.status ?? 0;
  // The first line says which checkout the loader ran from: a thread that moves app-studio to a branch (live check, #227) shows the branch version here.
  const log = [`loader ${loaderVersion()}`, `${mode} exit=${status}`];
  let note = "";
  try {
    if (mode === "test") {
      // Keep a blocking failure until Claude has seen it; a passing (or skipped) run clears it.
      if (status === 2 && err.length) {
        writeFileSync(STOP_NOTE, JSON.stringify({ session: hookInput.session_id ?? null, text: String(err) }));
        log.push("test note saved");
      } else if (status === 0 && !hookInput.stop_hook_active) rmSync(STOP_NOTE, { force: true });
    } else if (status === 0 && !out.length && EVENT[mode] !== "SessionStart") note = pendingNote(hookInput);
  } catch {
    // The Stop note must never break a hook.
  }
  if (note) {
    const hookEventName = hookInput.hook_event_name || EVENT[mode] || "PreToolUse";
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: note } }));
    log.push(`test note shown at ${mode}`);
  } else if (out.length) process.stdout.write(out);
  // Hooks are silent when they pass, so leave a trace that they ran.
  try {
    appendFileSync(HOOK_LOG, log.map((l) => `${new Date().toISOString()} ${l}\n`).join(""));
  } catch {
    // Logging must never break a hook.
  }
  return status;
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
