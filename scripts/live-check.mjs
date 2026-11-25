#!/usr/bin/env node
// The live-check runner's code (GOVERNANCE section 7). Plain code, no model. Claude only acts out each scenario
// prompt and makes the platform actions (subscribe, post the review this script printed, open a fresh thread).
//   node scripts/live-check.mjs request --branch B --commit SHA (--scenarios a,b | --version X) [--where branch|main] [--id ID] [--fp F] [--base origin/main]
//        the fixed-format request to post as a review (event COMMENT) on studio-scratch PR #71
//   node scripts/live-check.mjs prepare --request FILE [--app DIR] [--studio DIR] [--dry-run]
//        studio-scratch side: parse the request, take the one-run lock, reset the app, sync it to the commit, list the scenarios
//   node scripts/live-check.mjs judge --request FILE --outputs DIR [--facts FILE] [--app DIR] [--studio DIR]
//        evaluate every scenario's pass rules; prints verdicts as JSON. Output text is DIR/<scenario id>.txt; `facts` is raw
//        GitHub state, { "<scenario id>": { "pr": "merged|open|closed|none", "checks": { "<name>": "success|failure" }, "files": { "<path>": "text or null" } } }
//   node scripts/live-check.mjs result --request FILE (--verdicts FILE | --failed REASON) [--studio DIR]
//        the fixed-format result to post as a review on studio-scratch PR #72; frees the one-run lock
//   node scripts/live-check.mjs read-result --id ID --file FILE
//        build-thread side: exit 0 if the result for this id passed, 1 if it failed, 2 if it is not this run's result
// One run at a time: `prepare` refuses while another run holds the lock (younger than TIMEOUT_MINUTES).
// A run that never starts or times out is reported as failed by `result --failed`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint } from "./branch-gate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const TIMEOUT_MINUTES = 60;
export const REQUEST_MARK = "LIVE-CHECK-REQUEST";
export const RESULT_MARK = "LIVE-CHECK-RESULT";
const ID = /^lc-[a-z0-9-]+$/;
const SHA = /^[0-9a-f]{7,40}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BRANCH = /^[A-Za-z0-9._\/-]+$/;

// ---------- catalog ----------

export const loadCatalog = (studio) => JSON.parse(readFileSync(join(studio, "releases/scenarios.json"), "utf8")).scenarios;

// ---------- request ----------

export function makeRequest({ id, branch, commit, scenarios, where = "branch", fp }, catalog) {
  const p = [];
  if (!ID.test(id ?? "")) p.push(`id must look like lc-<words> (got "${id}")`);
  if (!BRANCH.test(branch ?? "")) p.push("branch is missing or has odd characters");
  if (!SHA.test(commit ?? "")) p.push("commit must be a hex commit id (7-40 characters)");
  if (!["branch", "main"].includes(where)) p.push("where must be branch or main");
  if (fp !== undefined && !/^[0-9a-f]{8,64}$/.test(fp)) p.push("fp must be a hex fingerprint (node scripts/branch-gate.mjs fingerprint)");
  if (where === "main" && branch !== "main") p.push("a main run uses branch main");
  if (!Array.isArray(scenarios) || !scenarios.length) p.push("name at least one scenario");
  // No catalog: only the shape is checked (the runner's checkout may not hold the commit's catalog yet).
  for (const s of catalog ? scenarios ?? [] : []) {
    const e = catalog.find((c) => c.id === s);
    if (!e) p.push(`unknown scenario "${s}"`);
    else if (e.where !== where) p.push(`scenario "${s}" is a ${e.where} scenario, this run is ${where}`);
  }
  if (new Set(scenarios).size !== (scenarios ?? []).length) p.push("a scenario is listed twice");
  if (p.length) return { ok: false, problems: p };
  const text = [REQUEST_MARK, `id: ${id}`, `branch: ${branch}`, `commit: ${commit}`, `where: ${where}`, `scenarios: ${scenarios.join(", ")}`, ...(fp ? [`fp: ${fp}`] : [])].join("\n");
  return { ok: true, text };
}

