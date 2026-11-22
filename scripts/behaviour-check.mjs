#!/usr/bin/env node
// Behaviour check (issue #216): the few things only the model can show, run through headless Claude Code
// (`claude -p`) on a throwaway app built from the template, with fixed prompts and code assertions on the
// output and the tool calls. Replaces the manual studio-scratch prompts for these behaviours.
//   node scripts/behaviour-check.mjs [name...]     run all checks, or the named ones
// Needs ANTHROPIC_API_KEY (CI: the repo secret). Without it, prints why and exits 0 (skipped, not failed).
// CLAUDE_BIN overrides the claude command (the plumbing test uses a stand-in). BEHAVIOUR_MODEL picks the model (default: sonnet, what app threads use). Each check is capped by --max-budget-usd
// (about $0.60) and a 10-minute timeout. Isolated HOME, settings and temp folder, like scripts/e2e.test.mjs.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fillProfile } from "./e2e-profile.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLAUDE = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.BEHAVIOUR_MODEL || "sonnet";
const RULE_MARK = "ZEBRA-42";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("Behaviour check skipped: no ANTHROPIC_API_KEY (add the repo secret to turn it on).");
  process.exit(0);
}

/** A throwaway app with the harness installed from this checkout, in its own HOME. */
function makeApp() {
  const root = mkdtempSync(join(tmpdir(), "studio-behaviour-"));
  const app = join(root, "app");
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(root, "tmp"));
  mkdirSync(app);
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: join(root, "tmp"), STUDIO_USER_SETTINGS: join(home, ".claude/settings.json"), GIT_CONFIG_NOSYSTEM: "1" };
  for (const k of ["CI", "CLAUDE_CODE_REMOTE", "NODE_TEST_CONTEXT", "STUDIO_DIR"]) delete env[k];
  const sh = (cmd, args, cwd = app) => execFileSync(cmd, args, { cwd, env, encoding: "utf8" });
  sh("git", ["init", "-q", "-b", "main"]);
  sh("git", ["config", "user.email", "behaviour@example.invalid"]);
  sh("git", ["config", "user.name", "behaviour"]);
  sh(process.execPath, [join(repo, "scripts/studio-sync.mjs"), "install", "--app", app, "--studio", repo, "--live-check"]);
  const md = fillProfile(readFileSync(join(app, "CLAUDE.md"), "utf8"), {
    rows: { App: "Behaviour App", "Owner-merged repos": "`none`" },
    rule: `Prices are always shown in pounds, never euros (rule ${RULE_MARK}).`,
  });
  writeFileSync(join(app, "CLAUDE.md"), md);
  writeFileSync(join(app, "package.json"), '{\n  "name": "behaviour-app",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n');
  mkdirSync(join(app, "node_modules"));
  mkdirSync(join(app, "src"));
  mkdirSync(join(app, "tests"));
  writeFileSync(join(app, ".gitignore"), "node_modules\n");
  writeFileSync(join(app, "src/total.mjs"), "export const total = (a, b) => a - b;\n");
  writeFileSync(join(app, "tests/total.test.mjs"), 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { total } from "../src/total.mjs";\ntest("total adds", () => assert.equal(total(2, 3), 5));\n');
  sh("git", ["add", "-A"]);
  sh("git", ["commit", "-qm", "start"]);
  return { root, app, env };
}

/** Runs one headless prompt; returns the final text, every tool call (also inside helper agents) and the raw events. */
function ask({ app, env }, prompt, { budget = "0.60" } = {}) {
  const r = spawnSync(
    CLAUDE,
    ["-p", prompt, "--output-format", "stream-json", "--verbose", "--model", MODEL, "--max-budget-usd", budget,
      "--no-session-persistence", "--permission-mode", "bypassPermissions", "--setting-sources", "project,local"],
    { cwd: app, env, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 },
  );
  const events = (r.stdout ?? "").split("\n").flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const tools = events.flatMap((e) => (e.type === "assistant" ? e.message?.content ?? [] : []).filter((b) => b.type === "tool_use"));
  const result = events.findLast((e) => e.type === "result");
  return { status: r.status, text: result?.result ?? "", cost: result?.total_cost_usd ?? 0, tools, events, stderr: r.stderr ?? "" };
}

const readsClaudeMd = (t) =>
  (t.name === "Read" && /CLAUDE\.md$/.test(t.input?.file_path ?? "")) ||
  (["Bash", "Grep"].includes(t.name) && /CLAUDE\.md/.test(JSON.stringify(t.input ?? {})));

const CHECKS = {
  /** 0.33.0 / 0.35.3: a red unit test at the end of a turn reaches Claude, which fixes it before handing back. */
  "stop-hook-failure": (fx) => {
    const r = ask(fx, "Reply with the single word READY. Do not run any command or open any file unless something tells you to fix a problem.");
    const fixed = spawnSync("npm", ["test", "--silent"], { cwd: fx.app, env: fx.env, encoding: "utf8" }).status === 0;
    const edited = r.tools.some((t) => /Edit|Write/.test(t.name) && /total\.mjs$/.test(t.input?.file_path ?? ""));
    return {
      cost: r.cost,
      problems: [
        ...(fixed ? [] : ["the unit tests still fail after the turn: Claude never acted on the Stop hook's failure"]),
        ...(edited ? [] : ["Claude did not edit src/total.mjs"]),
      ],
      detail: r.text,
    };
  },
  /** 0.32.1: a helper agent sees the App profile (loaded at start-up) without opening CLAUDE.md. */
  "agent-sees-profile": (fx) => {
    const r = ask(
      fx,
      "Use the reviewer agent (Task tool, subagent_type reviewer). Ask it, without opening or searching any file, to quote this app's Domain rules from its App profile. Then repeat its answer word for word.",
    );
    const agent = r.tools.some((t) => ["Task", "Agent"].includes(t.name) && /reviewer/.test(JSON.stringify(t.input ?? {})));
    return {
      cost: r.cost,
      problems: [
        ...(agent ? [] : ["the reviewer agent was not started"]),
        ...(r.text.includes(RULE_MARK) ? [] : [`the answer does not quote the Domain rule (${RULE_MARK})`]),
        ...(r.tools.some(readsClaudeMd) ? ["CLAUDE.md was opened or searched"] : []),
      ],
      detail: r.text,
    };
  },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHECKS);
const unknown = names.filter((n) => !CHECKS[n]);
if (unknown.length) {
  console.error(`Unknown check: ${unknown.join(", ")}. Known: ${Object.keys(CHECKS).join(", ")}`);
  process.exit(2);
}
if (spawnSync(CLAUDE, ["--version"], { encoding: "utf8" }).status !== 0) {
  console.error(`Claude Code (${CLAUDE}) is not installed.`);
  process.exit(1);
}
let failed = 0;
let cost = 0;
for (const name of names) {
  const fx = makeApp();
  try {
    const res = CHECKS[name](fx);
    cost += res.cost;
    if (res.problems.length) {
      failed++;
      console.log(`FAIL ${name}\n${res.problems.map((p) => `  - ${p}`).join("\n")}\n  Claude's last answer: ${res.detail.slice(0, 600)}`);
    } else console.log(`ok   ${name}`);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}
console.log(`${names.length - failed}/${names.length} behaviour checks passed (model ${MODEL}, about $${cost.toFixed(2)}).`);
process.exit(failed ? 1 : 0);
