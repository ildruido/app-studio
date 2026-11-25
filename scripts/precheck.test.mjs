// Tests for the review and QA pre-check scripts (plugins/studio/hooks/review-precheck.mjs, qa-run.mjs) and the
// pack rule files they read. Imported by studio-sync.test.mjs so CI runs them without a workflow change.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scenarioLeads, addedLines, precheck, risk, renderRisk } from "../plugins/studio/hooks/review-precheck.mjs";
import { checkOutput, pickSpecs } from "../plugins/studio/hooks/qa-run.mjs";

const studio = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cwd, ...a) => assert.equal(spawnSync("git", a, { cwd, encoding: "utf8" }).status, 0, `git ${a.join(" ")}`);
const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

/** An app repo on `main` with the given packs' rule files installed under .claude/packs. */
function app(packs, base = {}) {
  const root = mkdtempSync(join(tmpdir(), "precheck-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  for (const p of packs) {
    let rules = "{}"; // a pack with no rule file is still installed
    try { rules = readFileSync(join(studio, "packs", p, "managed", "review-rules.json"), "utf8"); } catch { /* none */ }
    put(root, `.claude/packs/${p}/review-rules.json`, rules);
  }
  put(root, ".claude/studio/lock.json", JSON.stringify({ files: { ".claude/hooks/check.mjs": {} } }));
  put(root, "CHANGELOG.md", "# Changelog\n");
  for (const [p, t] of Object.entries(base)) put(root, p, t);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "chore: base");
  git(root, "switch", "-qc", "feat/x");
  return root;
}
const commit = (root, msg) => { git(root, "add", "-A"); git(root, "commit", "-qm", msg); };
const ids = (r) => r.findings.map((f) => f.id).sort();

test("addedLines gives path and line number of each added line", () => {
  const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,0 +5,2 @@\n+one\n+two\n";
  assert.deepEqual(addedLines(diff), [{ path: "x", line: 5, text: "one" }, { path: "x", line: 6, text: "two" }]);
});

test("a clean change with a good commit and a CHANGELOG entry has no leads", () => {
  const root = app(["base"], { "src/a.ts": "export const a = 1;\n" });
  put(root, "src/a.ts", "export const a = 2;\n");
  put(root, "CHANGELOG.md", "# Changelog\n- fix a\n");
  commit(root, "fix(a): change a\n\nRefs: AB-001");
  assert.deepEqual(precheck(root).findings, []);
});

test("process leads: commit format, Refs, CHANGELOG, managed files", () => {
  const root = app(["base"]);
  put(root, ".claude/hooks/check.mjs", "// edited\n");
  commit(root, "stuff");
  assert.deepEqual(ids(precheck(root)), ["changelog", "commit-format", "commit-refs", "managed-file-edited"]);
});

test("security greps: innerHTML and secret-like strings, a secret in a test is only a check", () => {
  const root = app(["base"]);
  put(root, "src/a.ts", 'el.innerHTML = "<b>" + x;\nconst k = "sk-ant-api03-abcdefghijkl";\n');
  put(root, "tests/unit/a.test.ts", 'const k = "sk-ant-api03-abcdefghijkl";\n');
  put(root, "CHANGELOG.md", "x\n");
  commit(root, "feat: a\n\nRefs: AB-001");
  const f = precheck(root).findings;
  assert.deepEqual(f.map((x) => `${x.severity} ${x.id} ${x.where}`).sort(), [
    "blocking secret-like src/a.ts:2",
    "check inner-html src/a.ts:1",
    "check secret-like tests/unit/a.test.ts:1",
  ]);
});

test("AI code is blocking unless the ai module is installed", () => {
  const without = app(["base"]);
  put(without, "src/feature.ts", "await getPlatform().sample(p);\n");
  commit(without, "feat: x\n\nRefs: AB-001");
  assert.ok(ids(precheck(without)).includes("ai-code-without-module"));
  const withAi = app(["base", "ai"]); // base rules, and the ai module installed
  put(withAi, "src/feature.ts", "await getPlatform().sample(p);\n");
  commit(withAi, "feat: x\n\nRefs: AB-001");
  assert.ok(!ids(precheck(withAi)).includes("ai-code-without-module"));
});

