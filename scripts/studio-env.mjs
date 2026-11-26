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
//                                      without an app, only the Stop hook of a thread on app-studio itself: it blocks once
//                                      while scripts/finish.mjs has not reached DONE. A Stop-hook failure Claude hasn't seen
//                                      is passed on at its next tool call (STOP_NOTE). Each run logs
//                                      `loader <version of the app-studio checkout it ran from>`
//   studio-env.mjs skills [transcript]  prints, per Skill call in the newest (or given) session transcript's last turn, the model it really ran on (#288).
//                                      The Stop hook logs the same as `skill <name> before=<thread model> model=<model after the call> ...`.
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
function pendingNote(hookInput, log = [], mode = "next call") {
  const note = readJson(STOP_NOTE);
  if (!note?.text || note.session !== (hookInput.session_id ?? null)) return "";
  rmSync(STOP_NOTE, { force: true });
  // Logged either way, so a live check can tell "the Stop block reached Claude" from "the note was lost" (#379).
  if (seen(hookInput.transcript_path, note.text)) {
    log.push(`test note already seen at ${mode} (the Stop block reached Claude)`);
    return "";
  }
  return `The end-of-turn check (Stop hook) failed after your last turn, but the turn ended before you saw it. Its message:\n${note.text.trim()}\nFix this before you hand back. (If you have already fixed it, ignore this.)`;
}

/**
 * The end-of-turn reminder for a thread working on app-studio itself: a finish run that hasn't reached DONE (PR not merged).
 * Empty when there is nothing to remind. A thread waiting on the owner or on a live check just says so, because the Stop hook
 * only blocks the first time (stop_hook_active).
 */
export function finishReminder(studio) {
  const git = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: studio, encoding: "utf8" });
  const state = git.status === 0 ? readJson(join(git.stdout.trim(), "finish.json")) : null;
  if (!state || state.lastFacts?.merged) return "";
  return `finish has not reached DONE (release ${state.version ?? "?"}, ${state.pr ? `PR #${state.pr}` : "no PR yet"}). Run \`node scripts/finish.mjs next\` in ${studio} and make exactly the calls it prints. If it says WAIT or ASK THE OWNER, do that and hand back.`;
}

/**
 * The model each skill's turn really ran on (#288), read from the session transcript: for every Skill call since the last
 * real prompt, the models (and effort) of the assistant messages that followed it. Lets code, not the agent's word, judge a skill's `model:` pin.
 */
