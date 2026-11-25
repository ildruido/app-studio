#!/usr/bin/env node
// CI's branch live-check gate (GOVERNANCE sections 5, 7, 9). Plain code, no model.
//   node scripts/branch-gate.mjs fingerprint [--base origin/main]
//        fingerprint of the PR's app-facing changes (empty when it has none); `live-check.mjs request` puts it in the request
//   node scripts/branch-gate.mjs check [--base origin/main]
//        CI: an app-facing PR needs a passing branch result for its current fingerprint, read from studio-scratch PR #72
//        (env LIVE_CHECK_TOKEN: a read-only token; STUDIO_SCRATCH: owner/repo, default <this owner>/studio-scratch)
// App-facing = the files release-check.mjs calls harness files (plugins, packs, the sync tool, the loader, the setup script).
// The result is tied to the fingerprint of those files' changes: merging `main` into the branch keeps it while the fingerprint
// is unchanged; any other change to app-facing files needs a new run. Internal-only PRs need no scratch run.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { HARNESS } from "./release-check.mjs";
import { isBookkeeping } from "./own-fp.mjs";
import { RESULT_MARK } from "./live-check.mjs";
import { missingScenarios } from "./scenario-cover.mjs";

const git = (args, input) => {
  const r = spawnSync("git", args, { encoding: "utf8", input, maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};

// Files code writes on every release (plugin version, CHANGELOG, release record), internal ones too, never make a PR app-facing
// (a version bump alone would put every internal PR in the merge queue and under the branch gate).
export const appFacing = (changed) => changed.filter((f) => !isBookkeeping(f) && HARNESS.some((re) => re.test(f)));

export function fingerprint(base) {
  const names = git(["diff", "--name-only", `${base}...HEAD`]);
  if (names === null) throw new Error(`cannot diff against ${base} (fetch the full history)`);
  const files = appFacing(names.split("\n").filter(Boolean));
  if (!files.length) return "";
  const diff = git(["diff", `${base}...HEAD`, "--", ...files]) ?? "";
  return (git(["patch-id", "--stable"], diff) ?? "").split(" ")[0].trim();
}

const field = (t, name) => new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(t)?.[1];

/** Every live-check result found in review or comment bodies. */
export function parseResults(bodies) {
  const out = [];
  for (const body of bodies) {
    const at = body?.indexOf(RESULT_MARK) ?? -1;
    if (at < 0) continue;
    const t = body.slice(at);
    const scenarios = {};
    for (const m of t.matchAll(/^scenario ([a-z0-9-]+): (PASS|FAIL)/gm)) scenarios[m[1]] = m[2] === "PASS";
    out.push({ id: field(t, "id"), fp: field(t, "fp"), commit: field(t, "commit"), pass: field(t, "verdict") === "pass", scenarios });
  }
  return out;
}

/**
 * Pure core.
 *   changed: paths the PR changes; fp: fingerprint of its app-facing changes
 *   record : the PR's release record (parsed) or null; results: parseResults(...) of studio-scratch #72, or null when unreadable
 */
export function evaluate({ changed, fp, record, results, catalog }) {
  const files = appFacing(changed);
  if (!files.length) return { ok: true, why: "No app-facing files changed: no studio-scratch run needed." };
  if (!record) return { ok: false, why: "App-facing files changed but the release record is missing (release-check reports it too)." };
  const need = record.checks?.branch;
  if (!Array.isArray(need)) {
    if (record.kind === "loader") return { ok: false, why: "A loader or setup release needs branch scenarios, not `none`." };
    return { ok: true, why: `The record says no branch check is needed (${need?.none ?? "no reason"}).` };
  }
  if (record.kind === "loader" && record.status?.main === "not needed") return { ok: false, why: "A loader or setup release must have status.main `pending` until its main scenarios pass." };
  const missing = catalog ? missingScenarios(catalog, files, record) : [];
  if (missing.length) return { ok: false, why: `The release record omits branch scenarios that cover the changed app-facing files: ${missing.join(", ")}. Add them to checks.branch, or skip one with finish start --skip-scenario "<id>: <reason>".` };
  const run = `node scripts/live-check.mjs request --branch <branch> --commit <sha> --version ${record.version}`;
  if (results === null) return { ok: false, why: "The studio-scratch results could not be read (is the LIVE_CHECK_TOKEN secret set and valid?), so the branch live check cannot be confirmed." };
  const good = results.find((r) => r.pass && r.fp === fp && need.every((s) => r.scenarios[s] === true));
  if (good) return { ok: true, why: `Branch live check ${good.id} passed for these app-facing changes (fingerprint ${fp.slice(0, 10)}).` };
  const stale = results.some((r) => r.pass && r.fp && r.fp !== fp);
  return { ok: false, why: `No passing branch live check for these app-facing changes (fingerprint ${fp.slice(0, 10)}; scenarios ${need.join(", ")}).${stale ? " An earlier pass exists for different app-facing changes: run it again." : ""} Request one (${run}), post it on studio-scratch PR #71, then mark the PR ready.` };
}

async function readResults(repo, token) {
  const bodies = [];
  for (const kind of ["pulls/72/reviews", "issues/72/comments"]) {
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`https://api.github.com/repos/${repo}/${kind}?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
      if (!res.ok) return null;
      const items = await res.json();
      bodies.push(...items.map((i) => i.body ?? ""));
      if (items.length < 100) break;
    }
  }
  return parseResults(bodies);
}

async function main(argv) {
  const cmd = argv[0];
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "origin/main";
  if (cmd === "fingerprint") { console.log(fingerprint(base)); return; }
  if (cmd !== "check") { console.error("usage: branch-gate.mjs fingerprint|check [--base origin/main]"); process.exit(2); }
  const names = git(["diff", "--name-only", `${base}...HEAD`]);
  if (names === null) { console.error(`Cannot diff against ${base}.`); process.exit(2); }
  const changed = names.split("\n").filter(Boolean);
  let record = null;
  try {
    const v = JSON.parse(readFileSync("plugins/studio/.claude-plugin/plugin.json", "utf8")).version;
    record = JSON.parse(readFileSync(`releases/${v}.json`, "utf8"));
  } catch { /* no record */ }
  const fp = fingerprint(base);
  const needsResults = appFacing(changed).length && Array.isArray(record?.checks?.branch);
  const repo = process.env.STUDIO_SCRATCH ?? `${(process.env.GITHUB_REPOSITORY ?? "").split("/")[0]}/studio-scratch`;
  const token = process.env.LIVE_CHECK_TOKEN;
  const results = !needsResults ? [] : token ? await readResults(repo, token) : null;
  let catalog = null;
  try { catalog = JSON.parse(readFileSync("releases/scenarios.json", "utf8")).scenarios; } catch { /* no catalog */ }
  const r = evaluate({ changed, fp, record, results, catalog });
  console.log(`${r.ok ? "PASS" : "FAIL"}: ${r.why}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Branch live check: ${r.ok ? "ok" : "missing"}\n${r.why}\n`);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1]?.endsWith("branch-gate.mjs")) main(process.argv.slice(2));