test("artifact rules: window.claude outside the platform layer, sample in a timer, hosts off the allow list", () => {
  const root = app(["base", "artifact"]);
  put(root, "src/a.ts", "window.claude.complete();\nsetInterval(() => p.sample(x), 10);\n");
  put(root, "src/platform/ok.ts", "window.claude.complete();\n");
  put(root, "index.html", '<script src="https://cdn.jsdelivr.net/npm/a"></script><script src="https://evil.example.com/b.js"></script>\n');
  commit(root, "feat: x\n\nRefs: AB-001");
  const f = precheck(root).findings.filter((x) => x.severity === "blocking" && x.id !== "ai-code-without-module");
  assert.deepEqual(f.map((x) => `${x.id} ${x.where}`).sort(), [
    "host-off-allowlist index.html:1",
    "sample-in-timer-or-loop src/a.ts:2",
    "window-claude-outside-platform src/a.ts:1",
  ]);
});

test("web rules: string-built SQL and an edited shipped migration", () => {
  const root = app(["base", "web"], { "server/migrations/001_a.sql": "create table a();\n" });
  put(root, "server/migrations/001_a.sql", "create table a(x int);\n");
  put(root, "server/migrations/002_b.sql", "create table b();\n");
  put(root, "server/src/q.ts", "await db.query(`select * from t where id = ${id}`);\nawait db.query('select 1 where a = $1', [a]);\n");
  commit(root, "feat: x\n\nRefs: AB-001");
  const f = precheck(root).findings.filter((x) => !["ai-code-without-module", "changelog"].includes(x.id));
  assert.deepEqual(f.map((x) => `${x.id} ${x.where}`).sort(), ["shipped-migration-edited server/migrations/001_a.sql", "string-built-sql server/src/q.ts:1"].sort());
});

test("mirror leak: a new top-level path that public-tree.ts does not name is blocking", () => {
  const root = app(["base", "mirror"], { "scripts/mirror/public-tree.ts": 'export const PRIVATE_PREFIXES = ["docs/", "plans/"];\n' });
  put(root, "plans/x.md", "p\n");
  put(root, "notes/y.md", "p\n");
  put(root, "src/z.ts", "export {};\n");
  put(root, "package.json", "{}\n");
  commit(root, "feat: x\n\nRefs: AB-001");
  const f = precheck(root).findings.filter((x) => x.id === "mirror-leak");
  assert.deepEqual(f.map((x) => x.where), ["notes/y.md"]);
});

test("no base branch gives a message, not a crash", () => {
  const root = mkdtempSync(join(tmpdir(), "precheck-"));
  git(root, "init", "-q", "-b", "other");
  assert.match(precheck(root, "main").error, /no base branch/);
});

test("every pack rule file is valid and every rule has an id, a message and one kind of match", () => {
  for (const pack of readdirSync(join(studio, "packs"), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const file of ["review-rules.json", "qa-rules.json"]) {
      let text;
      try { text = readFileSync(join(studio, "packs", pack.name, "managed", file), "utf8"); } catch { continue; }
      const json = JSON.parse(text);
      for (const r of json.rules ?? []) {
        assert.ok(r.id && r.message, `${pack.name}: rule needs id and message`);
        assert.equal([r.added, r.hostsExcept, r.newTopLevelNotIn, r.modifiedFiles].filter(Boolean).length, 1, `${pack.name}/${r.id}: exactly one match kind`);
        for (const re of [...(r.paths ?? []), ...(r.except ?? []), ...(r.added ? [r.added] : [])]) new RegExp(re);
      }
    }
  }
});

test("qa-run: output limits (size, only files, forbidden text) and spec choice", () => {
  const root = mkdtempSync(join(tmpdir(), "qa-"));
  put(root, "dist/index.html", "<html>ok</html>");
  assert.ok(checkOutput(root, { dir: "dist", maxBytes: 1000, onlyFiles: ["index.html"], forbid: ["sk-ant-"] }).every((c) => c.ok));
  put(root, "dist/extra.js", "var k='sk-ant-1';");
  const bad = checkOutput(root, { dir: "dist", maxBytes: 10, onlyFiles: ["index.html"], forbid: ["sk-ant-"] });
  assert.equal(bad.filter((c) => !c.ok).length, 3);
  assert.ok(checkOutput(root, { dir: "nope" })[0].ok, "a target `npm run build` did not build is not a failure");
  put(root, "e2e/artifact/baseline.spec.ts", "");
  put(root, "e2e/artifact/other.spec.ts", "");
  put(root, "e2e/web/new.spec.ts", "");
  assert.deepEqual(pickSpecs(root, ["e2e/web/new.spec.ts", "e2e/web/deleted.spec.ts", "src/a.ts"]), ["e2e/artifact/baseline.spec.ts", "e2e/web/new.spec.ts"]);
});