const field = (text, name) => new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(text)?.[1];

/** Parse and validate a request message (a review body). A review may wrap it in other text. */
export function parseRequest(body, catalog) {
  const at = body.indexOf(REQUEST_MARK);
  if (at < 0 || !new RegExp(`^${REQUEST_MARK}[ \\t]*$`, "m").test(body)) return { ok: false, problems: [`not a live-check request (no ${REQUEST_MARK} line)`] };
  const t = body.slice(at);
  const r = { id: field(t, "id"), branch: field(t, "branch"), commit: field(t, "commit"), where: field(t, "where") ?? "branch", scenarios: (field(t, "scenarios") ?? "").split(/\s*,\s*/).filter(Boolean) };
  if (field(t, "fp")) r.fp = field(t, "fp");
  const made = makeRequest(r, catalog);
  return made.ok ? { ok: true, request: r } : made;
}

// ---------- judging ----------

/** One rule against what code can read: the result text, raw GitHub facts, files. Missing evidence is a fail, never a pass. */
export function judgeRule(rule, { output = null, facts = {}, readFile = () => null }) {
  const fail = (why) => ({ ok: false, why });
  switch (rule.type) {
    case "output":
      if (output == null) return fail("no output was recorded");
      return new RegExp(rule.matches).test(output) ? { ok: true } : fail(`output does not match /${rule.matches}/`);
    case "pr-state":
      if (!facts.pr) return fail("no PR state was recorded");
      return facts.pr === rule.state ? { ok: true } : fail(`PR is ${facts.pr}, expected ${rule.state}`);
    case "check": {
      const c = facts.checks?.[rule.name];
      if (!c) return fail(`no result recorded for check "${rule.name}"`);
      return c === rule.conclusion ? { ok: true } : fail(`check "${rule.name}" is ${c}, expected ${rule.conclusion}`);
    }
    case "file": {
      const text = rule.path in (facts.files ?? {}) ? facts.files[rule.path] : readFile(rule.path);
      if (text === undefined) return fail(`no evidence for ${rule.path}`);
      if (typeof rule.exists === "boolean") return (text !== null) === rule.exists ? { ok: true } : fail(`${rule.path} ${text === null ? "is absent" : "exists"}, expected ${rule.exists ? "present" : "absent"}`);
      if (text === null) return fail(`${rule.path} is absent`);
      return new RegExp(rule.contains).test(text) ? { ok: true } : fail(`${rule.path} does not contain /${rule.contains}/`);
    }
    default: return fail(`unknown rule type "${rule.type}"`);
  }
}

export function judge(request, catalog, { outputs = {}, facts = {}, readFile = () => null }) {
  const verdicts = {};
  for (const id of request.scenarios) {
    const s = catalog.find((c) => c.id === id);
    const results = s.pass.map((rule) => judgeRule(rule, { output: outputs[id] ?? null, facts: facts[id] ?? {}, readFile }));
    const bad = results.find((r) => !r.ok);
    verdicts[id] = bad ? { pass: false, reason: bad.why } : { pass: true };
  }
  return verdicts;
}

// ---------- result ----------

export function makeResult(request, { verdicts, failed }) {
  const lines = [RESULT_MARK, `id: ${request.id}`, `commit: ${request.commit}`, ...(request.fp ? [`fp: ${request.fp}`] : [])];
  if (failed) {
    lines.push("verdict: fail", `reason: ${failed.replace(/\s+/g, " ").trim()}`);
    for (const s of request.scenarios) lines.push(`scenario ${s}: FAIL not run`);
  } else {
    const all = request.scenarios.every((s) => verdicts[s]?.pass);
    lines.push(`verdict: ${all ? "pass" : "fail"}`);
    for (const s of request.scenarios) lines.push(`scenario ${s}: ${verdicts[s]?.pass ? "PASS" : `FAIL ${verdicts[s]?.reason ?? "no verdict"}`}`);
  }
  return lines.join("\n");
}

