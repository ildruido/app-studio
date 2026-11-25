// Run: node --test scripts/merge-queue.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TURN_MARK, WAIT_MARK, isQueued, makeApi, order, plan, run, turnVerdict } from "./merge-queue.mjs";

const APP = ["plugins/studio/skills/x/SKILL.md"];
const pr = (number, o = {}) => ({ number, draft: false, labels: [], files: APP, autoMerge: false, comments: [], ...o });

test("app-facing PRs are queued by their files; internal ones only with the label", () => {
  assert.ok(isQueued(pr(1)));
  assert.equal(isQueued(pr(2, { files: ["docs/x.md"] })), false);
  assert.ok(isQueued(pr(2, { files: ["docs/x.md"], labels: ["queue"] })));
});

test("removing the label from an app-facing PR does not take it out", () => {
  assert.ok(isQueued(pr(3, { labels: [] })));
});

test("order is oldest PR first; internal PRs are not in it", () => {
  assert.deepEqual(order([pr(9), pr(4), pr(6, { files: ["docs/a.md"] })]), [4, 9]);
});

test("the first PR gets the turn comment, later ones a wait comment naming who is ahead", () => {
  const { active, actions } = plan([pr(9, { draft: true }), pr(4, { draft: true }), pr(7, { draft: true })]);
  assert.equal(active, 4);
  const by = Object.fromEntries(actions.map((a) => [a.pr, a]));
  assert.ok(by[4].body.includes(TURN_MARK));
  assert.ok(by[7].body.includes(WAIT_MARK) && by[7].body.includes("#4"));
  assert.ok(by[9].body.includes("#4, #7"));
});

test("comments are posted once; a waiting PR whose turn comes gets the turn comment", () => {
  const first = plan([pr(4, { draft: true, comments: [TURN_MARK] }), pr(7, { draft: true, comments: [WAIT_MARK] })]);
  assert.deepEqual(first.actions, []);
  const next = plan([pr(7, { draft: true, comments: [WAIT_MARK] })]);
  assert.deepEqual(next.actions.map((a) => [a.pr, a.kind]), [[7, "comment"]]);
  assert.ok(next.actions[0].body.includes(TURN_MARK));
});

test("auto-merge is switched on only for the first PR, once it is ready", () => {
  const ready = plan([pr(4, { comments: [TURN_MARK] }), pr(7, { comments: [WAIT_MARK] })]);
  assert.deepEqual(ready.actions, [{ pr: 4, kind: "automerge" }]);
  assert.deepEqual(plan([pr(4, { comments: [TURN_MARK], autoMerge: true })]).actions, []);
  assert.deepEqual(plan([pr(4, { draft: true, comments: [TURN_MARK] })]).actions, []);
});

test("an empty queue plans nothing", () => {
  assert.deepEqual(plan([pr(1, { files: ["docs/a.md"] })]), { queue: [], active: null, actions: [] });
});

test("CI verdict: internal passes, first passes, later waits, unreadable queue fails closed", () => {
  assert.ok(turnVerdict(pr(5, { files: ["docs/a.md"] }), null).ok);
  assert.ok(turnVerdict(pr(5), [5, 8]).ok);
  const late = turnVerdict(pr(8), [5, 8]);
  assert.equal(late.ok, false);
  assert.match(late.why, /#5/);
  assert.equal(turnVerdict(pr(8), null).ok, false);
});

test("run reads GitHub, posts the comments and tolerates a refused auto-merge", async () => {
  const calls = [];
  const fakeFetch = async (url, o = {}) => {
    const u = String(url);
    const m = o.method ?? "GET";
    calls.push(`${m} ${u.replace("https://api.github.com", "")}`);
    const json = (b, ok = true) => ({ ok, status: ok ? 200 : 422, json: async () => b });
    if (u.endsWith("/graphql")) return json({ errors: [{ message: "Pull request is in clean status" }] });
    if (m === "POST") return json({});
    if (u.includes("/pulls?")) return json([{ number: 4, draft: false, labels: [], node_id: "N4" }, { number: 7, draft: true, labels: [], node_id: "N7" }, { number: 8, draft: false, labels: [], node_id: "N8" }]);
    if (u.includes("/pulls/8/files")) return json([{ filename: "docs/a.md" }]);
    if (u.includes("/files")) return json([{ filename: APP[0] }]);
    return json([]);
  };
  const report = await run(makeApi("t", "o/r", fakeFetch));
  assert.match(report, /#4 -> #7 \(turn: #4\)/);
  assert.match(report, /#4: automerge not done \(Pull request is in clean status\)/);
  assert.ok(calls.includes("POST /repos/o/r/issues/4/comments") && calls.includes("POST /repos/o/r/issues/7/comments"));
  assert.ok(!calls.some((c) => c.includes("issues/8/")), "an internal PR is left alone");
});

test("the queue workflow runs trusted code only and the CI job `queue` is part of `check`", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const wf = readFileSync(join(root, ".github/workflows/merge-queue.yml"), "utf8");
  assert.match(wf, /pull_request_target:/);
  assert.doesNotMatch(wf, /^ {2}pull_request:/m);
  assert.doesNotMatch(wf, /head\.sha|head\.ref|head\.repo/); // never the PR's code
  assert.match(wf, /node scripts\/merge-queue\.mjs run/);
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /needs: \[tier, tests, gate, queue\]/);
  assert.match(ci, /node \.\.\/trusted\/scripts\/merge-queue\.mjs turn/);
});
