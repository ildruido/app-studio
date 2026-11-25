#!/usr/bin/env node
// The live-check runner's code (GOVERNANCE section 7). Plain code, no model. Claude only acts out each scenario
// prompt and makes the platform actions (subscribe, post the review this script printed).
//   node scripts/live-check.mjs request --branch B --commit SHA (--scenarios a,b | --version X) [--where branch|main] [--id ID] [--fp F] [--base origin/main]
//        the fixed-format request to post as a review (event COMMENT) on studio-scratch PR #71
//   node scripts/live-check.mjs prepare --request FILE [--app DIR] [--studio DIR] [--outputs DIR] [--dry-run]
//        studio-scratch side: parse the request, take the one-run lock, reset the app, sync it to the commit, RUN every `script` scenario
//        itself (its `steps`, captured like `exec` into --outputs), then list only the `thread` scenarios' prompts for the model
//   node scripts/live-check.mjs judge --request FILE --outputs DIR [--facts FILE] [--app DIR] [--studio DIR]
//        evaluate every scenario's pass rules; prints verdicts as JSON. Output text is DIR/<scenario id>.txt; `facts` is raw
//        GitHub state, { "<scenario id>": { "pr": "merged|open|closed|none", "checks": { "<name>": "success|failure" }, "files": { "<path>": "text or null" } } }
//   node scripts/live-check.mjs facts --request FILE --repo OWNER/NAME [--pr N] [--out FILE]
//        reads the PR state, check results and files the scenarios' `pr-state`, `check` and `file` rules name, through the GitHub API
//        (token in GH_TOKEN or GITHUB_TOKEN, read-only is enough), and writes the `facts` file for `judge`. Without a token it exits 3: then
//        paste the raw API responses into the file by hand. --pr defaults to the newest PR of the repo.
//   node scripts/live-check.mjs exec --outputs DIR --scenario ID --step NAME -- <command...>
//        runs one scripted command and saves what it printed (command, exit code, stdout, stderr) to DIR/<scenario>/<step>.json, written by
//        this code, not by the model; `exec` and `exec-absent` pass rules read those files. Exits 0 once captured.
//   node scripts/live-check.mjs result --request FILE (--verdicts FILE | --failed REASON) [--studio DIR]
//        the fixed-format result to post as a review on studio-scratch PR #72; frees the one-run lock
//   node scripts/live-check.mjs next --request FILE --outputs DIR --app DIR [--repo OWNER/NAME] [--posted]
//        runner side: reads the run's state (lock, saved outputs, facts, verdicts, result) and prints the ONE next action until DONE.
//        The runner does exactly what it prints and runs `next` again; --posted records that the result was posted on #72.
//   node scripts/live-check.mjs read-result --id ID --file FILE
//        build-thread side: exit 0 if the result for this id passed, 1 if it failed, 2 if it is not this run's result
// One run at a time: `prepare` refuses while another run holds the lock (younger than TIMEOUT_MINUTES).
// A run that never starts or times out is reported as failed by `result --failed`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
export function judgeRule(rule, { output = null, facts = {}, readFile = () => null, execs = {} }) {
  const fail = (why) => ({ ok: false, why });
  switch (rule.type) {
    case "exec":
    case "exec-absent": {
      const e = execs[rule.step];
      if (!e) return fail(`no captured run of step "${rule.step}" (run it through live-check.mjs exec)`);
      const text = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      if (rule.type === "exec-absent") return new RegExp(rule.matches).test(text) ? fail(`step "${rule.step}" printed /${rule.matches}/, which must be absent`) : { ok: true };
      const want = rule.exit ?? 0;
      if (want === "nonzero" ? e.exit === 0 : want !== "any" && e.exit !== want) return fail(`step "${rule.step}" exited ${e.exit}, expected ${want}`);
      return rule.matches === undefined || new RegExp(rule.matches).test(text) ? { ok: true } : fail(`step "${rule.step}" output does not match /${rule.matches}/`);
    }
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

/** The thread's own `RESULT <id>: PASS|FAIL` line, if it wrote one: a cross-check, never evidence. */
const claimed = (text, id) => new RegExp(`^RESULT ${id}: (PASS|FAIL)`, "m").exec(text ?? "")?.[1];

export function judge(request, catalog, { outputs = {}, facts = {}, readFile = () => null, execs = {} }) {
  const verdicts = {};
  for (const id of request.scenarios) {
    const s = catalog.find((c) => c.id === id);
    const results = s.pass.map((rule) => judgeRule(rule, { output: outputs[id] ?? null, facts: facts[id] ?? {}, readFile, execs: execs[id] ?? {} }));
    const bad = results.find((r) => !r.ok);
    const said = claimed(outputs[id], id);
    if (said && said !== (bad ? "FAIL" : "PASS")) verdicts[id] = { pass: false, reason: `disagreement: code says ${bad ? "FAIL" : "PASS"}${bad ? ` (${bad.why})` : ""}, the thread says ${said}` };
    else verdicts[id] = bad ? { pass: false, reason: bad.why } : { pass: true };
  }
  return verdicts;
}

// ---------- facts fetched by code ----------

const FACT_TYPES = new Set(["pr-state", "check", "file"]);
const GH = "https://api.github.com";

/** A PR as the API returns it -> "merged" | "open" | "closed". */
export const prState = (pr) => (pr?.merged_at || pr?.merged ? "merged" : pr?.state === "open" ? "open" : pr?.state === "closed" ? "closed" : "none");

/** The check-runs response -> { name: conclusion }; a run still going has no conclusion yet (recorded as its status); the latest run of a name wins. */
export function checkResults(resp) {
  const latest = {};
  for (const r of resp?.check_runs ?? []) {
    if (!r.name || (latest[r.name] && Date.parse(latest[r.name].started_at ?? 0) > Date.parse(r.started_at ?? 0))) continue;
    latest[r.name] = r;
  }
  return Object.fromEntries(Object.entries(latest).map(([n, r]) => [n, r.conclusion ?? r.status ?? "unknown"]));
}

/** A contents response -> the file's text; null when it does not exist. */
export const fileText = (resp) => (resp && resp.type === "file" && typeof resp.content === "string" ? Buffer.from(resp.content, resp.encoding === "base64" ? "base64" : "utf8").toString("utf8") : null);

/**
 * The facts file for `judge`, read through the API. Only scenarios that have pr-state, check or file rules get an entry.
 * `get(path)` returns the parsed JSON, or null on a 404; anything else it throws, so a failed read is never taken for "absent".
 */
export async function fetchFacts(request, cat, { repo, pr, get }) {
  const wanted = request.scenarios.map((id) => [id, (cat.find((c) => c.id === id)?.pass ?? []).filter((r) => FACT_TYPES.has(r.type))]).filter(([, rules]) => rules.length);
  if (!wanted.length) return {};
  let pull = null;
  if (pr) pull = await get(`/repos/${repo}/pulls/${pr}`);
  else pull = ((await get(`/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=1`)) ?? [])[0] ?? null;
  const ref = pull?.state === "open" ? pull.head.sha : (pull?.base?.ref ?? "HEAD");
  const sha = pull?.merged_at ? pull.merge_commit_sha : pull?.head?.sha;
  const checks = sha ? checkResults(await get(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`)) : {};
  const facts = {};
  for (const [id, rules] of wanted) {
    const f = {};
    if (rules.some((r) => r.type === "pr-state")) f.pr = prState(pull);
    if (rules.some((r) => r.type === "check")) f.checks = checks;
    for (const r of rules.filter((x) => x.type === "file")) {
      f.files ??= {};
      f.files[r.path] = fileText(await get(`/repos/${repo}/contents/${r.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`));
    }
    facts[id] = f;
  }
  return facts;
}

// ---------- captured commands ----------

const STEP = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Run one command and save what it printed. The model picks the step; code records the output. */
export function captureExec(dir, scenario, step, argv, { cwd, runner = spawnSync } = {}) {
  if (!SLUG.test(scenario ?? "")) return { ok: false, why: "--scenario must be a scenario id" };
  if (!STEP.test(step ?? "")) return { ok: false, why: "--step must be lowercase words joined by dashes" };
  if (!argv.length) return { ok: false, why: "give the command after --" };
  const r = runner(argv[0], argv.slice(1), { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...(cwd ? { cwd } : {}) });
  const rec = { command: argv.join(" "), exit: r.status ?? (r.error ? 127 : 1), stdout: r.stdout ?? "", stderr: `${r.stderr ?? ""}${r.error ? String(r.error.message) : ""}`, at: new Date().toISOString() };
  mkdirSync(join(dir, scenario), { recursive: true });
  writeFileSync(join(dir, scenario, `${step}.json`), JSON.stringify(rec, null, 2));
  return { ok: true, rec };
}

export function loadExecs(dir, scenario) {
  const d = join(dir, scenario);
  const out = {};
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".json")) continue;
    try { out[f.slice(0, -5)] = JSON.parse(readFileSync(join(d, f), "utf8")); } catch { /* an unreadable capture is no evidence */ }
  }
  return out;
}

// ---------- script scenarios (run by code, no model) ----------

export const isScript = (s) => s?.kind === "script";
const fill = (text, vars) => text.replace(/\{(studio|app|outputs)\}/g, (_, k) => vars[k]);

/**
 * Run a script scenario's steps in order and capture each one (exit code, stdout, stderr) exactly like `exec`.
 * A step is { step, run, reset? }: `run` is a shell command with {studio}, {app} and {outputs} filled in, run from the app;
 * `reset` puts the disposable app back on its main first. A step that cannot even start is still captured (exit 127), so
 * the judge fails on it rather than on missing evidence.
 */
export function runScriptScenario(s, { app, studio, outputs, reset = resetApp, runner = spawnSync }) {
  const vars = { studio, app, outputs };
  for (const st of s.steps ?? []) {
    if (st.reset) {
      const r = reset(app);
      if (!r.ok) return { ok: false, why: `step "${st.step}": ${r.why}` };
    }
    const cap = captureExec(outputs, s.id, st.step, ["sh", "-c", fill(st.run, vars)], { cwd: app, runner });
    if (!cap.ok) return { ok: false, why: `step "${st.step}": ${cap.why}` };
  }
  return { ok: true };
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
  // `git clean -fd` keeps ignored files, so old review/QA results in `.claude/state` would hide a missing one in the next check.
  try { rmSync(join(app, ".claude", "state"), { recursive: true, force: true }); } catch (e) { return { ok: false, why: `could not clear .claude/state: ${e.message}` }; }
  return { ok: true };
}


// ---------- next: the runner's one next action ----------

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

/** Has `prepare` run for this request? It holds the one-run lock until `result` frees it, and by then judging has left its files. */
export const runStarted = (request, outputs, lock) => lock?.id === request.id || existsSync(join(outputs, "verdicts.json")) || existsSync(join(outputs, "result.txt"));

/**
 * What the runner does next, from the lock and the files of the run (nothing is remembered anywhere else):
 * <scenario>.txt, facts.json, verdicts.json, result.txt, .posted, and `.run` (the id of the run the directory belongs to).
 * Returns { done }, { error } or { action, text }. `lock` is the current one-run lock ({ id, at } or null).
 */
export function nextStep(request, catalog, { outputs, app, repo, studio, requestFile, lock = null, now = Date.now() }) {
  const live = `node ${q(join(studio, "scripts/live-check.mjs"))}`;
  const file = (n) => join(outputs, n);
  const owner = readJson(file(".run"));
  if (owner && owner.id !== request.id) return { error: `${outputs} holds the files of run ${owner.id}, not ${request.id}: use a new, empty --outputs directory` };
  if (!runStarted(request, outputs, lock)) {
    if (lock && lock.id !== request.id && now - lock.at < TIMEOUT_MINUTES * 60000)
      return { action: "post", text: `Another live check (${lock.id}) holds the runner, so do not run \`prepare\`. Post this text as a review (event COMMENT) on pull request 72 of studio-scratch, then stop. Do not run \`result\` (it would free the other run's lock):\n\n${makeResult(request, { failed: "runner busy" })}` };
    return { action: "run", text: `Run:\n${live} prepare --request ${q(requestFile)} --app ${q(app)} --outputs ${q(outputs)}\nIf it fails, post the result of \`${live} result --request ${q(requestFile)} --failed "<its error, one line>"\` on #72 and stop. Then run \`next\` again.` };
  }
  const cat = (id) => catalog.find((c) => c.id === id);
  const todo = request.scenarios.find((id) => !isScript(cat(id)) && !existsSync(file(`${id}.txt`)));
  if (todo) {
    const left = request.scenarios.filter((id) => !isScript(cat(id)) && !existsSync(file(`${id}.txt`))).length;
    return { action: "scenario", text: `Act out scenario ${todo} (${left} thread scenario${left > 1 ? "s" : ""} left). Run every scripted command through \`${live} exec --outputs ${q(outputs)} --scenario ${todo} --step <name> -- <command...>\`. Save the final text to ${file(`${todo}.txt`)} (end it with \`RESULT ${todo}: PASS|FAIL\`), then run \`next\` again.\n\n### ${todo}\n${cat(todo).prompt}` };
  }
  const needsFacts = request.scenarios.some((id) => (cat(id)?.pass ?? []).some((r) => FACT_TYPES.has(r.type)));
  if (needsFacts && !existsSync(file("facts.json")))
    return { action: "run", text: `Run:\n${live} facts --request ${q(requestFile)} --repo ${q(repo ?? "<owner/name of this app>")} --out ${q(file("facts.json"))}\nIf it exits 3 (no GitHub token), read the raw GitHub state the rules name into ${file("facts.json")} yourself (the raw API response, never a summary). Then run \`next\` again.` };
  const verdicts = readJson(file("verdicts.json"));
  if (!verdicts || request.scenarios.some((id) => !verdicts[id]))
    return { action: "run", text: `Run:\n${live} judge --request ${q(requestFile)} --outputs ${q(outputs)} --app ${q(app)}${needsFacts ? ` --facts ${q(file("facts.json"))}` : ""} > ${q(file("verdicts.json"))}\nThen run \`next\` again.` };
  let result = ""; try { result = readFileSync(file("result.txt"), "utf8"); } catch { /* not made yet */ }
  if (!result.includes(RESULT_MARK))
    return { action: "run", text: `Run:\n${live} result --request ${q(requestFile)} --verdicts ${q(file("verdicts.json"))} > ${q(file("result.txt"))}\nThen run \`next\` again.` };
  if (!existsSync(file(".posted")))
    return { action: "post", text: `Post this text as a review (event COMMENT) on pull request 72 of studio-scratch. Then run \`${live} next --request ${q(requestFile)} --outputs ${q(outputs)} --app ${q(app)} --posted\`.\n\n${result.trim()}` };
  return { done: true };
}

// ---------- command line ----------

function main(argv) {
  const [cmd, ...all] = argv;
  const dd = all.indexOf("--");
  const rest = cmd === "exec" && dd >= 0 ? all.slice(0, dd) : all;
  const wrapped = cmd === "exec" && dd >= 0 ? all.slice(dd + 1) : [];
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
      const scripts = req.scenarios.map((id) => catalog().find((c) => c.id === id)).filter(isScript);
      if (scripts.length && !opts["dry-run"]) {
        if (typeof opts.outputs !== "string") fail(`usage: live-check.mjs prepare --outputs <dir> (the script scenarios ${scripts.map((x) => x.id).join(", ")} run in code and are captured there)`);
        if (typeof opts.app !== "string") fail("usage: live-check.mjs prepare --app <dir> (the script scenarios run in the app)");
        for (const sc of scripts) {
          const r = runScriptScenario(sc, { app: resolve(opts.app), studio, outputs: resolve(opts.outputs) });
          if (!r.ok) fail(`script scenario ${sc.id} could not run: ${r.why}`);
        }
      }
      console.log(`Run ${req.id}: ${req.where} ${req.branch} @ ${req.commit}. Timeout ${TIMEOUT_MINUTES} minutes.\n`);
      if (scripts.length) console.log(`Code already ran ${scripts.map((x) => x.id).join(", ")}${opts["dry-run"] ? " (not in a dry run)" : ""}: nothing for you to do for ${scripts.length > 1 ? "them" : "it"}; \`judge\` reads what it captured.\n`);
      const threads = req.scenarios.filter((id) => !isScript(catalog().find((c) => c.id === id)));
      for (const id of threads) {
        const s = catalog().find((c) => c.id === id);
        console.log(`### ${id}\n${s.prompt}\n`);
      }
      console.log(threads.length
        ? "Run every scripted command in these prompts through `live-check.mjs exec` (see each prompt), save each scenario's final text to <dir>/<scenario id>.txt, then run `judge`."
        : "Every scenario ran in code: run `judge` now (same --outputs), then `result`.");
      return;
    }
    case "exec": {
      const r = captureExec(need("outputs"), need("scenario"), need("step"), wrapped);
      if (!r.ok) die(r.why, 2);
      process.stdout.write(r.rec.stdout);
      process.stderr.write(r.rec.stderr);
      console.log(`captured ${opts.scenario}/${opts.step}: exit ${r.rec.exit}`);
      return;
    }
    case "judge": {
      const req = request();
      const outputs = {};
      const execs = {};
      for (const id of req.scenarios) {
        execs[id] = loadExecs(need("outputs"), id);
        const f = join(need("outputs"), `${id}.txt`);
        if (existsSync(f)) outputs[id] = readFileSync(f, "utf8");
      }
      const facts = typeof opts.facts === "string" ? JSON.parse(readFileSync(opts.facts, "utf8")) : {};
      const app = typeof opts.app === "string" ? resolve(opts.app) : null;
      const readFile = (p) => {
        if (!app) return undefined;
        const full = isAbsolute(p) ? p : join(app, p); // an absolute path is read as it is (e.g. /tmp/studio-hooks.log)
        try { return readFileSync(full, "utf8"); } catch { return existsSync(full) ? undefined : null; }
      };
      console.log(JSON.stringify(judge(req, catalog(), { outputs, facts, readFile, execs }), null, 2));
      return;
    }
    case "facts": {
      const req = request();
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (!token) die("no GitHub token (GH_TOKEN or GITHUB_TOKEN): paste the raw API responses into the facts file by hand (docs/LIVE-CHECK-RUNNER.md)", 3);
      const get = async (path) => {
        const res = await fetch(`${GH}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
        return res.json();
      };
      fetchFacts(req, catalog(), { repo: need("repo"), pr: typeof opts.pr === "string" ? opts.pr : undefined, get }).then(
        (facts) => {
          const text = JSON.stringify(facts, null, 2);
          if (typeof opts.out === "string") { writeFileSync(opts.out, text); console.log(`wrote ${opts.out}`); } else console.log(text);
        },
        (e) => die(`could not read the facts: ${e.message}`, 3),
      );
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
    case "next": {
      const requestFile = need("request");
      if (requestFile === "-") die("next needs the request saved in a file (--request FILE), not stdin", 2);
      const outputs = resolve(need("outputs"));
      const appDir = resolve(need("app"));
      const lock = readJson(lockPath(studio));
      // Before `prepare` the checkout may not hold the commit's catalog yet: only the shape is checked.
      const shape = parseRequest(readBody(requestFile), null);
      if (!shape.ok) die(`bad request:\n- ${shape.problems.join("\n- ")}`);
      const prepared = runStarted(shape.request, outputs, lock);
      const parsed = prepared ? parseRequest(readBody(requestFile), catalog()) : shape;
      if (!parsed.ok) die(`bad request:\n- ${parsed.problems.join("\n- ")}`);
      const owner = readJson(join(outputs, ".run"));
      if (owner && owner.id !== parsed.request.id) die(`${outputs} holds the files of run ${owner.id}, not ${parsed.request.id}: use a new, empty --outputs directory`, 2);
      mkdirSync(outputs, { recursive: true });
      writeFileSync(join(outputs, ".run"), JSON.stringify({ id: parsed.request.id }));
      if (opts.posted) {
        if (!existsSync(join(outputs, "result.txt"))) die("nothing to mark: no result.txt yet, keep running `next`", 2);
        writeFileSync(join(outputs, ".posted"), new Date().toISOString());
      }
      const step = nextStep(parsed.request, prepared ? catalog() : [], { outputs, app: appDir, repo: typeof opts.repo === "string" ? opts.repo : undefined, studio, requestFile: resolve(requestFile), lock });
      if (step.error) die(step.error, 2);
      console.log(step.done ? "DONE. The result is posted and the run is closed: stop and wait for the next request." : `NEXT (${step.action}): ${step.text}`);
      return;
    }
    case "read-result": {
      const r = readResult(readBody(need("file")), need("id"));
      if (!r.mine) { console.error("not the result of this run"); process.exit(2); }
      console.log(r.text);
      process.exit(r.pass ? 0 : 1);
    }
    default:
      die("usage: live-check.mjs request|prepare|next|exec|facts|judge|result|read-result (see the header of this file)", 2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
