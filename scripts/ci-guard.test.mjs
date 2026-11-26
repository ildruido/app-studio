// Guards the rules at the top of .github/workflows/ci.yml: a PR must not be able to edit the rules that
// judge it. Line-based on purpose (no YAML dependency); the workflow keeps a simple shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./tier.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

/** { jobName: text of the job } for the jobs under `jobs:`. */
function jobs() {
  const body = text.slice(text.indexOf("\njobs:\n") + 6);
  const out = {};
  let name = null;
  for (const line of body.split("\n")) {
    const m = /^  ([a-z][\w-]*):\s*$/.exec(line);
    if (m) { name = m[1]; out[name] = ""; }
    else if (name) out[name] += line + "\n";
  }
  return out;
}

const WRITE = /^\s*(contents|pull-requests|checks|actions|statuses|issues|id-token|packages): write\s*$/m;

test("the workflow is triggered by pull_request_target, so it runs from the base branch", () => {
  assert.match(text, /^on:\n {2}pull_request_target:\n/m);
});

test("only pull_request_target triggers it: no run is judged by the PR's own copy of this file", () => {
  const on = text.slice(text.indexOf("\non:\n"), text.indexOf("\nconcurrency:"));
  assert.doesNotMatch(on, /^ {2}(pull_request|push|workflow_dispatch|workflow_run):/m);
});

test("the default token is read-only", () => {
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
});

// One job (issue #339). Its steps replace the old jobs: PR code runs only in the `tests` step, in the `pr` checkout.
const stepBody = (name) => {
  const m = new RegExp(`- name: ${name}\\n([\\s\\S]*?)(?=\\n      (?:#|- ))`).exec(text);
  assert.ok(m, `a step named ${name}`);
  return m[1];
};

test("ci.yml is one job named check, so it bills one job per run", () => {
  assert.deepEqual(Object.keys(jobs()), ["check"]);
});

test("PR code runs only in the tests step, in the pr checkout", () => {
  const runs = [...text.matchAll(/^\s+run: ([^|\n].*)$/gm)].map((m) => m[1]);
  for (const r of runs) assert.ok(!/^node scripts\//.test(r) && !/^(npm|\.\/)/.test(r), `a step runs PR code outside tests: ${r}`);
  assert.match(stepBody("tests"), /working-directory: pr/);
  for (const n of ["tier", "gate"]) assert.match(stepBody(n), /node \.\.\/trusted\/scripts\//);
  assert.match(stepBody("queue"), /working-directory: trusted/);
});

test("every checkout drops credentials, and nothing checks the PR out twice", () => {
  const n = (re) => (text.match(re) ?? []).length;
  assert.equal(n(/persist-credentials: false/g), n(/actions\/checkout/g));
  assert.equal(n(/repository: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/g), 1);
});

test("a fork PR runs no step except the verdict", () => {
  const stepIfs = [...text.matchAll(/^      - (?:name: \w+\n(?:        id: \w+\n)?\s+)?if: (.+)$/gm)].map((m) => m[1]);
  assert.ok(stepIfs.length >= 7);
  const verdict = /- name: verdict\n\s+if: \$\{\{ !cancelled\(\) \}\}/.test(text);
  assert.ok(verdict, "the verdict step runs for forks too");
  assert.match(text, /SAME: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name == github\.repository \}\}/);
});

test("the base-branch scripts judge the PR: tier and release check run from the trusted checkout", () => {
  assert.match(text, /node \.\.\/trusted\/scripts\/tier\.mjs/);
  assert.match(text, /node \.\.\/trusted\/scripts\/release-check\.mjs/);
});

test("the branch gate holds the only secret, and runs trusted scripts", () => {
  const gate = stepBody("gate");
  assert.match(gate, /node \.\.\/trusted\/scripts\/branch-gate\.mjs/);
  assert.equal((text.match(/secrets\./g) ?? []).length, 1, "one secret reference");
  assert.match(gate, /secrets\.LIVE_CHECK_TOKEN/);
  const q = stepBody("queue");
  assert.match(q, /merge-queue\.mjs turn/);
  assert.doesNotMatch(q, /secrets\./);
});

test("CI does not start on unlabeled, and the merge queue runs only when main moves", () => {
  assert.doesNotMatch(text, /unlabeled/);
  const mq = readFileSync(join(root, ".github/workflows/merge-queue.yml"), "utf8");
  const on = mq.slice(mq.indexOf("\non:\n"), mq.indexOf("\nconcurrency:"));
  assert.doesNotMatch(on, /^\s+(schedule|workflow_run|pull_request_target):/m);
  assert.match(on, /push:\n\s+branches: \[main\]/);
});

test("check uses the owner label and tier names only", () => {
  assert.match(text, /'owner-ok'/);
  assert.doesNotMatch(text, /ale-ok/);
  assert.match(text, /ALL_NEED_OWNER/);
  assert.doesNotMatch(text, /ALL_NEED_ALE/);
  assert.match(text, /"\$TIER" = owner/);
  assert.doesNotMatch(text, /"\$TIER" = ale/);
});

test("check is a job of the run, so it sits in the run's own check suite", () => {
  assert.ok("check" in jobs(), "a job named check");
  assert.doesNotMatch(text, /check-runs/);
});

test("the owner OK is tied to the PR's own changes, not to the head commit", () => {
  assert.match(text, /scripts\/own-fp\.mjs --base/);
  assert.match(text, /owner-ok-fingerprint/);
  // a push alone no longer removes the label
  assert.doesNotMatch(text, /"\$ACTION" = synchronize/);
  // only a run for the current head commit may remove the label
  assert.match(text, /"\$current" = "\$HEAD_SHA"/);
});

test("any change under .github/ is the owner tier", () => {
  const r = classify({ changed: [".github/workflows/ci.yml"], before: () => "", after: () => "" });
  assert.equal(r.tier, "owner");
});

// The wiki publisher (issue #149) holds a write token, so it gets the same kind of guard as ci.yml.
const wiki = readFileSync(join(root, ".github/workflows/wiki-publish.yml"), "utf8");

test("wiki publisher: runs only from main and never on a pull request", () => {
  const on = wiki.slice(wiki.indexOf("\non:\n"), wiki.indexOf("\nconcurrency:"));
  assert.match(on, /^ {2}push:\n {4}branches: \[main\]/m);
  assert.doesNotMatch(on, /^ {2}(pull_request|pull_request_target|workflow_run):/m);
  assert.match(wiki, /if: github\.ref == 'refs\/heads\/main'/);
});

test("wiki publisher: read-only by default, write on its one job, no secrets", () => {
  assert.match(wiki, /^permissions:\n {2}contents: read\n/m);
  assert.equal((wiki.match(/contents: write/g) ?? []).length, 1);
  assert.doesNotMatch(wiki, /secrets\./);
  assert.match(wiki, /persist-credentials: false/);
});

// Issue #270: a test file nobody listed never ran. CI runs every scripts/*.test.mjs by one step, so none can be missed.
test("CI runs every scripts/*.test.mjs by one step, with no hand-kept list", () => {
  assert.match(text, /ci-run\.mjs "Tests \(every scripts\/\*\.test\.mjs\)" -- node scripts\/ci-tests\.mjs/);
  assert.doesNotMatch(text, /--test-reporter=spec scripts\/\S+\.test\.mjs/, "tests are not listed one by one");
  const files = readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".test.mjs"));
  assert.ok(files.includes("app-setup.test.mjs"));
});
