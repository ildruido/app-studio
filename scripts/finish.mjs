#!/usr/bin/env node
// Every step after a build, by code (GOVERNANCE section 5). Plain code, no model: it decides each next step from git, the release
// records, the tier and gate rules and the PR's raw state, and prints exactly one thing to do. The thread supplies only what needs
// judgement (the summary, what changes for the App Creator, what wasn't verified, which scenarios prove the change, fixes for red
// checks) and makes the platform calls this script prints, word for word: scripts in a thread have no GitHub token.
//   node scripts/finish.mjs start --issue N[,M] --title "<conventional commit title>" --summary "<phrase>" --not-verified "<text>"...
//        [--app-creator "<text>"]... [--app-action "<text>"]... [--admin-action "<text>"]... [--scenarios a,b | --no-branch-check "<reason>"]
//        [--main-scenarios x,y] [--minor] [--what "<text>"]... [--test "<text>"]... [--pr-prefix "<text>"] [--pr-suffix "<text>"] [--trailer "<line>"]...
//        sync with main, next free version, record + plugin version + pack versions + CHANGELOG.md, the CI checks, commit, push.
//        Run it again with changed inputs to rewrite the record (it keeps the version unless main took it).
//   node scripts/finish.mjs next [--pr N] [--facts FILE]
//        the next step. --live-result FILE: the result text the thread read itself on studio-scratch #72 (a missed relay never stalls). --pr once, after the PR exists. --facts: the PR's raw state (the script says how to collect it). Live-check
//        results arrive by code: the merge-queue workflow comments each one on the PR (scripts/live-check-relay.mjs) and the facts carry its marker.
//   node scripts/finish.mjs push --message "<commit message>"   after a fix: sync with main, run the checks, commit, push
//   node scripts/finish.mjs owner-ok      only after the App-Studio Owner wrote OK in the thread: records it for the PR's own changes
//   node scripts/finish.mjs status        what the records, the state and the last facts say (never from memory)
// State: .git/finish.json (never committed).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appFacing } from "./branch-gate.mjs";
import { cmp } from "./release.mjs";
import { readResult } from "./live-check.mjs";
import { verdictProblems } from "../plugins/studio/hooks/verdict.mjs";
import { PLUGIN, isBookkeeping, ownFingerprint as ownFp } from "./own-fp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export { PLUGIN };
export const LIVE_WAIT_MINUTES = 65;
const SCRATCH = { repo: "studio-scratch", requests: 71, results: 72 };
const LIVE_FILE = ".git/finish-live.txt";

// ---------- pure parts ----------

/** Release kind from the files a change touches (the same lists CI's release check and branch gate use). */
export function kindOf(changed) {
  const own = changed.filter((f) => !isBookkeeping(f));
  if (own.some((f) => /^scripts\/(studio-env\.mjs|env-setup\.sh)$/.test(f))) return "loader";
  return appFacing(own).length ? "app-facing" : "internal";
}

const parts = (v) => v.split(".").map(Number);
/** Next free version above everything main has. */
export function nextVersion(mainVersions, minor = false) {
  const top = mainVersions.reduce((m, v) => (cmp(v, m) > 0 ? v : m), "0.0.0");
  const [a, b, c] = parts(top);
  return minor ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

/** Keep `version` unless main already has it or something newer. */
export const versionFree = (version, mainVersions) => !!version && mainVersions.every((v) => cmp(version, v) > 0);

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Check the thread's judgement inputs; returns problems (empty = fine). */
export function checkInputs(inp, kind, catalog) {
  const p = [];
  if (!list(inp.issues).length) p.push("--issue: name the issue(s) this settles");
  if (!/^[a-z]+(\([^)]+\))?!?: \S/.test(inp.title ?? "")) p.push('--title must be a Conventional Commit title, e.g. "feat(release): one finish command"');
  if (!inp.summary?.trim()) p.push("--summary: a short phrase for the changelog");
  if (!list(inp.notVerified).length) p.push('--not-verified: say what was not verified (at least one line, or "Nothing beyond the unit tests")');
  if (kind !== "internal") {
    if (!list(inp.appCreator).length) p.push("--app-creator: what changes for the App Creator (this release reaches apps)");
    if (!list(inp.scenarios).length && !inp.noBranchCheck) p.push("--scenarios a,b (from releases/scenarios.json, where: branch) or --no-branch-check \"<reason>\": this release reaches apps");
    if (kind === "loader" && !list(inp.mainScenarios).length) p.push("--main-scenarios: a loader or setup release also needs a main scenario");
    if (kind === "loader" && inp.noBranchCheck) p.push("a loader or setup release always has branch scenarios");
  }
  for (const [ids, where] of [[list(inp.scenarios), "branch"], [list(inp.mainScenarios), "main"]])
    for (const id of ids) {
      const e = catalog.find((c) => c.id === id);
      if (!e) p.push(`unknown scenario "${id}" (add it to releases/scenarios.json first, written before the code)`);
      else if (e.where !== where) p.push(`scenario "${id}" is a ${e.where} scenario, not ${where}`);
    }
  return p;
}

