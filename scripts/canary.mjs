#!/usr/bin/env node
// Loader canary (#366): proves by code that a fresh Project thread still loads the studio harness.
// Platform behaviour can change under every app at once (the loader works around a documented limit: cloud
// threads don't run hooks from a repo's .claude/settings.json), so a scheduled fresh thread runs this daily.
//
//   canary.mjs prepare [--top <dir>] [--mark <file>]
//       Builds a throwaway app (`canary-app`) beside app-studio so the app's merge gate is live, writes the
//       start time to <mark>, and prints the one platform action the thread must do (try to merge an app-studio PR).
//   canary.mjs judge --startup <file> --merge <file> [--top <dir>] [--mark <file>] [--log <file>]
//       Judges three things from raw text, never from the thread's words: the start-up message the thread saw
//       (`--startup`), the log lines the hooks wrote after `prepare` (/tmp/studio-hooks.log), and the tool result of the
//       merge attempt (`--merge`). Removes the throwaway app. Exit 0 = pass (print nothing a person must read),
//       exit 1 = fail (prints the reasons for the issue).
//   canary.mjs native --skills <file> [--repo <dir>...]
//       Weekly, in a thread of an environment WITHOUT the launcher: `--skills` is the thread's own list of skill names.
//       Exit 1 = the platform loaded a repo's skills by itself (the signal to plan removing the loader), exit 0 = it didn't.
// Shared studio harness file: change it in app-studio, not in an app.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const studioRoot = resolve(here, "..");
const APP = "canary-app";
export const MERGE_CALL = { owner: "ildruido", repo: "app-studio", pullNumber: 1 };
export const STARTUP = /Studio harness loaded (for the app repo|from app-studio)/;
export const REFUSAL = /Blocked: nobody changes app-studio from an app Project/;

/** The lines of a hook log that are at or after `since` (ISO time), oldest first. */
export function logSince(text, since) {
  return String(text)
    .split("\n")
    .filter((l) => /^\d{4}-\d\d-\d\dT/.test(l) && l.slice(0, 24) >= since);
}

/** Verdict from raw evidence: { ok, reasons[] }. */
export function judge({ startup, merge, logLines }) {
  const reasons = [];
  if (!STARTUP.test(String(startup ?? "").trim())) reasons.push(`the start-up message is missing or different: ${JSON.stringify(String(startup ?? "").trim().slice(0, 160))}`);
  if (!logLines.some((l) => / loader \S+$/.test(l))) reasons.push("the log has no `loader <version>` line after the check started: the launcher did not run the loader");
  if (!logLines.some((l) => / commit exit=\d/.test(l))) reasons.push("the log shows no `commit` hook run after the check started: the hooks did not run");
  if (!logLines.some((l) => / merge exit=2$/.test(l))) reasons.push("the log shows no refused merge (`merge exit=2`): the merge gate did not run or did not refuse");
  if (!REFUSAL.test(String(merge ?? "").trim())) reasons.push(`the merge attempt was not refused with the gate's message: ${JSON.stringify(String(merge ?? "").trim().slice(0, 160))}`);
  return { ok: reasons.length === 0, reasons };
}

/** The throwaway app: just what the loader needs to find an app and run its merge gate. */
export function makeApp(top, studio = studioRoot) {
  const app = join(top, APP);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  mkdirSync(join(app, ".claude/studio"), { recursive: true });
  cpSync(join(studio, "plugins/studio/hooks/check.mjs"), join(app, ".claude/hooks/check.mjs"));
  writeFileSync(join(app, ".claude/studio/lock.json"), "{}\n");
  return app;
}

/** True when any skill name in the thread's list belongs to a repo's own .claude/skills. */
export function nativeLoad(skillsText, repoDirs) {
  const seen = new Set(String(skillsText).split(/[\s,`]+/).map((s) => s.replace(/^[^:]*:/, "")).filter(Boolean));
  const own = repoDirs.flatMap((d) => (existsSync(join(d, ".claude/skills")) ? readdirSync(join(d, ".claude/skills")) : []));
  return own.filter((n) => seen.has(n));
}

const opt = (args, name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const read = (f) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

export function main(argv) {
  const [cmd, ...args] = argv;
  const top = resolve(opt(args, "--top", join(studioRoot, "..")));
  const mark = opt(args, "--mark", "/tmp/canary-mark");
  const log = opt(args, "--log", process.env.STUDIO_HOOK_LOG || "/tmp/studio-hooks.log");
  if (cmd === "prepare") {
    makeApp(top);
    writeFileSync(mark, new Date().toISOString());
    console.log(
      `Throwaway app ${APP} is in ${top}. Now: (1) run any shell command (ls), (2) call the GitHub merge_pull_request tool with ${JSON.stringify(MERGE_CALL)} (a hook should refuse it: never retry or work around it), ` +
        "(3) save the exact start-up message you saw at the start of this thread to a file, and the exact tool result of the merge call to another, (4) run `node scripts/canary.mjs judge --startup <file> --merge <file>`.",
    );
    return 0;
  }
  if (cmd === "judge") {
    // A mistyped path is a usage error (exit 2) that keeps the start mark, so judging again still works.
    const missing = ["--startup", "--merge"].filter((o) => !existsSync(opt(args, o, "")));
    if (missing.length) {
      console.error(`judge: file for ${missing.join(" and ")} not found: save the text there and run judge again`);
      return 2;
    }
    const since = read(mark).trim();
    rmSync(mark, { force: true });
    rmSync(join(top, APP), { recursive: true, force: true });
    if (!/^\d{4}-\d\d-\d\dT/.test(since)) {
      console.log("CANARY FAILED:\n- `prepare` did not run before `judge` (no start mark): nothing can be judged");
      return 1;
    }
    const r = judge({ startup: read(opt(args, "--startup", "")), merge: read(opt(args, "--merge", "")), logLines: logSince(read(log), since) });
    if (r.ok) return 0;
    console.log(`CANARY FAILED:\n- ${r.reasons.join("\n- ")}`);
    return 1;
  }
  if (cmd === "native") {
    const repos = args.flatMap((a, i) => (args[i - 1] === "--repo" ? [resolve(a)] : []));
    const hit = nativeLoad(read(opt(args, "--skills", "")), repos.length ? repos : [studioRoot]);
    if (!hit.length) return 0;
    console.log(`NATIVE LOAD: the platform loaded this repo's own skills without the launcher (${hit.join(", ")}). Plan removing the loader and scripts/env-setup.sh.`);
    return 1;
  }
  console.error("usage: canary.mjs prepare | judge --startup <file> --merge <file> | native --skills <file>");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
