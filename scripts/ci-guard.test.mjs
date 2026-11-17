// Guards the rules at the top of .github/workflows/ci.yml: a PR must not be able to edit the rules that
// judge it. Line-based on purpose (no YAML dependency); the workflow keeps a simple shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("a job with a write permission never checks out PR code", () => {
  for (const [name, body] of Object.entries(jobs())) {
    if (WRITE.test(body)) assert.ok(!/actions\/checkout/.test(body), `job ${name} has a write permission and a checkout`);
  }
});

test("every checkout of PR code in a pull_request_target job drops credentials", () => {
  for (const [name, body] of Object.entries(jobs())) {
    if (!/github\.event_name == 'pull_request_target'/.test(body)) continue;
    const n = (re) => (body.match(re) ?? []).length;
    assert.equal(n(/persist-credentials: false/g), n(/actions\/checkout/g), `job ${name}`);
  }
});

test("the base-branch scripts judge the PR: tier and release check run from the trusted checkout", () => {
  assert.match(text, /node \.\.\/trusted\/scripts\/tier\.mjs/);
  assert.match(text, /node \.\.\/trusted\/scripts\/release-check\.mjs/);
});

test("check accepts the new label and tier names and the old ones", () => {
  assert.match(text, /'owner-ok'/);
  assert.match(text, /'ale-ok'/);
  assert.match(text, /ALL_NEED_OWNER/);
  assert.match(text, /ALL_NEED_ALE/);
  assert.match(text, /"\$TIER" = owner/);
  assert.match(text, /"\$TIER" = ale/);
});

test("check is a job of the run, so it sits in the run's own check suite", () => {
  assert.ok("check" in jobs(), "a job named check");
  assert.doesNotMatch(text, /check-runs/);
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
