#!/usr/bin/env node
// Brings live-check results to the PR they belong to (GOVERNANCE sections 5, 7, 9). Plain code, no model.
//   node scripts/live-check-relay.mjs run
//        workflow `merge-queue`: reads the requests (#71) and results (#72) on studio-scratch with the read-only LIVE_CHECK_TOKEN and
//        comments each new result on its PR: `<!-- live-check-result:<id>:<pass|fail> -->` plus the result text. The build thread
//        wakes on that comment and `finish` reads the marker, so no model carries a result between repos.
// env: GITHUB_TOKEN (app-studio, comment), GITHUB_REPOSITORY (owner/name), LIVE_CHECK_TOKEN (studio-scratch, read), STUDIO_SCRATCH (optional owner/repo)
// Which PR: a branch run goes to the open PR whose head branch is the request's branch; a main run goes to the PR named by
// releases/<version>.json on main (refs.pr). The id finish makes names the PR, lc-pr<number>-<branch|main>-<n>-<commit7> (a change has no
// version until a release is cut), or the version when the PR cuts its own release: lc-<major>-<minor>-<patch>-<branch|main>-<n>-<commit7>.
// Runs from main, never checks out or runs a PR's code. The result's own text is posted as data; CI's branch gate still judges merges.
import { makeApi } from "./merge-queue.mjs";
import { RESULT_MARK, REQUEST_MARK } from "./live-check.mjs";

export const MAX_TEXT = 3000;
const ID = /^lc-(\d+-\d+-\d+)-(branch|main)-\d+(?:-[0-9a-f]{7})?$/;
const PR_ID = /^lc-pr(\d+)-(branch|main)-\d+-[0-9a-f]{7}$/;
const field = (t, name) => new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(t)?.[1];

export const resultMark = (id, verdict) => `<!-- live-check-result:${id}:${verdict} -->`;
/** Does a comment body already relay this run? */
export const relayed = (body, id) => body.includes(`<!-- live-check-result:${id}:`);

/** Run id -> { version, where } or { pr, where }, or null for an id finish did not make. */
export function parseId(id) {
  const p = PR_ID.exec(id ?? "");
  if (p) return { pr: Number(p[1]), where: p[2] };
  const m = ID.exec(id ?? "");
  return m ? { version: m[1].replace(/-/g, "."), where: m[2] } : null;
}

/** Result bodies -> latest result text per id. */
export function latestResults(bodies) {
  const out = new Map();
  for (const body of bodies) {
    const at = body?.indexOf(RESULT_MARK) ?? -1;
    if (at < 0) continue;
    const t = body.slice(at);
    const id = field(t, "id");
    if (id) out.set(id, { id, verdict: field(t, "verdict") === "pass" ? "pass" : "fail", text: t });
  }
  return [...out.values()];
}

/** Request bodies -> branch per id. */
export function requestBranches(bodies) {
  const out = new Map();
  for (const body of bodies) {
    const at = body?.indexOf(REQUEST_MARK) ?? -1;
    if (at < 0) continue;
    const t = body.slice(at);
    if (field(t, "id") && field(t, "branch")) out.set(field(t, "id"), field(t, "branch"));
  }
  return out;
}

export const commentBody = (r) => `${resultMark(r.id, r.verdict)}\nLive check ${r.id}: **${r.verdict}**.\n\n\`\`\`\n${r.text.length > MAX_TEXT ? `${r.text.slice(0, MAX_TEXT)}\n...` : r.text}\n\`\`\``;

/** The PR a result belongs to: branch run -> open PR on the request's branch; main run -> the PR main's record names. */
export function targetPr(id, { branches, openPrs, recordPrs, released = new Set() }) {
  const p = parseId(id);
  if (!p) return null;
  // An id that names its PR: a main run goes to that (merged) PR; a branch run only while the PR is open on the request's branch.
  if (p.pr) return p.where === "main" || openPrs.some((o) => o.number === p.pr && o.ref === branches.get(id)) ? p.pr : null;
  if (p.where === "main") return recordPrs.get(p.version) ?? null;
  if (released.has(p.version)) return null; // a branch run of a version main already has belongs to an earlier release, never to the open PR
  return openPrs.find((o) => o.ref === branches.get(id))?.number ?? null;
}