/** The release record, from the thread's inputs and the decided kind and version. */
export function buildRecord(inp, { version, kind, date, pr = null }) {
  const main = list(inp.mainScenarios);
  return {
    version,
    date,
    summary: inp.summary.trim(),
    kind,
    refs: { issues: list(inp.issues).map(Number), ideas: list(inp.ideas).map(Number), pr },
    appCreator: list(inp.appCreator),
    appActions: list(inp.appActions),
    adminActions: list(inp.adminActions),
    checks: {
      branch: kind === "internal" ? { none: "internal change, apps never receive it" } : inp.noBranchCheck ? { none: inp.noBranchCheck } : list(inp.scenarios),
      main,
    },
    status: { main: main.length ? "pending" : "not needed" },
    notVerified: list(inp.notVerified),
  };
}

/** The PR description: attribution, hand-over, Closes lines. */
export function prBody(st) {
  const i = st.inputs;
  const bullet = (xs, none) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : `- ${none}`);
  const branch = Array.isArray(st.record.checks.branch) ? st.record.checks.branch.join(", ") : `none (${st.record.checks.branch.none})`;
  return [
    ...(i.prPrefix ? [i.prPrefix, ""] : []),
    `**${st.version}** (${st.kind}): ${i.summary}`,
    "",
    "## What changed",
    bullet(list(i.what), i.summary),
    "",
    "## How to test",
    bullet(list(i.test), "The CI checks (`check`)."),
    "",
    "## Live check",
    `- Branch: ${branch}`,
    `- Main: ${st.record.checks.main.join(", ") || "none"}`,
    "",
    "## What wasn't verified",
    bullet(list(i.notVerified), "Nothing beyond the CI checks."),
    "",
    list(i.issues).map((n) => `Closes #${n}`).join("\n"),
    ...(i.prSuffix ? ["", i.prSuffix] : []),
  ].join("\n");
}

/** Only the reasons that put a PR in the owner tier, short, for the one-line OK request. */
export const ownerReasons = (reasons = []) => reasons.filter((r) => r.startsWith("owner: ")).map((r) => r.slice(7)).join("; ") || "of the files it changes";

/** The verdict for this run from the facts' `live` marker (CI wrote it): true pass, false fail, null none yet or another run's. A stored one holds. */
export function liveResult(facts, req, direct = "") {
  if (!req) return null;
  const mine = direct ? readResult(direct, req.id) : { mine: false }; // read from studio-scratch #72 by the thread itself: no relay needed
  if (mine.mine) return mine.pass;
  if (facts?.live?.id === req.id) return facts.live.verdict === "pass";
  return req.result ? req.result === "pass" : null;
}

const tool = (name, args) => `${name} ${JSON.stringify(args)}`;

export const FACTS_HELP = [
  "Collect the PR's raw state (no interpretation) and write it to .git/finish-facts.json:",
  '  { "state": "open|closed", "merged": true|false, "draft": true|false, "mergeable": true|false|null, "labels": ["..."],',
  '    "jobs": { "tier": "...", "tests": "...", "gate": "...", "queue": "...", "check": "..." }, "queue": "turn|wait|none",',
  '    "live": { "id": "lc-...", "verdict": "pass|fail" } }',
  "  - state, merged, draft, mergeable, labels: mcp__github__pull_request_read method get",
  "  - jobs: mcp__github__pull_request_read method get_check_runs; each job's conclusion (success, failure, skipped), or pending while it runs, missing = pending",
  "  - queue: mcp__github__pull_request_read method get_comments; the newest comment containing <!-- merge-queue:turn --> is turn, <!-- merge-queue:wait --> is wait, none if neither",
  "  - live: the same comments; the newest one containing <!-- live-check-result:ID:VERDICT --> gives id and verdict (leave out when there is none). Only the marker, never the result text.",
].join("\n");

/**
 * The next step. Pure: everything it needs is in ctx. Returns { type, text, steps?, local?, update? }.
 *   type: do (make these calls, then run `then`), wait (end the turn; an event or the check-in wakes you), ask (post this to the
 *   App-Studio Owner and stop), fix (judgement: fix it, then `finish push`), local (the script acts itself and decides again), done.
 * ctx: { st, facts, owner, repo, tier, tierReasons, ownFp, appFp, behind, collision, result: true|false|null, now, record }
 */
