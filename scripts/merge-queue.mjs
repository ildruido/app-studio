#!/usr/bin/env node
// The merge queue for app-facing PRs (GOVERNANCE sections 5, 7, 9). Plain code, no model.
//   node scripts/merge-queue.mjs run        workflow `merge-queue`: posts turn/wait comments, switches on auto-merge for the PR whose turn it is
//   node scripts/merge-queue.mjs turn --pr N   CI job `queue`: fails a queued PR that is not first in line
// env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/name)
//
// Why: if only one app-facing PR is live-checked and merged at a time, `main` cannot move under a running check, so each change
// needs one run plus reruns only for its own failures. (GitHub's own merge queue is not available for a private repo on a personal
// account.)
// Who is queued: an open PR to main that changes app-facing files (the same files the branch gate uses), draft or ready, decided by
// this code, never by a thread. A thread or the coordinator can add any PR with the label `queue`; removing the label from an
// app-facing PR changes nothing. Order: ready PRs first, then drafts, each lowest PR number first, so a stalled draft never blocks a ready PR. The first PR has the turn.
// Main moves (a release-record PR, an internal PR): the first PR is told once per main commit with QUEUE-UPDATE if it is behind, so
// the queue never waits on a PR nobody told. The code does not update the branch itself: a push made with the workflow token starts
// no CI run, so the check on the new head would never appear.
// Signal: a comment on the PR itself (the build thread is subscribed to it): QUEUE-WAIT when it joins behind others, QUEUE-TURN when it is
// first (also after the PR ahead merged or closed). Comments and auto-merge made with the workflow token do not start CI, so the thread
// itself updates its branch from `main` after the turn comment; its push is what reruns `check`.
import { appFacing } from "./branch-gate.mjs";

export const WAIT_MARK = "<!-- merge-queue:wait -->";
export const TURN_MARK = "<!-- merge-queue:turn -->";
export const UPDATE_MARK = "<!-- merge-queue:update:"; // followed by the main commit the notice is for, then " -->"
export const QUEUE_LABEL = "queue";

/** Is this PR in the queue? pr: { labels: [names], files: [paths] } */
export const isQueued = (pr) => (pr.labels ?? []).includes(QUEUE_LABEL) || appFacing(pr.files ?? []).length > 0;

/** Queued PR numbers in turn order: ready PRs first, then drafts, each oldest first. A draft never holds up a ready PR (it can
 *  only be mid-check, and a draft that is nobody's rival still gets the turn so it can run its check). */
export const order = (prs) =>
  prs.filter(isQueued).sort((a, b) => !!a.draft - !!b.draft || a.number - b.number).map((p) => p.number);

export const turnText = () =>
  `${TURN_MARK}\nQUEUE-TURN: this PR is first in the merge queue.\n1. Update the branch from \`main\` if it is behind (the push reruns \`check\`).\n2. Request the branch live check (docs/LIVE-CHECK-RUNNER.md) and mark the PR ready when it passed.\n3. Switch on auto-merge; the queue also does it once the PR is ready. When it merges, the next PR gets its turn.`;

export const updateText = (main) =>
  `${UPDATE_MARK}${main} -->\nQUEUE-UPDATE: \`main\` moved (${main.slice(0, 7)}) and this PR, which holds the merge queue, is behind it. Update the branch from \`main\` now (run \`node scripts/finish.mjs next\`); the push reruns \`check\`. An owner OK is kept: it is tied to this PR's own changes, not to \`main\`.`;

export const waitText = (ahead) =>
  `${WAIT_MARK}\nQUEUE-WAIT: this PR is in the merge queue behind ${ahead.map((n) => `#${n}`).join(", ")}. Do not request a live check yet: a QUEUE-TURN comment arrives here when it is this PR's turn. Only one app-facing PR is checked and merged at a time, so \`main\` does not move under a running check.`;

/**
 * Pure core. prs: open PRs to main, each { number, draft, labels, files, autoMerge, comments: [bodies], behind: commits behind main }.
 * main: the commit `main` is at (for QUEUE-UPDATE, posted once per main commit to the PR whose turn it is when it is behind).
 * Returns { queue: [numbers], active, actions: [{ pr, kind: "comment"|"automerge", body? }] }.
 */
export function plan(prs, main = "") {
  const queue = order(prs);
  const by = new Map(prs.map((p) => [p.number, p]));
  const actions = [];
  queue.forEach((n, i) => {
    const p = by.get(n);
    const has = (mark) => (p.comments ?? []).some((c) => c.includes(mark));
    if (i === 0) {
      if (!has(TURN_MARK)) actions.push({ pr: n, kind: "comment", body: turnText() });
      else if (main && p.behind > 0 && !has(`${UPDATE_MARK}${main} -->`)) actions.push({ pr: n, kind: "comment", body: updateText(main) });
      if (!p.draft && !p.autoMerge) actions.push({ pr: n, kind: "automerge" });
    } else if (!has(WAIT_MARK) && !has(TURN_MARK)) {
      actions.push({ pr: n, kind: "comment", body: waitText(queue.slice(0, i)) });
    }
  });
  return { queue, active: queue[0] ?? null, actions };
}