test("scenario leads: new, reused and unknown scenarios, and a missing test file", () => {
  const sc = (...ids) => JSON.stringify({ scenarios: ids.map((id) => ({ id, title: `T ${id}`, where: "branch", prompt: `do ${id}` })) });
  const root = app(["base"], { "releases/scenarios.json": sc("old"), "src/a.mjs": "1\n" });
  put(root, "releases/scenarios.json", sc("old", "fresh"));
  put(root, "releases/9.9.9.json", JSON.stringify({ checks: { branch: ["fresh", "old", "ghost"], main: [] } }));
  put(root, "src/a.mjs", "2\n");
  put(root, "CHANGELOG.md", "# Changelog\n- x\n");
  commit(root, "feat(a): x\n\nRefs: AB-001");
  assert.deepEqual(ids(precheck(root)), ["no-test-file", "scenario-added", "scenario-reused", "scenario-unknown"]);
  put(root, "scripts/a.test.mjs", "//\n");
  commit(root, "test(a): y\n\nRefs: AB-001");
  assert.ok(!ids(precheck(root)).includes("no-test-file"));
});

test("no scenario leads outside app-studio", () => {
  const root = app(["base"], { "src/a.ts": "1\n" });
  put(root, "src/a.ts", "2\n");
  commit(root, "fix(a): x\n\nRefs: AB-001");
  assert.ok(!ids(precheck(root)).some((i) => /scenario/.test(i)));
});

test("risk: a diff on a pack's risky path gets reviewer-deep, others get reviewer", () => {
  const root = app(["base", "web"], { "src/platform/index.ts": "a\n", "src/feature.ts": "a\n", "server/migrations/001.sql": "a\n" });
  put(root, "src/feature.ts", "b\n");
  commit(root, "feat: x\n\nRefs: #1");
  assert.deepEqual([risk(root).risk, risk(root).reviewer, risk(root).paths], ["routine", "reviewer", []]);
  put(root, "src/platform/index.ts", "b\n");
  commit(root, "feat: y\n\nRefs: #1");
  const r = risk(root);
  assert.deepEqual([r.risk, r.reviewer, r.paths], ["high", "reviewer-deep", ["src/platform/index.ts"]]);
  assert.match(renderRisk(r), /^risk: high\nRun the `reviewer-deep` agent/);
});

test("risk: a path added by another pack counts, and so does a very large diff", () => {
  const root = app(["base", "web"], { "src/feature.ts": "a\n" });
  put(root, "server/src/auth.ts", "x\n");
  commit(root, "feat: auth\n\nRefs: #1");
  assert.equal(risk(root).reviewer, "reviewer-deep");
  const big = app(["base"], { "src/feature.ts": "a\n" });
  put(big, "src/feature.ts", Array.from({ length: 450 }, (_, i) => `line ${i}`).join("\n") + "\n");
  commit(big, "feat: big\n\nRefs: #1");
  const r = risk(big);
  assert.deepEqual([r.reviewer, r.paths], ["reviewer-deep", []]);
  assert.match(renderRisk(r), /more than 400 lines/);
});

test("risk: the shipped packs declare risky paths and the deep reviewer is pinned to Opus", () => {
  for (const p of ["base", "web", "ai", "ai-web"]) assert.ok(JSON.parse(readFileSync(join(studio, "packs", p, "managed", "review-rules.json"), "utf8")).risky.length, p);
  const deep = readFileSync(join(studio, "plugins/studio/agents/reviewer-deep.md"), "utf8");
  assert.match(deep, /^model: opus$/m);
  assert.match(deep, /^effort: high$/m);
  assert.match(readFileSync(join(studio, "plugins/studio/skills/build-feature/SKILL.md"), "utf8"), /review-precheck\.mjs risk/);
});

test("scenario leads cope with a release record whose branch check is { none } (#317)", () => {
  const root = mkdtempSync(join(tmpdir(), "lead-"));
  git(root, "init", "-q"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  put(root, "releases/scenarios.json", JSON.stringify({ scenarios: [] }));
  commit(root, "base");
  put(root, "releases/0.1.0.json", JSON.stringify({ checks: { branch: { none: "internal change" }, main: [] } }));
  const leads = scenarioLeads(root, "HEAD", ["releases/0.1.0.json"]);
  assert.ok(Array.isArray(leads));
});