export function decide(ctx) {
  const { st, facts, owner, repo, now } = ctx;
  const R = { owner, repo };
  const then = "node scripts/finish.mjs next --facts .git/finish-facts.json";
  const pr = st.pr;
  if (!pr) {
    return {
      type: "do",
      steps: [tool("mcp__github__create_pull_request", { ...R, title: st.inputs.title, head: st.branch, base: "main", draft: st.kind !== "internal", body: prBody(st) })],
      text: "Open the PR.",
      then: "node scripts/finish.mjs next --pr <the new PR number>",
    };
  }
  if (!st.prSetup) {
    return {
      type: "do",
      local: "record-pr",
      update: { prSetup: true },
      steps: [
        tool("mcp__github__issue_write", { ...R, method: "update", issue_number: pr, assignees: [owner] }),
        tool("mcp__github__update_pull_request", { ...R, pullNumber: pr, reviewers: [owner] }),
        tool("mcp__claude-code-remote__subscribe_pr_activity", { ...R, pullNumber: pr }),
        tool("mcp__claude-code-remote__send_later", { delay_minutes: 3, initiation: "own_followup", message: `Check-in on PR #${pr}: run ${then} after collecting the facts.` }),
      ],
      text: `PR #${pr} recorded in its release record. Set it up (assignee and review request are best effort; go on if they fail).`,
      then,
    };
  }
  if (!facts) return { type: "facts", text: FACTS_HELP, then };

  if (facts.merged) {
    const rec = ctx.record;
    if (!st.passMainFor && rec && rec.status?.main === "pending" && rec.checks?.main?.length) {
      if (!st.mainRequest) return { type: "local", local: "main-request", text: "Merged; the main live check is next." };
      if (ctx.result === true) return { type: "local", local: "pass-main", text: `Main live check ${st.mainRequest.id} passed: opening the pass-main PR.` };
      if (ctx.result === false) return { type: "fix", text: `The main live check ${st.mainRequest.id} failed. Apps cannot pull ${st.version} (it stays pending). Hand back with the result text; the fix is a new issue.` };
      if (now - st.mainRequest.at > LIVE_WAIT_MINUTES * 60000) return { type: "fix", text: `The main live check ${st.mainRequest.id} got no result in ${LIVE_WAIT_MINUTES} minutes: it failed (never started or timed out). Hand back and say so.` };
      return { type: "wait", text: `Waiting for main live check ${st.mainRequest.id}. CI comments the result on this PR (a <!-- live-check-result:... --> marker), which wakes you: collect the facts and run next. No result by the check-in counts as failed.` };
    }
    return {
      type: "done",
      steps: [tool("mcp__claude-code-remote__unsubscribe_pr_activity", { ...R, pullNumber: pr })],
      text: `PR #${pr} is merged. Hand back with the status below (node scripts/finish.mjs status).`,
    };
  }
  if (facts.state === "closed") return { type: "fix", text: `PR #${pr} was closed without merging. Hand back and say so.` };
  if (ctx.collision || ctx.behind) return { type: "local", local: "sync", text: ctx.collision ? `main already has ${st.version}: taking the next free version.` : "main moved: updating the branch." };

  const jobs = facts.jobs ?? {};
  const job = (n) => jobs[n] ?? "pending";
  if (job("tier") === "failure" || job("tests") === "failure")
    return { type: "fix", text: `CI's ${job("tests") === "failure" ? "tests" : "tier"} job failed. Read its log (mcp__github__get_job_logs; the summary is the failing step's last lines), fix the cause, then run node scripts/finish.mjs push --message "fix: <what>".` };

  if (facts.draft) {
    if (st.kind === "internal") return { type: "do", steps: [tool("mcp__github__update_pull_request", { ...R, pullNumber: pr, draft: false })], text: "An internal PR needs no live check: mark it ready.", then };
    if (facts.queue !== "turn") return { type: "wait", text: facts.queue === "wait" ? "Waiting in the merge queue behind another app-facing PR. Its QUEUE-TURN comment wakes you." : "Waiting for the merge queue's comment (QUEUE-TURN or QUEUE-WAIT); the half-hourly run posts it if the event was missed." };
    const needsBranch = Array.isArray(st.record.checks.branch) && st.record.checks.branch.length;
    if (!needsBranch) return { type: "do", steps: [tool("mcp__github__update_pull_request", { ...R, pullNumber: pr, draft: false })], text: `The record needs no branch check (${st.record.checks.branch.none}): mark it ready.`, then };
    if (!st.request || st.request.fp !== ctx.appFp) return { type: "local", local: "branch-request", text: st.request ? "The app-facing changes changed since the last request: a new run is needed." : "Our turn in the queue: requesting the branch live check." };
    if (ctx.result === true) return { type: "do", update: { livePass: st.request.id }, steps: [tool("mcp__github__update_pull_request", { ...R, pullNumber: pr, draft: false })], text: `Branch live check ${st.request.id} passed: mark the PR ready.`, then };
    if (ctx.result === false) return { type: "fix", text: `Branch live check ${st.request.id} failed. Read the result text, fix the cause, then run node scripts/finish.mjs push --message "fix: <what>"; a new request follows by itself once the app-facing changes differ. If nothing in them needs to change, hand back with the result text.` };
    if (now - st.request.at > LIVE_WAIT_MINUTES * 60000) return { type: "fix", text: `Branch live check ${st.request.id} got no result in ${LIVE_WAIT_MINUTES} minutes: it failed (never started or timed out). Hand back and say so.` };
    return { type: "wait", text: `Waiting for branch live check ${st.request.id}. CI comments the result on this PR (a <!-- live-check-result:... --> marker), which wakes you: collect the facts and run next. No result by the check-in counts as failed.` };
  }

  if (["tier", "tests", "gate", "queue", "check"].some((n) => job(n) === "pending")) return { type: "wait", text: `CI is running on PR #${pr}. Its result wakes you (or the check-in).` };
  if (job("queue") === "failure") return { type: "wait", text: "Not this PR's turn in the merge queue yet; its QUEUE-TURN comment wakes you." };
  if (job("gate") === "failure" && st.kind !== "internal")
    return { type: "do", steps: [tool("mcp__github__update_pull_request", { ...R, pullNumber: pr, draft: true })], text: "CI's branch gate finds no passing live check for the PR's current app-facing changes: back to draft for a new run.", then };

  const labels = facts.labels ?? [];
  const mergeOk = job("check") === "success" && facts.mergeable !== false;
  if (ctx.verdictProblems?.length) return { type: "fix", text: `Not merging PR #${pr}: ${blockedText(ctx.verdictProblems)}. Do that, then node scripts/finish.mjs push --message "chore: review and QA results".` };
  const merge = tool("mcp__github__merge_pull_request", { ...R, pullNumber: pr, merge_method: "squash" });
  if (ctx.tier === "owner") {
    if (labels.includes("owner-ok")) {
      if (mergeOk) return { type: "do", steps: [merge], text: "Owner OK and green: merge.", then };
      return { type: "fix", text: `PR #${pr} has owner-ok but check is ${job("check")}${facts.mergeable === false ? " and it is not mergeable" : ""}. Read the check job's summary; fix and push, or hand back.` };
    }
    if (st.ownerOk && st.ownerOk.fp === ctx.ownFp)
      return { type: "do", steps: [tool("mcp__github__issue_write", { ...R, method: "update", issue_number: pr, labels: [...labels, "owner-ok"] })], text: "The App-Studio Owner already OK'd these changes (only main or the version moved since): add owner-ok again without asking.", then };
    const again = st.ownerOk ? " The PR's own changes changed since the last OK, so it is needed again." : "";
    return {
      type: "ask",
      text: `Post this to the App-Studio Owner, then end the turn. When they reply OK, run node scripts/finish.mjs owner-ok, then ${then}.${again}`,
      ask: `PR #${pr} (${st.version}, ${st.inputs.summary}) is ready and in the owner tier because ${ownerReasons(ctx.tierReasons)}. Reply OK to merge it.`,
    };
  }
  if (mergeOk) return { type: "do", steps: [merge], text: `Tier ${ctx.tier}, green and mergeable: merge.`, then };
  if (!st.autoMerge) return { type: "do", update: { autoMerge: true }, steps: [tool("mcp__github__enable_pr_auto_merge", { ...R, pullNumber: pr, mergeMethod: "SQUASH" })], text: `Tier ${ctx.tier}: switch on auto-merge (squash). If the repo refuses, merge once check is green.`, then };
  return { type: "wait", text: `Tier ${ctx.tier}, auto-merge on: waiting for GitHub to merge.` };
}