/** Build-thread side: is this the result for my request, and did it pass? */
export function readResult(body, id) {
  const at = body.indexOf(RESULT_MARK);
  if (at < 0) return { mine: false };
  const t = body.slice(at);
  if (field(t, "id") !== id) return { mine: false };
  return { mine: true, pass: field(t, "verdict") === "pass", text: t };
}

// ---------- one-run lock ----------

const lockPath = (studio) => join(studio, ".git", "live-check-run.json");

export function takeLock(studio, id, now = Date.now()) {
  const p = lockPath(studio);
  if (existsSync(p)) {
    let held;
    try { held = JSON.parse(readFileSync(p, "utf8")); } catch { held = null; }
    if (held && held.id !== id && now - held.at < TIMEOUT_MINUTES * 60000)
      return { ok: false, why: `another live check (${held.id}) is running; it times out ${TIMEOUT_MINUTES} minutes after it started. Report this request as failed with: runner busy` };
  }
  writeFileSync(p, JSON.stringify({ id, at: now }));
  return { ok: true };
}
export const freeLock = (studio) => rmSync(lockPath(studio), { force: true });

// ---------- git steps (studio-scratch side) ----------

const git = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });

/** Put the app-studio checkout on the requested commit, and refuse a stale request (the branch moved on). */
export function checkoutStudio(studio, request) {
  const f = git(studio, "fetch", "origin", request.branch);
  if (f.status !== 0) return { ok: false, why: `cannot fetch branch ${request.branch}: ${f.stderr.trim()}` };
  const tip = git(studio, "rev-parse", "FETCH_HEAD").stdout.trim();
  if (!tip.startsWith(request.commit) && !request.commit.startsWith(tip.slice(0, request.commit.length)))
    return { ok: false, why: `stale request: ${request.branch} is now at ${tip.slice(0, 9)}, not ${request.commit.slice(0, 9)}` };
  const c = git(studio, "checkout", "--detach", tip);
  return c.status === 0 ? { ok: true, tip } : { ok: false, why: `checkout failed: ${c.stderr.trim()}` };
}

/** Reset the disposable studio-scratch app to its default branch. Refuses any other repo. */
export function resetApp(app) {
  const url = git(app, "remote", "get-url", "origin").stdout.trim();
  if (!/\/studio-scratch(\.git)?$/.test(url)) return { ok: false, why: `refusing to reset ${app}: its origin is not studio-scratch` };
  for (const a of [["fetch", "origin"], ["checkout", "-f", "main"], ["reset", "--hard", "origin/main"], ["clean", "-fd"]]) {
    const r = git(app, ...a);
    if (r.status !== 0) return { ok: false, why: `git ${a[0]} failed: ${r.stderr.trim()}` };
  }
  return { ok: true };
}

// ---------- command line ----------