/** CI's verdict for one PR: { ok, why }. queue: order(...) of every open PR (or null when it could not be read). */
export function turnVerdict(pr, queue) {
  if (!isQueued(pr)) return { ok: true, why: "Not an app-facing PR: it does not wait in the merge queue." };
  if (!queue) return { ok: false, why: "The merge queue could not be read, so this PR's turn cannot be confirmed." };
  const at = queue.indexOf(pr.number);
  const ahead = at < 0 ? queue : queue.slice(0, at);
  if (!ahead.length) return { ok: true, why: "First in the merge queue." };
  return { ok: false, why: `Not this PR's turn in the merge queue: ${ahead.map((n) => `#${n}`).join(", ")} must merge or close first. Wait for the QUEUE-TURN comment, then update the branch from main.` };
}

// ---- GitHub access (thin; the logic above is what the tests cover) ----

export function makeApi(token, repo, fetchFn = fetch) {
  const call = async (method, path, body) => {
    const res = await fetchFn(`https://api.github.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
  const all = async (path) => {
    const out = [];
    for (let page = 1; page <= 30; page++) {
      const items = await call("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  };
  return {
    openPrs: () => all(`/repos/${repo}/pulls?state=open&base=main`),
    pr: (n) => call("GET", `/repos/${repo}/pulls/${n}`),
    files: async (n) => (await all(`/repos/${repo}/pulls/${n}/files`)).map((f) => f.filename),
    comments: async (n) => (await all(`/repos/${repo}/issues/${n}/comments`)).map((c) => c.body ?? ""),
    mainSha: async () => (await call("GET", `/repos/${repo}/git/ref/heads/main`)).object.sha,
    behindBy: async (n, head) => (await call("GET", `/repos/${repo}/compare/${head}...main`)).ahead_by ?? 0,
    comment: (n, body) => call("POST", `/repos/${repo}/issues/${n}/comments`, { body }),
    async autoMerge(nodeId) {
      const res = await fetchFn("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}", variables: { id: nodeId } }),
      });
      const j = await res.json();
      if (!res.ok || j.errors) throw new Error(j.errors?.[0]?.message ?? `graphql ${res.status}`);
    },
  };
}

const describe = (p, files, comments) => ({
  number: p.number, draft: !!p.draft, labels: (p.labels ?? []).map((l) => l.name ?? l), files, comments, autoMerge: !!p.auto_merge, nodeId: p.node_id, head: p.head?.sha,
});

/** Read every open PR that could be queued, then run the plan. Returns a short report. */
export async function run(api) {
  const open = await api.openPrs();
  const prs = [];
  for (const p of open) {
    const files = await api.files(p.number);
    const d = describe(p, files, []);
    if (isQueued(d)) d.comments = await api.comments(p.number);
    prs.push(d);
  }
  // Behind-ness only matters for the PR whose turn it is: it holds the whole queue.
  let main = "";
  const first = prs.find((p) => p.number === order(prs)[0]);
  if (first?.head) {
    try { main = await api.mainSha(); first.behind = await api.behindBy(first.number, first.head); }
    catch (e) { main = ""; }
  }
  const { queue, active, actions } = plan(prs, main);
  const lines = [`Queue: ${queue.length ? queue.map((n) => `#${n}`).join(" -> ") : "empty"}${active ? ` (turn: #${active})` : ""}`];
  for (const a of actions) {
    try {
      if (a.kind === "comment") await api.comment(a.pr, a.body);
      else await api.autoMerge(prs.find((p) => p.number === a.pr).nodeId);
      lines.push(`#${a.pr}: ${a.kind} done`);
    } catch (e) {
      // e.g. GitHub refuses auto-merge when the PR is already clean: the thread merges it instead.
      lines.push(`#${a.pr}: ${a.kind} not done (${e.message})`);
    }
  }
  return lines.join("\n");
}

async function main(argv) {
  const [cmd] = argv;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) { console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required."); process.exit(2); }
  const api = makeApi(token, repo);
  if (cmd === "run") {
    const report = await run(api);
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) (await import("node:fs")).appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Merge queue\n${report}\n`);
    return;
  }
  if (cmd === "turn") {
    const n = Number(argv[argv.indexOf("--pr") + 1]);
    if (!n) { console.error("usage: merge-queue.mjs turn --pr <number>"); process.exit(2); }
    const p = await api.pr(n);
    const me = describe(p, await api.files(n), []);
    let queue = null;
    if (isQueued(me)) {
      try {
        const prs = [];
        for (const o of await api.openPrs()) prs.push(describe(o, o.number === n ? me.files : await api.files(o.number), []));
        queue = order(prs);
      } catch { queue = null; }
    }
    const v = turnVerdict(me, queue);
    console.log(`${v.ok ? "PASS" : "FAIL"}: ${v.why}`);
    if (process.env.GITHUB_STEP_SUMMARY) (await import("node:fs")).appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Merge queue: ${v.ok ? "ok" : "waiting"}\n${v.why}\n`);
    process.exit(v.ok ? 0 : 1);
  }
  console.error("usage: merge-queue.mjs run | turn --pr <number>");
  process.exit(2);
}

if (process.argv[1]?.endsWith("merge-queue.mjs")) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