// ---------- git and files ----------

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}
const git = (...a) => sh("git", a);
const must = (r, what) => { if (!r.ok) die(`${what} failed:\n${r.err || r.out}`); return r.out; };
function die(msg, code = 1) { console.error(msg); process.exit(code); }

const statePath = () => join(must(git("rev-parse", "--git-dir"), "git"), "finish.json");
const loadState = () => (existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), "utf8")) : null);
const saveState = (st) => writeFileSync(statePath(), `${JSON.stringify(st, null, 2)}\n`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const today = () => new Date().toISOString().slice(0, 10);

function ownerRepo() {
  const url = must(git("remote", "get-url", "origin"), "git remote");
  const m = /[/:]([^/:]+)\/([^/]+?)(\.git)?$/.exec(url);
  if (!m) die(`cannot read owner/repo from ${url}`);
  return { owner: m[1], repo: m[2] };
}

const fetchMain = () => must(git("fetch", "--quiet", "origin", "main"), "git fetch origin main");
const changedFiles = () => must(git("diff", "--name-only", "--no-renames", "origin/main...HEAD"), "git diff").split("\n").filter(Boolean);
const workingChanges = () => must(git("status", "--porcelain"), "git status").split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ""));

function mainVersions() {
  const vs = [JSON.parse(must(git("show", `origin/main:${PLUGIN}`), "read main's plugin version")).version];
  for (const f of must(git("ls-tree", "--name-only", "origin/main", "releases/"), "list main's releases").split("\n"))
    { const m = /releases\/(\d+\.\d+\.\d+)\.json$/.exec(f); if (m) vs.push(m[1]); }
  return vs;
}

/** A release record already on main belongs to another PR: keep main's; everything else generated is ours (re-rendered after). */
export const conflictSide = (f) => (/^releases\/\d+\.\d+\.\d+\.json$/.test(f) ? "theirs" : "ours");
export function resolveConflicts(files) {
  for (const f of files) must(git("checkout", `--${conflictSide(f)}`, "--", f), `keep ${conflictSide(f)} ${f}`);
}