export function skillModels(hookInput) {
  let text = "";
  try {
    text = readFileSync(hookInput.transcript_path, "utf8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of text.split("\n")) {
    try {
      const e = JSON.parse(line);
      if (!e?.isSidechain) entries.push(e);
    } catch {
      // Not a transcript entry.
    }
  }
  // A real prompt: not a tool result, and not the text a Skill call itself injects (marked isMeta / sourced from the tool call), which must not end the skill's turn.
  const prompt = (e) =>
    e?.type === "user" &&
    !e.isMeta &&
    !e.sourceToolUseID &&
    !e.sourceToolAssistantUUID &&
    !(Array.isArray(e.message?.content) && e.message.content.some((c) => c?.type === "tool_result"));
  // The last turn that holds a Skill call: later turns (a notification, a reply) must not hide it.
  const hasSkill = (e) => e?.type === "assistant" && Array.isArray(e.message?.content) && e.message.content.some((c) => c?.type === "tool_use" && c.name === "Skill");
  let start = 0;
  let from = 0;
  entries.forEach((e, i) => {
    if (prompt(e)) from = i;
    if (hasSkill(e)) start = from;
  });
  const next = entries.findIndex((e, i) => i > start && prompt(e));
  const out = [];
  const open = [];
  let before = "unknown";
  for (const e of entries.slice(start, next < 0 ? undefined : next)) {
    if (e?.type !== "assistant" || !e.message) continue;
    const model = e.message.model && e.message.model !== "<synthetic>" ? e.message.model : null;
    if (model && !open.length) before = model;
    for (const o of open) if (model) { o.models.add(model); if (e.effort) o.efforts.add(String(e.effort)); }
    for (const c of Array.isArray(e.message.content) ? e.message.content : [])
      if (c?.type === "tool_use" && c.name === "Skill" && c.input?.skill) {
        const o = { skill: String(c.input.skill), before, models: new Set(), efforts: new Set() };
        open.push(o);
        out.push(o);
      }
  }
  return out.map((o) => ({ skill: o.skill, before: o.before, models: [...o.models], efforts: [...o.efforts] }));
}

function logSkills(hookInput) {
  const skills = skillModels(hookInput);
  if (!skills.length) return;
  try {
    appendFileSync(
      HOOK_LOG,
      skills.map((k) => `${new Date().toISOString()} skill ${k.skill} before=${k.before} model=${k.models.join("+") || "unknown"} effort=${k.efforts.join("+") || "unknown"}\n`).join(""),
    );
  } catch {
    // Logging must never break a hook.
  }
}

function hook(mode, top) {
  if (mode === "subagent") return subagentHook();
  const raw = (() => {
    try {
      return readFileSync(0);
    } catch {
      return Buffer.alloc(0);
    }
  })();
  const { app, studio } = find(top);
  const script = app && join(app, ".claude/hooks/check.mjs");
  if (!script || !existsSync(script)) {
    // No app here: a thread working on app-studio itself. Only the Stop hook applies (the finish reminder).
    if (!studio) return 0;
    let hi = {};
    try { hi = JSON.parse(String(raw)) ?? {}; } catch { /* not JSON */ }
    if (mode === "test") logSkills(hi);
    if (mode !== "test") {
      // A Stop reminder Claude missed (#214) is passed on at its next tool call, once.
      const trace = [];
      const note = EVENT[mode] === "SessionStart" ? "" : pendingNote(hi, trace, mode);
      if (note) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: hi.hook_event_name || EVENT[mode] || "PreToolUse", additionalContext: note } }));
        trace.push(`test note shown at ${mode}`);
      }
      try { if (trace.length) appendFileSync(HOOK_LOG, trace.map((l) => `${new Date().toISOString()} ${l}\n`).join("")); } catch { /* never break a hook */ }
      return 0;
    }
    const text = hi.stop_hook_active ? "" : finishReminder(studio);
    if (text) {
      process.stderr.write(text);
      try { writeFileSync(STOP_NOTE, JSON.stringify({ session: hi.session_id ?? null, text })); } catch { /* never break a hook */ }
    }
    try { appendFileSync(HOOK_LOG, `${new Date().toISOString()} loader ${loaderVersion()}\n${new Date().toISOString()} studio test exit=${text ? 2 : 0}\n`); } catch { /* never break a hook */ }
    return text ? 2 : 0;
  }
  const input = raw;
  let hookInput = {};
  try {
    hookInput = JSON.parse(String(input)) ?? {};
  } catch {
    // Not JSON: run the hook as before, without the Stop note.
  }
  if (mode === "test") logSkills(hookInput);
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
    } else if (status === 0 && !out.length && EVENT[mode] !== "SessionStart") note = pendingNote(hookInput, log, mode);
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
  if (cmd === "skills") {
    // The transcript to read: the given file, or the newest session transcript under ~/.claude/projects.
    let file = rest[0];
    if (!file) {
      const root = join(homedir(), ".claude", "projects");
      const all = [];
      try {
        for (const d of readdirSync(root)) for (const f of readdirSync(join(root, d))) if (f.endsWith(".jsonl")) all.push({ f: join(root, d, f), t: statSync(join(root, d, f)).mtimeMs });
      } catch {
        // No projects folder: reported below.
      }
      file = all.sort((a, b) => b.t - a.t)[0]?.f;
    }
    const found = file ? skillModels({ transcript_path: file }) : [];
    if (!found.length) console.log("no Skill call found in the last turn");
    for (const k of found)
      console.log(
        `skill ${k.skill} before=${k.before} model=${k.models.join("+") || "unknown"} effort=${k.efforts.join("+") || "unknown"}` +
          (k.models.length ? "" : " (no finished step after the skill call is in the transcript yet: run one more command, then read again)"),
      );
    return 0;
  }
  if (cmd === "hook" && rest.length >= 1) return hook(rest[0], top);
  console.error("Usage: studio-env.mjs link|session <top> | skills [transcript] | hook <mode> <top>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