/** Pure core: the comments to post, [{ pr, id, body }]. comments: (pr) => bodies already on that PR (a relayed run is skipped). */
export function plan({ results, branches, openPrs, recordPrs, released, comments }) {
  const out = [];
  for (const r of results) {
    const pr = targetPr(r.id, { branches, openPrs, recordPrs, released });
    if (!pr || comments(pr).some((c) => relayed(c, r.id))) continue;
    out.push({ pr, id: r.id, body: commentBody(r) });
  }
  return out;
}

// ---- GitHub access (thin; the logic above is what the tests cover) ----

async function readBodies(repo, token, n, fetchFn = fetch) {
  const bodies = [];
  for (const kind of [`pulls/${n}/reviews`, `issues/${n}/comments`]) {
    for (let page = 1; page <= 20; page++) {
      const res = await fetchFn(`https://api.github.com/repos/${repo}/${kind}?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
      if (!res.ok) throw new Error(`reading ${repo} ${kind} -> ${res.status}`);
      const items = await res.json();
      bodies.push(...items.map((i) => i.body ?? ""));
      if (items.length < 100) break;
    }
  }
  return bodies;
}

export async function run(api, { scratch, token, repo }, fetchFn = fetch) {
  const results = latestResults(await readBodies(scratch, token, 72, fetchFn));
  const lines = [`Live-check results on ${scratch} #72: ${results.length}`];
  const wanted = results.filter((r) => parseId(r.id));
  if (!wanted.length) return lines.join("\n");
  const branches = requestBranches(await readBodies(scratch, token, 71, fetchFn));
  const openPrs = (await api.openPrs()).map((p) => ({ number: p.number, ref: p.head?.ref }));
  const recordPrs = new Map();
  const released = new Set();
  for (const { version } of wanted.map((r) => parseId(r.id))) {
    if (!version || recordPrs.has(version)) continue;
    const res = await fetchFn(`https://api.github.com/repos/${repo}/contents/releases/${version}.json?ref=main`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github.raw+json" } });
    let pr = null;
    if (res.ok) { released.add(version); try { pr = JSON.parse(await res.text()).refs?.pr ?? null; } catch { /* no usable record */ } }
    recordPrs.set(version, pr);
  }
  const cache = new Map();
  for (const r of wanted) {
    const pr = targetPr(r.id, { branches, openPrs, recordPrs, released });
    if (pr && !cache.has(pr)) cache.set(pr, await api.comments(pr));
  }
  const todo = plan({ results: wanted, branches, openPrs, recordPrs, released, comments: (n) => cache.get(n) ?? [] });
  for (const t of todo) {
    try { await api.comment(t.pr, t.body); lines.push(`#${t.pr}: result of ${t.id} relayed`); }
    catch (e) { lines.push(`#${t.pr}: result of ${t.id} not relayed (${e.message})`); }
  }
  if (!todo.length) lines.push("Nothing new to relay.");
  return lines.join("\n");
}

async function main(argv) {
  if (argv[0] !== "run") { console.error("usage: live-check-relay.mjs run"); process.exit(2); }
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.LIVE_CHECK_TOKEN;
  if (!process.env.GITHUB_TOKEN || !repo) { console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required."); process.exit(2); }
  if (!token) { console.log("LIVE_CHECK_TOKEN is not set: no live-check results to relay."); return; }
  const scratch = process.env.STUDIO_SCRATCH ?? `${repo.split("/")[0]}/studio-scratch`;
  const report = await run(makeApi(process.env.GITHUB_TOKEN, repo), { scratch, token, repo });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) (await import("node:fs")).appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Live-check relay\n${report}\n`);
}

if (process.argv[1]?.endsWith("live-check-relay.mjs")) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