/** Merge main in; generated files that conflict are resolved by code (ours, then re-rendered). */
function syncMain(st) {
  fetchMain();
  if (git("merge-base", "--is-ancestor", "origin/main", "HEAD").ok) return false;
  const m = git("merge", "--no-edit", "origin/main");
  if (!m.ok) {
    const conflicted = must(git("diff", "--name-only", "--diff-filter=U"), "git diff").split("\n").filter(Boolean);
    const mine = conflicted.filter((f) => !isBookkeeping(f));
    if (mine.length) { git("merge", "--abort"); die(`FIX: merging main conflicts in ${mine.join(", ")}. Resolve it by hand (judgement), commit, then run node scripts/finish.mjs push --message "chore: merge main".`); }
    resolveConflicts(conflicted);
    writeRelease(st);
    must(git("add", "-A"), "git add");
    must(git("commit", "--no-edit"), "git commit");
  }
  return true;
}

/** Write the record, the plugin version, raised pack versions and CHANGELOG.md for st.version (renumbering if needed). */
function writeRelease(st) {
  const versions = mainVersions();
  if (!versionFree(st.version, versions)) {
    const old = st.version;
    st.version = nextVersion(versions, st.inputs.minor);
    if (old && existsSync(`releases/${old}.json`) && !must(git("ls-tree", "--name-only", "origin/main", `releases/${old}.json`), "ls-tree")) rmSync(`releases/${old}.json`);
    if (old) console.log(`Version ${old} is taken on main: this release is now ${st.version}.`);
  }
  const prev = existsSync(`releases/${st.version}.json`) ? readJson(`releases/${st.version}.json`) : null;
  st.record = buildRecord(st.inputs, { version: st.version, kind: st.kind, date: prev?.date ?? today(), pr: st.pr ?? null });
  writeJson(`releases/${st.version}.json`, st.record);
  const pj = readJson(PLUGIN);
  pj.version = st.version;
  writeJson(PLUGIN, pj);
  for (const pack of new Set(changedFiles().concat(workingChanges()).map((f) => /^packs\/([^/]+)\//.exec(f)?.[1]).filter(Boolean))) {
    const p = `packs/${pack}/pack.json`;
    const before = git("show", `origin/main:${p}`);
    if (!existsSync(p) || !before.ok) continue;
    const old = JSON.parse(before.out).version;
    const now = readJson(p);
    if (cmp(now.version, old) <= 0) { const [a, b, c] = parts(old); now.version = `${a}.${b}.${c + 1}`; writeJson(p, now); console.log(`Pack ${pack}: version raised to ${now.version}.`); }
  }
  must(sh("node", [join(here, "release.mjs"), "render"]), "release.mjs render");
}

/** The checks CI's tests job runs, read from .github/workflows/ci.yml so they stay in step. */
export function ciChecks(yml, smoke) {
  const out = [];
  for (const m of yml.matchAll(/node scripts\/ci-run\.mjs "([^"]+)" -- (.+)$/gm)) out.push({ name: m[1], cmd: m[2].trim() });
  if (smoke) for (const m of yml.matchAll(/^\s+(node scripts\/packs-smoke\.mjs.*)$/gm)) out.push({ name: "Packs smoke", cmd: m[1].trim() });
  out.push({ name: "Release check", cmd: "node scripts/release-check.mjs --base origin/main" });
  return out;
}

function runChecks() {
  const changed = [...new Set(changedFiles().concat(workingChanges()))];
  const smoke = changed.some((f) => /^packs\//.test(f) || /^scripts\/(studio-sync|packs-smoke)\.mjs$/.test(f));
  const failed = [];
  for (const c of ciChecks(readFileSync(".github/workflows/ci.yml", "utf8"), smoke)) {
    const r = sh("sh", ["-c", c.cmd]);
    console.log(`${r.ok ? "ok  " : "FAIL"} ${c.name}`);
    if (!r.ok) failed.push(`${c.name}: ${c.cmd}\n${(r.out + "\n" + r.err).trim().split("\n").slice(-15).join("\n")}`);
  }
  return failed;
}

const blockedText = (problems) => `the review and QA results don't cover this code change:\n- ${problems.join("\n- ")}`;

function commitAndPush(st, message, { force = false } = {}) {
  must(git("add", "-A"), "git add");
  if (git("diff", "--cached", "--quiet").ok === false) {
    const trailers = list(st.inputs.trailer);
    must(git("commit", "-q", "-m", message + (trailers.length ? `\n\n${trailers.join("\n")}` : "")), "git commit");
  }
  // The review gate, by code: finish is the only way a thread pushes, so a code change never leaves without a passing review and QA result.
  // (Git and Claude hooks that do the same are not loaded in every cloud thread; this check does not depend on them.)
  if (!st.passMainFor) {
    const problems = verdictProblems(process.cwd());
    if (problems.length) { saveState(st); die(`\n== NOT PUSHED: ${blockedText(problems)}\nRun the agents (the code is committed first), then run this command again.`); }
  }
  for (let i = 0, wait = 2; i < 5; i++, wait *= 2) {
    const r = git("push", ...(force ? ["--force-with-lease"] : []), "-u", "origin", st.branch);
    if (r.ok) return;
    if (i === 4) die(`git push failed:\n${r.err}`);
    sh("sleep", [String(wait)]);
  }
}

/** Tier from main's own tier.mjs, as CI runs it. */
function tierNow(labels) {
  const dir = mkdtempSync(join(tmpdir(), "finish-tier-"));
  try {
    must(sh("sh", ["-c", `git archive origin/main scripts | tar -x -C "${dir}"`]), "read main's scripts");
    const r = sh("node", [join(dir, "scripts/tier.mjs"), "--base", "origin/main"], { env: { ...process.env, LABELS: JSON.stringify(labels ?? []) } });
    const tier = /^Tier: (\S+)/m.exec(r.out)?.[1] ?? "owner";
    return { tier, reasons: r.out.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Fingerprint of the PR's own changes (scripts/own-fp.mjs: the same code CI runs, so the two always agree). */
const ownFingerprint = () => ownFp("origin/main");
const appFingerprint = () => must(sh("node", [join(here, "branch-gate.mjs"), "fingerprint", "--base", "origin/main"]), "branch-gate fingerprint");

function liveRequest(st, where) {
  const head = must(git("rev-parse", where === "main" ? "origin/main" : "HEAD"), "rev-parse");
  st.runs = (st.runs ?? 0) + 1;
  const id = `lc-${st.version.replace(/\./g, "-")}-${where}-${st.runs}`;
  const args = ["request", "--id", id, "--branch", where === "main" ? "main" : st.branch, "--commit", head, "--version", st.version, "--base", "origin/main", ...(where === "main" ? ["--where", "main"] : [])];
  const text = must(sh("node", [join(here, "live-check.mjs"), ...args]), "live-check.mjs request");
  const fp = /^fp: (\S+)/m.exec(text)?.[1] ?? "";
  return { id, at: Date.now(), fp, text };
}

function liveSteps(st, req) {
  const { owner } = ownerRepo();
  return [
    tool("mcp__github__pull_request_review_write", { owner, repo: SCRATCH.repo, pullNumber: SCRATCH.requests, method: "create", event: "COMMENT", body: req.text }),
    tool("mcp__claude-code-remote__send_later", { delay_minutes: 60, initiation: "own_followup", message: `Live check ${req.id}: read studio-scratch #${SCRATCH.results} yourself (newest review with LIVE-CHECK-RESULT and id ${req.id}, saved to ${LIVE_FILE}), collect the facts and run node scripts/finish.mjs next --facts .git/finish-facts.json --live-result ${LIVE_FILE} (it reports the timeout).` }),
  ];
}

// ---------- commands ----------

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    o[k] = k in o ? [...list(o[k]), v] : v;
  }
  return o;
}

// Every step that leaves the thread waiting re-arms a 3-minute check-in, so a missed event (a bot comment, a CI end) never leaves the
// thread idle; `finish next` re-arms it again until DONE. Steps that already carry a send_later (PR setup, live-check post) keep theirs.
export function rearm(d, pr, R = ownerRepo()) {
  if (!pr || !["wait", "do", "facts"].includes(d.type)) return d;
  if ((d.steps ?? []).some((s) => s.includes("send_later")) || (d.steps ?? []).some((s) => s.includes("unsubscribe_pr_activity"))) return d;
  const liveId = d.type === "wait" ? /live check (lc-[a-z0-9-]+)/.exec(d.text)?.[1] : null;
  // A pending live check: the thread reads the result on studio-scratch #72 itself, so a missed relay costs one check-in, never a stall.
  const read = liveId ? [
    tool("mcp__github__pull_request_read", { owner: R.owner, repo: SCRATCH.repo, pullNumber: SCRATCH.results, method: "get_reviews" }),
    `Save the body of the newest review that contains LIVE-CHECK-RESULT with "id: ${liveId}" to ${LIVE_FILE} (write the file empty if there is none).`,
  ] : [];
  const then = `node scripts/finish.mjs next --facts .git/finish-facts.json${liveId ? ` --live-result ${LIVE_FILE}` : ""}`;
  const step = tool("mcp__claude-code-remote__send_later", { delay_minutes: 3, initiation: "own_followup", message: `Check-in on PR #${pr}: collect the facts${liveId ? `, read the live-check result on studio-scratch #${SCRATCH.results} yourself` : ""} and run ${then}. Stop re-arming once it says DONE.` });
  // A pending live check also pokes the queue workflow, whose run relays the runner's result onto the PR (the runner's answer on
  // studio-scratch fires no event of its own).
  const poke = d.type === "wait" && /live check/.test(d.text) ? [tool("mcp__github__actions_run_trigger", { ...R, method: "run_workflow", workflow_id: "merge-queue.yml", ref: "main" })] : [];
  return { ...d, steps: [...(d.steps ?? []), ...read, ...poke, step], rearmed: true };
}

function printStep(d0) {
  const d = rearm(d0, loadState()?.pr, ownerRepo());
  const head = { do: "DO", wait: "WAIT", ask: "ASK THE OWNER", fix: "JUDGEMENT NEEDED", facts: "COLLECT FACTS", done: "DONE", local: "LOCAL" }[d.type];
  console.log(`\n== ${head}: ${d.text}`);
  if (d.ask) console.log(`\n${d.ask}\n`);
  (d.steps ?? []).forEach((s, i) => console.log(`${i + 1}. ${s}`));
  if (d.then) console.log(`THEN: ${d.then}`);
  if (d.rearmed) console.log("Make the send_later call above too: it is the check-in that wakes you if no event does.");
  if (d.type === "wait") console.log("End the turn now; do not poll.");
}

/** A start continues the previous run only while that run has no PR yet (a failed local check, fixed and started again). Once a PR
 * exists the run is over for start: a second release on the branch begins from empty state, never with the old PR, facts or OK. */
export function continuesRun(old, branch) {
  return !!old && old.branch === branch && !old.passMainFor && !old.pr;
}

function start(o) {
  const branch = must(git("rev-parse", "--abbrev-ref", "HEAD"), "git branch");
  if (branch === "main") die("Work on a branch, not main.");
  const inputs = {
    issues: list(o.issue).flatMap((s) => String(s).split(",")).filter(Boolean).map(Number),
    ideas: list(o.idea).flatMap((s) => String(s).split(",")).filter(Boolean).map(Number),
    title: o.title, summary: o.summary, notVerified: list(o.notVerified), appCreator: list(o.appCreator), appActions: list(o.appAction), adminActions: list(o.adminAction),
    scenarios: list(o.scenarios).flatMap((s) => String(s).split(",")).filter(Boolean), mainScenarios: list(o.mainScenarios).flatMap((s) => String(s).split(",")).filter(Boolean),
    noBranchCheck: typeof o.noBranchCheck === "string" ? o.noBranchCheck : undefined, minor: !!o.minor, what: list(o.what), test: list(o.test),
    prPrefix: o.prPrefix, prSuffix: o.prSuffix, trailer: list(o.trailer),
  };
  const old = loadState();
  const st = continuesRun(old, branch) ? { ...old, inputs } : { branch, inputs };
  fetchMain();
  const kind = kindOf([...new Set(changedFiles().concat(workingChanges()))]);
  const problems = checkInputs(inputs, kind, readJson("releases/scenarios.json").scenarios);
  if (problems.length) die(`Inputs (judgement, yours to give):\n- ${problems.join("\n- ")}`);
  st.kind = kind;
  if (old?.inputs && old.version && !st.version) st.version = old.version;
  must(git("add", "-A"), "git add");
  if (!git("diff", "--cached", "--quiet").ok) must(git("commit", "-q", "-m", `wip: ${inputs.title}`), "git commit");
  syncMain(st);
  writeRelease(st);
  console.log(`Release ${st.version} (${kind}). Running the CI checks locally:`);
  const failed = runChecks();
  if (failed.length) { saveState(st); die(`\n== JUDGEMENT NEEDED: checks failed. Fix them, then run start again with the same inputs.\n\n${failed.join("\n\n")}`); }
  commitAndPush(st, `${inputs.title} (${st.version})`);
  saveState(st);
  console.log(`Pushed ${branch}.`);
  next({});
}

function next(o) {
  const st = loadState();
  if (!st) die("No finish state: run node scripts/finish.mjs start first.");
  const { owner, repo } = ownerRepo();
  if (o.pr) { st.pr = Number(o.pr); st.prSetup = false; }
  const facts = typeof o.facts === "string" && existsSync(o.facts) ? readJson(o.facts) : null;
  const direct = typeof o.liveResult === "string" && existsSync(o.liveResult) ? readFileSync(o.liveResult, "utf8") : "";
  if (facts) st.lastFacts = { ...facts, at: new Date().toISOString() };
  for (let guard = 0; guard < 6; guard++) {
    fetchMain();
    const req = facts?.merged ? st.mainRequest : st.request;
    const result = liveResult(facts, req, direct);
    if (result !== null) req.result = result ? "pass" : "fail";
    const open = facts && !facts.merged && facts.state !== "closed";
    const t = open && !facts.draft ? tierNow(facts.labels) : null;
    if (t) st.tier = t.tier;
    const ctx = {
      st, facts, owner, repo, now: Date.now(), result, record: existsSync(`releases/${st.version}.json`) ? readJson(`releases/${st.version}.json`) : st.record,
      behind: open ? !git("merge-base", "--is-ancestor", "origin/main", "HEAD").ok : false,
      collision: open ? !versionFree(st.version, mainVersions()) && !st.passMainFor : false,
      verdictProblems: open && !st.passMainFor ? verdictProblems(process.cwd()) : [],
      tier: t?.tier, tierReasons: t?.reasons, ownFp: open ? ownFingerprint() : "", appFp: open && facts.draft ? appFingerprint() : "",
    };
    const d = decide(ctx);
    Object.assign(st, d.update ?? {});
    if (d.local === "record-pr") {
      if (!st.passMainFor) { writeRelease(st); commitAndPush(st, `chore(release): ${st.version} names PR #${st.pr}`); }
      saveState(st); printStep(d); return;
    }
    if (d.local === "sync") {
      if (!st.passMainFor) { syncMain(st); writeRelease(st); const failed = runChecks(); if (failed.length) { saveState(st); die(`\n== JUDGEMENT NEEDED: checks fail after merging main. Fix, then node scripts/finish.mjs push --message "fix: <what>".\n\n${failed.join("\n\n")}`); } }
      else syncMain(st);
      commitAndPush(st, `chore(release): ${st.version} up to date with main`);
      saveState(st);
      printStep({ type: "wait", text: `${d.text} Pushed; CI reruns and its result wakes you.` });
      return;
    }
    if (d.local === "branch-request" || d.local === "main-request") {
      const where = d.local === "main-request" ? "main" : "branch";
      const r = liveRequest(st, where);
      if (where === "main") st.mainRequest = r; else st.request = r;
      saveState(st);
      printStep({ type: "do", text: `${d.text} Post live check ${r.id} (${where}).`, steps: liveSteps(st, r), then: "when CI comments the result on the PR (it wakes you): collect the facts, then node scripts/finish.mjs next --facts .git/finish-facts.json" });
      return;
    }
    if (d.local === "pass-main") {
      const v = st.version;
      must(git("checkout", "-q", "-B", st.branch, "origin/main"), "restart the branch from main");
      must(sh("node", [join(here, "release.mjs"), "pass-main", v]), "release.mjs pass-main");
      const ps = { branch: st.branch, version: v, kind: "internal", passMainFor: v, record: readJson(`releases/${v}.json`), inputs: { ...st.inputs, title: `chore(release): ${v} passed the main live check`, summary: `${v} passed the main live check (${st.mainRequest.id})`, what: [`releases/${v}.json: status.main pending -> passed; CHANGELOG.md rendered.`], test: ["CI's release data check."], notVerified: ["Nothing beyond the main live check and CI."], issues: [] }, previous: { pr: st.pr, mainRequest: st.mainRequest } };
      commitAndPush(ps, ps.inputs.title, { force: true });
      saveState(ps);
      printStep({ type: "do", text: d.text, steps: [tool("mcp__claude-code-remote__unsubscribe_pr_activity", { owner, repo, pullNumber: st.pr })] });
      return next({});
    }
    saveState(st);
    printStep(d);
    return;
  }
}

function push(o) {
  const st = loadState();
  if (!st) die("No finish state: run node scripts/finish.mjs start first.");
  if (typeof o.message !== "string") die('usage: finish.mjs push --message "<commit message>"');
  must(git("add", "-A"), "git add");
  if (!git("diff", "--cached", "--quiet").ok) must(git("commit", "-q", "-m", o.message), "git commit");
  if (!st.passMainFor) {
    syncMain(st);
    st.kind = kindOf(changedFiles());
    writeRelease(st);
    const failed = runChecks();
    if (failed.length) { saveState(st); die(`\n== JUDGEMENT NEEDED: checks still fail.\n\n${failed.join("\n\n")}`); }
  }
  commitAndPush(st, `chore(release): ${st.version} record`);
  saveState(st);
  printStep({ type: "wait", text: "Pushed; CI reruns and its result wakes you. Then collect the facts and run next." });
}

function ownerOk() {
  const st = loadState();
  if (!st?.pr) die("No PR yet.");
  fetchMain();
  st.ownerOk = { fp: ownFingerprint(), at: new Date().toISOString() };
  saveState(st);
  console.log(`Owner OK recorded for PR #${st.pr}'s own changes (${st.ownerOk.fp.slice(0, 10)}). It stays valid while they stay the same: never ask again for main or version moves.`);
}

export function statusText(st, record) {
  if (!st) return "No finish state on this branch.";
  const f = st.lastFacts;
  const live = (r) => (r ? `${r.id}: ${r.result ?? "no result yet"}` : "not requested");
  const branchNeed = record ? (Array.isArray(record.checks.branch) ? record.checks.branch.join(", ") || "none" : `none (${record.checks.branch.none})`) : "?";
  return [
    `Release ${st.version} (${st.kind})${st.passMainFor ? `, pass-main PR for ${st.passMainFor}` : ""}`,
    `PR: ${st.pr ? `#${st.pr}` : "not opened"}${f ? `, ${f.merged ? "merged" : f.state}${f.draft ? ", draft" : ""} (facts read ${f.at})` : ", no facts read yet"}`,
    `Tier: ${st.tier ?? "not computed yet"}${st.ownerOk ? `; owner OK recorded ${st.ownerOk.at}` : ""}`,
    `Branch live check (${branchNeed}): ${live(st.request)}`,
    `Main live check (${record?.checks.main.join(", ") || "none"}): ${record?.status.main ?? "?"}${st.mainRequest ? `; ${live(st.mainRequest)}` : ""}`,
    `What wasn't verified: ${(record?.notVerified ?? []).join(" / ") || "?"}`,
  ].join("\n");
}

function status() {
  const st = loadState();
  const v = st?.version;
  const rec = v && existsSync(`releases/${v}.json`) ? readJson(`releases/${v}.json`) : st?.record;
  console.log(statusText(st, rec));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = parseArgs(rest);
  process.chdir(join(here, ".."));
  if (cmd === "start") start(o);
  else if (cmd === "next") next(o);
  else if (cmd === "push") push(o);
  else if (cmd === "owner-ok") ownerOk();
  else if (cmd === "status") status();
  else die("usage: finish.mjs start|next|push|owner-ok|status (see the top of this file)", 2);
}
