// Run: node --test scripts/live-check-relay.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { commentBody, latestResults, parseId, plan, relayed, requestBranches, resultMark, run, targetPr } from "./live-check-relay.mjs";

const result = (id, verdict) => `LIVE-CHECK-RESULT\nid: ${id}\ncommit: abc1234\nfp: aabbccdd11\nverdict: ${verdict}\nscenario s1: ${verdict === "pass" ? "PASS" : "FAIL no"}`;
const request = (id, branch, where = "branch") => `LIVE-CHECK-REQUEST\nid: ${id}\nbranch: ${branch}\ncommit: abc1234\nwhere: ${where}\nscenarios: s1`;

test("ids made by finish give their version and where; other ids are ignored", () => {
  assert.deepEqual(parseId("lc-0-43-0-branch-1"), { version: "0.43.0", where: "branch" });
  assert.deepEqual(parseId("lc-0-43-0-main-2"), { version: "0.43.0", where: "main" });
  assert.equal(parseId("lc-20261125073000"), null);
});

test("the latest result per id wins, reviews wrapped in other text are found", () => {
  const r = latestResults(["hello", `note\n${result("lc-0-43-0-branch-1", "fail")}`, result("lc-0-43-0-branch-1", "pass")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].verdict, "pass");
});

test("a branch result goes to the open PR on the request's branch, a main result to the PR the record names", () => {
  const branches = requestBranches([request("lc-0-43-0-branch-1", "claude/x"), request("lc-0-43-0-main-1", "main", "main")]);
  const openPrs = [{ number: 5, ref: "other" }, { number: 9, ref: "claude/x" }];
  const recordPrs = new Map([["0.43.0", 9]]);
  assert.equal(targetPr("lc-0-43-0-branch-1", { branches, openPrs, recordPrs }), 9);
  assert.equal(targetPr("lc-0-43-0-main-1", { branches, openPrs, recordPrs }), 9);
  assert.equal(targetPr("lc-0-44-0-branch-1", { branches, openPrs, recordPrs }), null);
  assert.equal(targetPr("lc-0-44-0-main-1", { branches, openPrs, recordPrs }), null);
});

test("a result is relayed once, with a marker finish reads", () => {
  const results = latestResults([result("lc-0-43-0-branch-1", "pass")]);
  const base = { results, branches: new Map([["lc-0-43-0-branch-1", "claude/x"]]), openPrs: [{ number: 9, ref: "claude/x" }], recordPrs: new Map() };
  const todo = plan({ ...base, comments: () => [] });
  assert.equal(todo.length, 1);
  assert.ok(todo[0].body.startsWith(resultMark("lc-0-43-0-branch-1", "pass")));
  assert.deepEqual(plan({ ...base, comments: () => [todo[0].body] }), []);
  assert.ok(relayed(todo[0].body, "lc-0-43-0-branch-1"));
});

test("a long result is cut", () => {
  const body = commentBody({ id: "lc-0-1-0-main-1", verdict: "fail", text: "x".repeat(10000) });
  assert.ok(body.length < 3300);
});

test("run reads the mailbox and comments on the right PR", async () => {
  const posted = [];
  const pages = {
    "pulls/72/reviews": [{ body: result("lc-0-43-0-branch-1", "pass") }],
    "issues/72/comments": [],
    "pulls/71/reviews": [{ body: request("lc-0-43-0-branch-1", "claude/x") }],
    "issues/71/comments": [],
  };
  const fetchFn = async (url) => {
    const k = Object.keys(pages).find((p) => url.includes(`/${p}?`));
    return { ok: true, status: 200, json: async () => pages[k] ?? [], text: async () => "{}" };
  };
  const api = { openPrs: async () => [{ number: 9, head: { ref: "claude/x" } }], comments: async () => [], comment: async (n, b) => posted.push([n, b]) };
  const report = await run(api, { scratch: "o/studio-scratch", token: "t", repo: "o/app-studio" }, fetchFn);
  assert.equal(posted.length, 1);
  assert.equal(posted[0][0], 9);
  assert.match(report, /#9: result of lc-0-43-0-branch-1 relayed/);
});

test("run fails loudly when the results can't be read", async () => {
  const fetchFn = async () => ({ ok: false, status: 403 });
  await assert.rejects(() => run({}, { scratch: "o/s", token: "t", repo: "o/r" }, fetchFn), /403/);
});
