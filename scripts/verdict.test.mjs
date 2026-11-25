// Tests for the review and QA verdict files (plugins/studio/hooks/verdict.mjs), the pre-push hook and the merge gate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verdictProblems, writeVerdict } from "../plugins/studio/hooks/verdict.mjs";

const studio = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (cwd, cmd, ...a) => spawnSync(cmd, a, { cwd, encoding: "utf8" });
const git = (cwd, ...a) => assert.equal(sh(cwd, "git", ...a).status, 0, `git ${a.join(" ")}`);
const put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
const commit = (root, msg = "feat: x") => { git(root, "add", "-A"); git(root, "commit", "-qm", msg); };

/** An app repo on feat/x with one code change against main and the harness hooks installed under .claude/hooks. */
function app() {
  const root = mkdtempSync(join(tmpdir(), "verdict-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  cpSync(join(studio, "plugins/studio/hooks"), join(root, ".claude/hooks"), { recursive: true });
  put(root, "src/a.ts", "export const a = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "chore: base");
  git(root, "switch", "-qc", "feat/x");
  put(root, "src/a.ts", "export const a = 2;\n");
  commit(root);
  return root;
}
const ok = { reviewer: "reviewer", verdict: "approve", findings: [{ severity: "nit", problem: "naming" }] };

test("missing results are named, with the agent to run", () => {
  const root = app();
  const p = verdictProblems(root);
  assert.equal(p.length, 2);
  assert.match(p[0], /no review result .*`reviewer` agent/);
  assert.match(p[1], /no QA result .*`qa` agent/);
});

test("passing results for HEAD clear the gate; docs-only and harness-only diffs need none", () => {
  const root = app();
  assert.ok(writeVerdict(root, "review", ok).file);
  assert.ok(writeVerdict(root, "qa", { verdict: "pass" }).file);
  assert.deepEqual(verdictProblems(root), []);
  const docs = app();
  git(docs, "reset", "-q", "--hard", "main");
  put(docs, "docs/PRD.md", "x\n");
  put(docs, ".claude/hooks/x.mjs", "x\n");
  commit(docs, "docs: x");
  assert.deepEqual(verdictProblems(docs), []);
});

test("a result goes stale when HEAD moves", () => {
  const root = app();
  writeVerdict(root, "review", ok);
  writeVerdict(root, "qa", { verdict: "pass" });
  put(root, "src/a.ts", "export const a = 3;\n");
  commit(root, "fix: y");
  const p = verdictProblems(root);
  assert.match(p[0], /review result is for \w+, not \w+: .*again/);
  assert.match(p[1], /QA result is for/);
});

test("a changes or fail verdict blocks, and an approve cannot hide a blocking finding", () => {
  const root = app();
  assert.match(writeVerdict(root, "review", { ...ok, findings: [{ severity: "blocking", problem: "data loss" }] }).error, /cannot list a blocking/);
  writeVerdict(root, "review", { reviewer: "reviewer", verdict: "changes", findings: [{ severity: "blocking", problem: "data loss" }] });
  writeVerdict(root, "qa", { verdict: "fail", findings: [{ severity: "blocking", problem: "step 2 fails" }] });
  const p = verdictProblems(root);
  assert.match(p[0], /review says "changes"/);
  assert.match(p[1], /QA says "fail"/);
});

test("bad shapes are refused and nothing is written", () => {
  const root = app();
  assert.match(writeVerdict(root, "review", { verdict: "maybe", reviewer: "reviewer" }).error, /verdict/);
  assert.match(writeVerdict(root, "review", { ...ok, reviewer: "me" }).error, /reviewer/);
  assert.match(writeVerdict(root, "qa", { verdict: "pass", findings: [{ severity: "huge", problem: "x" }] }).error, /severity/);
  assert.match(writeVerdict(root, "qa", { verdict: "pass", findings: [{ severity: "nit" }] }).error, /problem/);
  assert.equal(existsSync(join(root, ".claude/state/qa.json")), false);
});

test("a high-risk diff needs reviewer-deep", () => {
  const root = app();
  put(root, ".claude/packs/web/review-rules.json", JSON.stringify({ risky: ["^src/"] }));
  git(root, "add", "-f", "-A");
  git(root, "commit", "-qm", "chore: pack");
  writeVerdict(root, "review", ok);
  writeVerdict(root, "qa", { verdict: "pass" });
  assert.match(verdictProblems(root)[0], /run the `reviewer-deep` agent/);
  writeVerdict(root, "review", { ...ok, reviewer: "reviewer-deep" });
  assert.deepEqual(verdictProblems(root), []);
});

test("the script stamps the commit, keeps the files out of git and works through the CLI", () => {
  const root = app();
  const run = (...a) => spawnSync("node", [join(root, ".claude/hooks/verdict.mjs"), ...a], { cwd: root, encoding: "utf8", input: JSON.stringify(ok) });
  const w = run("write", "review");
  assert.equal(w.status, 0, w.stderr);
  const head = sh(root, "git", "rev-parse", "HEAD").stdout.trim();
  assert.equal(JSON.parse(readFileSync(join(root, ".claude/state/review.json"), "utf8")).commit, head);
  assert.equal(sh(root, "git", "status", "--porcelain").stdout.trim(), "");
  const c = run("check");
  assert.equal(c.status, 2);
  assert.match(c.stderr, /no QA result/);
});

test("the pre-push hook refuses a push of an unreviewed change, allows it with results, and allows deleting a branch", () => {
  const root = app();
  const remote = mkdtempSync(join(tmpdir(), "verdict-remote-"));
  git(remote, "init", "-q", "--bare");
  git(root, "remote", "add", "origin", remote);
  // Only the pre-push hook: the pre-commit health check needs a full harness install.
  const hooks = mkdtempSync(join(tmpdir(), "verdict-hooks-"));
  copyFileSync(join(root, ".claude/hooks/pre-push"), join(hooks, "pre-push"));
  chmodSync(join(hooks, "pre-push"), 0o755);
  git(root, "config", "core.hooksPath", hooks);
  const push = (...a) => sh(root, "git", "push", "-q", "origin", ...a);
  const blocked = push("feat/x");
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /no review result/);
  writeVerdict(root, "review", ok);
  writeVerdict(root, "qa", { verdict: "pass" });
  assert.equal(push("feat/x").status, 0);
  put(root, "src/a.ts", "export const a = 9;\n");
  commit(root, "fix: z");
  assert.notEqual(push("feat/x").status, 0);
  assert.equal(push("--delete", "feat/x").status, 0);
});

test("the merge gate refuses without results", () => {
  const root = app();
  git(root, "remote", "add", "origin", "https://github.com/me/demo.git");
  const transcript = join(root, "t.jsonl");
  const call = [
    { type: "tool_use", id: "1", name: "mcp__github__pull_request_read", input: { method: "get_check_runs", owner: "me", repo: "demo", pullNumber: 1 } },
  ];
  const result = [{ type: "tool_result", tool_use_id: "1", content: JSON.stringify({ check_runs: [{ name: "CI gate", id: 1, status: "completed", conclusion: "success" }] }) }];
  writeFileSync(transcript, `${JSON.stringify({ message: { content: call } })}\n${JSON.stringify({ message: { content: result } })}\n`);
  const event = JSON.stringify({ tool_name: "mcp__github__merge_pull_request", transcript_path: transcript, tool_input: { owner: "me", repo: "demo", pullNumber: 1 } });
  const run = () => spawnSync("node", [join(root, ".claude/hooks/check.mjs"), "merge"], { cwd: root, encoding: "utf8", input: event });
  const blocked = run();
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /review and QA results/);
  writeVerdict(root, "review", ok);
  writeVerdict(root, "qa", { verdict: "pass" });
  assert.equal(run().status, 0, run().stderr);
});