function main(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) { console.error(`unexpected argument ${rest[i]}`); process.exit(2); }
    const k = rest[i].slice(2);
    opts[k] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
  }
  const studio = resolve(opts.studio ?? process.env.STUDIO_DIR ?? join(here, ".."));
  const die = (m, code = 1) => { console.error(m); process.exit(code); };
  const need = (k) => (typeof opts[k] === "string" ? opts[k] : die(`usage: live-check.mjs ${cmd} --${k} <value> (see the header of this file)`, 2));
  const readBody = (f) => readFileSync(f === "-" ? 0 : f, "utf8");
  const catalog = () => loadCatalog(studio);
  const request = () => {
    const r = parseRequest(readBody(need("request")), catalog());
    return r.ok ? r.request : die(`bad request:\n- ${r.problems.join("\n- ")}`);
  };

  switch (cmd) {
    case "request": {
      let scenarios = (opts.scenarios ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const where = opts.where ?? "branch";
      if (!scenarios.length && opts.version) {
        const rec = JSON.parse(readFileSync(join(studio, "releases", `${opts.version}.json`), "utf8"));
        const c = rec.checks?.[where];
        scenarios = Array.isArray(c) ? c : [];
        if (!scenarios.length) die(`release ${opts.version} names no ${where} scenarios: no live check to request`);
      }
      const id = opts.id ?? `lc-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
      // A branch check is tied to a fingerprint of the app-facing files (CI's branch gate, GOVERNANCE section 9).
      let fp = typeof opts.fp === "string" ? opts.fp : undefined;
      if (fp === undefined && where === "branch") {
        try { fp = fingerprint(opts.base ?? "origin/main") || undefined; } catch (e) { console.error(`warning: no fingerprint in the request (${e.message}); CI's branch gate will not accept its result`); }
      }
      const r = makeRequest({ id, branch: need("branch"), commit: need("commit"), scenarios, where, fp }, catalog());
      if (!r.ok) die(`cannot make the request:\n- ${r.problems.join("\n- ")}`);
      console.log(r.text);
      return;
    }
    case "prepare": {
      // The request's scenarios may exist only in the commit under test, so the checkout moves first and the catalog is read after.
      const shape = parseRequest(readBody(need("request")), null);
      if (!shape.ok) die(`bad request:\n- ${shape.problems.join("\n- ")}`);
      const lock = takeLock(studio, shape.request.id);
      if (!lock.ok) die(lock.why);
      const fail = (m) => { freeLock(studio); die(m); };
      if (!opts["dry-run"]) {
        const co = checkoutStudio(studio, shape.request);
        if (!co.ok) fail(co.why);
      }
      const full = parseRequest(readBody(need("request")), catalog());
      if (!full.ok) fail(`bad request:\n- ${full.problems.join("\n- ")}`);
      const req = full.request;
      if (!opts["dry-run"]) {
        if (opts.app) {
          const app = resolve(opts.app);
          const rs = resetApp(app);
          if (!rs.ok) fail(rs.why);
          const sync = spawnSync("node", [join(studio, "scripts/studio-sync.mjs"), "pull", "--app", app, "--studio", studio, "--live-check"], { encoding: "utf8" });
          process.stdout.write(sync.stdout ?? "");
          if (sync.status !== 0) fail(`sync to ${req.commit.slice(0, 9)} failed:\n${sync.stderr}`);
        }
      }
      console.log(`Run ${req.id}: ${req.where} ${req.branch} @ ${req.commit}. Timeout ${TIMEOUT_MINUTES} minutes.\n`);
      for (const id of req.scenarios) {
        const s = catalog().find((c) => c.id === id);
        console.log(`### ${id}${s.freshThread ? "  (open a FRESH thread for this one)" : ""}\n${s.prompt}\n`);
      }
      console.log("When done, save each scenario's final text to <dir>/<scenario id>.txt, then run `judge`.");
      return;
    }
    case "judge": {
      const req = request();
      const outputs = {};
      for (const id of req.scenarios) {
        const f = join(need("outputs"), `${id}.txt`);
        if (existsSync(f)) outputs[id] = readFileSync(f, "utf8");
      }
      const facts = typeof opts.facts === "string" ? JSON.parse(readFileSync(opts.facts, "utf8")) : {};
      const app = typeof opts.app === "string" ? resolve(opts.app) : null;
      const readFile = (p) => {
        if (!app) return undefined;
        try { return readFileSync(join(app, p), "utf8"); } catch { return existsSync(join(app, p)) ? undefined : null; }
      };
      console.log(JSON.stringify(judge(req, catalog(), { outputs, facts, readFile }), null, 2));
      return;
    }
    case "result": {
      const req = request();
      const body = typeof opts.failed === "string"
        ? makeResult(req, { failed: opts.failed })
        : makeResult(req, { verdicts: JSON.parse(readFileSync(need("verdicts"), "utf8")) });
      freeLock(studio);
      console.log(body);
      return;
    }
    case "read-result": {
      const r = readResult(readBody(need("file")), need("id"));
      if (!r.mine) { console.error("not the result of this run"); process.exit(2); }
      console.log(r.text);
      process.exit(r.pass ? 0 : 1);
    }
    default:
      die("usage: live-check.mjs request|prepare|judge|result|read-result (see the header of this file)", 2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
