// A failed check shows the exact problem (what, file:line, message) in a few lines, in CI and in the app hooks.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarize } from "../plugins/studio/hooks/failure-summary.mjs";
import { run } from "./ci-run.mjs";

// When this file runs under `node --test`, a nested `node --test` would join the outer run instead of reporting its own result.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const NODE_SPEC = `✔ passes (0.5ms)
✖ adds up (0.6ms)
ℹ tests 2
ℹ fail 1

✖ failing tests:

test at scripts/a.test.mjs:3:1
✖ adds up (0.67ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  2 !== 3
  
      at TestContext.<anonymous> (file:///x/scripts/a.test.mjs:3:32)
      at Test.run (node:internal/test_runner/test:1047:25)
`;
const VITEST = `
 FAIL  src/sum.test.ts > sum > adds
AssertionError: expected 3 to be 4 // Object.is equality
 ❯ src/sum.test.ts:7:19
      5| it("adds", () => {
`;
const ESLINT = `/app/src/a.ts
  12:5  error  'x' is assigned a value but never used  @typescript-eslint/no-unused-vars
  20:1  error  Unexpected console statement  no-console

✖ 2 problems (2 errors, 0 warnings)
`;

test("node:test failure: name, file:line and the assertion message", () => {
  const s = summarize(NODE_SPEC, { label: "Tests" });
  assert.match(s, /^Tests failed: 1 problem\./);
  assert.match(s, /- adds up\n {2}at scripts\/a\.test\.mjs:3:1/);
  assert.match(s, /2 !== 3/);
  assert.doesNotMatch(s, /node:internal/);
});

test("vitest failure: test name, file:line and message", () => {
  const s = summarize(VITEST, { label: "Unit tests" });
  assert.match(s, /- sum > adds\n {2}at src\/sum\.test\.ts:7:19\n {2}AssertionError: expected 3 to be 4/);
});

test("ESLint failure: each rule with file:line:column", () => {
  const s = summarize(ESLINT, { label: "ESLint" });
  assert.match(s, /at \/app\/src\/a\.ts:12:5/);
  assert.match(s, /never used/);
  assert.match(s, /2 problems/);
});

test("unknown output: the error-looking lines, never a wall of text", () => {
  const big = Array.from({ length: 5000 }, (_, i) => `noise line ${i}`).concat(["Error: Cannot find module 'x'"]).join("\n");
  const s = summarize(big, { label: "Build" });
  assert.match(s, /Cannot find module/);
  assert.ok(s.split("\n").length <= 30);
});

test("many failures: at most 5 listed, the rest counted, 30 lines max", () => {
  const many = Array.from({ length: 40 }, (_, i) => `test at a.mjs:${i + 1}:1\n✖ t${i} (1ms)\n  Error: bad ${i}\n      at x`).join("\n");
  const s = summarize(many, { label: "Tests" });
  assert.match(s, /40 problems/);
  assert.match(s, /\.\.\.and 35 more/);
  assert.ok(s.split("\n").length <= 30);
});

test("the summary can point at the saved full log", () => {
  assert.match(summarize("Error: x", { label: "Tests", logPath: "/tmp/full.log" }), /Full output: \/tmp\/full\.log/);
});

test("ci-run: a failing command is summarised after its full output, with annotations and a summary page", () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-run-"));
  writeFileSync(join(dir, "t.test.mjs"), `import test from "node:test"; import assert from "node:assert/strict"; test("adds up", () => assert.equal(1 + 1, 3));\n`);
  const sum = join(dir, "summary.md");
  let out = "";
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const code = run("Tests", [process.execPath, "--test", "--test-reporter=spec", join(dir, "t.test.mjs")], {
    env: { GITHUB_STEP_SUMMARY: sum },
    write: (s) => (out += s),
  });
  if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  assert.notEqual(code, 0);
  assert.match(out, /==== Tests failed: 1 problem/);
  assert.match(out, /::error file=[^,]*t\.test\.mjs,line=1,title=Tests::adds up/);
  assert.match(readFileSync(sum, "utf8"), /### Tests[\s\S]*adds up/);
});

test("ci-run: a passing command adds nothing", () => {
  let out = "";
  const code = run("Tests", [process.execPath, "-e", "console.log('ok')"], { env: {}, write: (s) => (out += s) });
  assert.equal(code, 0);
  assert.equal(out, "ok\n");
});

test("CI runs every check through ci-run, so a red step ends with the summary", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const testsJob = ci.slice(ci.indexOf("\n  tests:"), ci.indexOf("\n  check:"));
  const runs = [...testsJob.matchAll(/^\s+- run: (.+)$/gm)].map((m) => m[1]);
  assert.ok(runs.length >= 4);
  for (const r of runs) assert.match(r, /^node scripts\/ci-run\.mjs "[^"]+" -- /, r);
  assert.match(ci, /failing check's summary/i);
});

test("hook: failing unit tests give a short summary and the path of the full log", () => {
  const app = mkdtempSync(join(tmpdir(), "hook-app-"));
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  mkdirSync(join(app, "node_modules"));
  cpSync(join(root, "plugins/studio/hooks"), join(app, ".claude/hooks"), { recursive: true });
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ scripts: { test: "node --test --test-reporter=spec t.test.mjs" } }),
  );
  const noise = Array.from({ length: 400 }, (_, i) => `console.log("noise ${i}");`).join("\n");
  writeFileSync(join(app, "t.test.mjs"), `import test from "node:test"; import assert from "node:assert/strict";\n${noise}\ntest("adds up", () => assert.equal(1 + 1, 3));\n`);
  const res = spawnSync(process.execPath, [join(app, ".claude/hooks/check.mjs"), "test"], { cwd: app, encoding: "utf8", input: "{}", env: cleanEnv() });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unit tests failed: 1 problem/);
  assert.match(res.stderr, /at t\.test\.mjs:\d+:1/);
  assert.match(res.stderr, /1 \+ 1|2 !== 3|strictly equal/);
  assert.ok(res.stderr.split("\n").length <= 36, `${res.stderr.split("\n").length} lines`);
  const log = /Full output: (\S+)/.exec(res.stderr)?.[1];
  assert.ok(log && existsSync(log) && /noise 399/.test(readFileSync(log, "utf8")));
});

test("hook: an app copy without the summary helper still gets the old tail", () => {
  const app = mkdtempSync(join(tmpdir(), "hook-old-"));
  mkdirSync(join(app, ".claude/hooks"), { recursive: true });
  mkdirSync(join(app, "node_modules"));
  cpSync(join(root, "plugins/studio/hooks/check.mjs"), join(app, ".claude/hooks/check.mjs"));
  writeFileSync(join(app, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.error('plain failure');process.exit(1)\"" } }));
  const res = spawnSync(process.execPath, [join(app, ".claude/hooks/check.mjs"), "test"], { cwd: app, encoding: "utf8", input: "{}", env: cleanEnv() });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /plain failure/);
});

test("ci-run: keeps the failing command's exit code", () => {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const code = run("X", [process.execPath, "-e", "process.exit(7)"], { env: {}, write: () => {} });
  if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  assert.equal(code, 7);
});
