// Run: node --test scripts/e2e.test.mjs
// End-to-end checks of what an app experiences, as code (issue #216): replaces the manual studio-scratch live
// checks for everything a command line can show. One throwaway app is built from the template, next to a git
// copy of this app-studio with a local bare "origin" each, and driven only through the real command lines a
// thread uses: the app's own .claude/studio/studio-sync.mjs, .claude/hooks/backlog.mjs, and the loader
// (scripts/studio-env.mjs) for the hooks, fed the same hook input Claude Code sends.
// Isolation: every child process gets its own HOME, user settings, git config, temp folder, hook log and Stop note
// (a run without them once wired a fixture's hooks into the container's real settings). The last test checks that
// the real ~/.claude/settings.json was not touched.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { fillProfile } from "./e2e-profile.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = mkdtempSync(join(tmpdir(), "studio-e2e-"));
const top = join(root, "top"); // the folder a Project thread starts in: the repos side by side
const studio = join(top, "app-studio");
const app = join(top, "e2e-app");
const home = join(root, "home");
const realSettings = join(homedir(), ".claude/settings.json");
const fingerprint = (f) => (existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex") : "absent");
const realBefore = fingerprint(realSettings);

const env = (() => {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (/^(CI|GITHUB_|STUDIO_|GIT_|NODE_TEST_CONTEXT$)/.test(k)) delete e[k]; // NODE_TEST_CONTEXT: the app's own node --test must not report into this run
  return {
    ...e,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: join(root, "tmp"),
    STUDIO_USER_SETTINGS: join(home, ".claude/settings.json"),
    STUDIO_HOOK_LOG: join(root, "hooks.log"),
    STUDIO_STOP_NOTE: join(root, "stop-note.json"),
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    CLAUDE_CODE_REMOTE: "true", // like a cloud Project thread: hook forwarding must land in the isolated settings
  };
})();

const run = (cmd, args, { cwd = app, input } = {}) => {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const git = (cwd, ...args) => {
  const r = run("git", args, { cwd });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.out}`);
  return r.stdout.trim();
};
const node = (args, opts) => run(process.execPath, args, opts);
const sync = (...args) => node([".claude/studio/studio-sync.mjs", ...args]);
const backlog = (...args) => node([".claude/hooks/backlog.mjs", ...args]);
const SESSION = "e2e-session";
const transcript = join(root, "transcript.jsonl");
/** A hook call through the loader, with the input Claude Code sends. */
const hook = (mode, input = {}) =>
  node([join(studio, "scripts/studio-env.mjs"), "hook", mode, top], {
    cwd: top,
    input: JSON.stringify({ session_id: SESSION, transcript_path: transcript, cwd: app, ...input }),
  });
const read = (f) => readFileSync(f, "utf8");
const studioVersion = (dir) => JSON.parse(read(join(dir, "plugins/studio/.claude-plugin/plugin.json"))).version;

/** A new release on app-studio's origin, made from another clone (as a merged PR would). */
function upstreamRelease(version, { pending, line, edit }) {
  const up = join(root, `up-${version}`);
  git(root, "clone", "-q", join(root, "studio-origin.git"), up);
  const pj = join(up, "plugins/studio/.claude-plugin/plugin.json");
  writeFileSync(pj, read(pj).replace(/"version": "[^"]+"/, `"version": "${version}"`));
  const cl = join(up, "CHANGELOG.md");
  writeFileSync(cl, read(cl).replace(/\n## \[/, `\n## [${version}] - 2026-11-22\n\n${pending ? "Live check: pending\n\n" : ""}- ${line}\n\n## [`));
  if (edit) writeFileSync(join(up, edit), `${read(join(up, edit))}\n${line}\n`);
  git(up, "commit", "-qam", `release ${version}`);
  git(up, "push", "-q", "origin", "main");
}

before(() => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(env.TMPDIR, { recursive: true });
  writeFileSync(env.GIT_CONFIG_GLOBAL, "[user]\n\tname = e2e\n\temail = e2e@example.invalid\n[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n");
  // app-studio as a git clone of its own bare origin, holding this checkout's tracked files.
  mkdirSync(studio, { recursive: true });
  const files = execFileSync("git", ["-C", repo, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const f of files) if (existsSync(join(repo, f))) cpSync(join(repo, f), join(studio, f), { recursive: true });
  git(root, "init", "-q", "--bare", "-b", "main", join(root, "studio-origin.git"));
  git(studio, "init", "-q", "-b", "main");
  git(studio, "add", "-A");
  git(studio, "commit", "-qm", "base");
  git(studio, "remote", "add", "origin", join(root, "studio-origin.git"));
  git(studio, "push", "-q", "-u", "origin", "main");
  git(studio, "checkout", "-q", "-b", "claude/session-e2e"); // a cloud clone sits on a session branch
});
after(() => process.env.E2E_KEEP ? console.log(`kept ${root}`) : rmSync(root, { recursive: true, force: true }));

// ---------- app-studio side ----------

test("live-check-pass (app-studio) flips this checkout's pending entries; install then works without --live-check", () => {
  const log = join(studio, "CHANGELOG.md");
  const newest = `\n## [${studioVersion(studio)}]`;
  // The newest release waits for its check (the copy's entry is marked pending if this checkout's isn't).
  writeFileSync(log, read(log).replace(new RegExp(`(${newest.replace(/[.[\]]/g, "\\$&")}[^\n]*\n+)Live check: [^\n]*`), "$1Live check: pending"));
  const pending = [...read(log).matchAll(/^## \[(\d+\.\d+\.\d+)\][^\n]*\n+Live check: pending/gm)].map((m) => m[1]);
  assert.ok(pending.includes(studioVersion(studio)), "the newest release is pending");
  {
    const blocked = node([join(studio, "scripts/studio-sync.mjs"), "install", "--app", app, "--studio", studio], { cwd: top });
    assert.equal(blocked.status, 1, blocked.out);
    assert.match(blocked.out, /not live-checked yet/);
    const r = node([join(studio, "scripts/studio-sync.mjs"), "live-check-pass", ...pending, "--studio", studio, "--date", "2026-11-22"], { cwd: studio });
    assert.equal(r.status, 0, r.out);
  }
  assert.match(node([join(studio, "scripts/studio-sync.mjs"), "status", "--studio", studio], { cwd: studio }).out, /passed/);
  git(studio, "commit", "-qam", "live check passed");
  git(studio, "push", "-q", "origin", "HEAD:main");
});

test("install scaffolds an app from the template; a filled-in App profile is healthy", () => {
  mkdirSync(app, { recursive: true });
  git(app, "init", "-q", "-b", "main");
  const r = node([join(studio, "scripts/studio-sync.mjs"), "install", "--app", app, "--studio", studio], { cwd: top });
  assert.equal(r.status, 0, r.out);
  for (const p of [".claude/studio/lock.json", ".claude/hooks/check.mjs", ".claude/hooks/backlog.mjs", ".claude/agents/reviewer.md", "CLAUDE.md"])
    assert.ok(existsSync(join(app, p)), p);
  assert.match(sync("health").out, /placeholder|App profile/i, "the template's placeholders are named");
  const md = fillProfile(read(join(app, "CLAUDE.md")));
  writeFileSync(join(app, "CLAUDE.md"), md);
  writeFileSync(join(app, "package.json"), '{\n  "name": "e2e-app",\n  "version": "0.1.0",\n  "scripts": { "test": "node --test" }\n}\n');
  mkdirSync(join(app, "tests"));
  mkdirSync(join(app, "node_modules")); // the hooks run only once dependencies are installed
  writeFileSync(join(app, ".gitignore"), "node_modules\n");
  writeFileSync(join(app, "tests/sum.test.mjs"), 'import assert from "node:assert";\nimport { test } from "node:test";\ntest("sum", () => assert.equal(1 + 1, 2));\n');
  writeFileSync(join(app, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Start.\n");
  const h = sync("health");
  assert.equal(h.status, 0, h.out);
  git(app, "add", "-A");
  git(app, "commit", "-qm", "chore: start");
  git(app, "tag", "v0.1.0");
  git(root, "init", "-q", "--bare", "-b", "main", join(root, "app-origin.git"));
  git(app, "remote", "add", "origin", join(root, "app-origin.git"));
  git(app, "push", "-q", "-u", "origin", "main", "v0.1.0");
});

test("cloud wiring stays inside the isolated HOME and turns on the pre-commit check", () => {
  assert.equal(git(app, "config", "--get", "core.hooksPath"), ".claude/hooks");
  assert.match(read(env.STUDIO_USER_SETTINGS), new RegExp(`${app.replaceAll("/", "\\/")}/\\.claude/hooks/check\\.mjs`));
});

// ---------- the loader and hooks (0.33.0, 0.35.3, 0.32.0, 0.29.0) ----------

test("session start through the loader names the app and links its skills and agents", () => {
  const r = node([join(studio, "scripts/studio-env.mjs"), "session", top], { cwd: top });
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /Studio harness loaded for the app repo e2e-app/);
  assert.ok(existsSync(join(top, ".claude/skills/build-feature/SKILL.md")));
  assert.ok(existsSync(join(top, ".claude/agents/reviewer.md")));
});

test("a failing unit test at the end of a turn blocks with a short summary and saves the note", () => {
  writeFileSync(join(app, "tests/sum.test.mjs"), 'import assert from "node:assert";\nimport { test } from "node:test";\ntest("sum", () => assert.equal(1 + 1, 3));\n');
  writeFileSync(transcript, "");
  const r = hook("test", { hook_event_name: "Stop" });
  assert.equal(r.status, 2, r.out);
  const lines = r.stderr.trim().split("\n");
  assert.ok(lines.length <= 30, `summary is short (${lines.length} lines):\n${r.stderr}`);
  assert.match(r.stderr, /Fix before finishing/);
  assert.match(r.stderr, /sum/);
  assert.match(r.stderr, /- sum\n  at \S*tests\/sum\.test\.mjs:3:\d+\n  .*2 == 3/);
  assert.match(r.stderr, /Full output: /);
  assert.ok(existsSync(env.STUDIO_STOP_NOTE));
  assert.match(read(env.STUDIO_HOOK_LOG), /test exit=2\n.*test note saved/);
});

test("the note Claude didn't see is shown once, at its next tool call", () => {
  const first = hook("commit", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(first.status, 0, first.out);
  const ctx = JSON.parse(first.stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, "PreToolUse");
  assert.match(ctx.additionalContext, /end-of-turn check \(Stop hook\) failed[\s\S]*sum\.test\.mjs/);
  const second = hook("commit", { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(second.stdout, "", "shown only once");
  assert.match(read(env.STUDIO_HOOK_LOG), /test note shown at commit/);
});

test("a note the transcript shows Claude already got is not repeated; a green run clears it", () => {
  const blocked = hook("test", { hook_event_name: "Stop" });
  assert.equal(blocked.status, 2);
  writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: "text", text: blocked.stderr }] } })}\n`);
  assert.equal(hook("commit", { tool_name: "Bash", tool_input: { command: "ls" } }).stdout, "");
  writeFileSync(join(app, "tests/sum.test.mjs"), 'import assert from "node:assert";\nimport { test } from "node:test";\ntest("sum", () => assert.equal(1 + 1, 2));\n');
  assert.equal(hook("test", { hook_event_name: "Stop" }).status, 0);
  assert.ok(!existsSync(env.STUDIO_STOP_NOTE));
});

test("the commit hook runs the harness health check and blocks an unhealthy commit", () => {
  const cmd = { tool_name: "Bash", tool_input: { command: "git add -A && git commit -m x" } };
  assert.equal(hook("commit", cmd).status, 0);
  const skill = join(app, ".claude/skills/release/SKILL.md");
  const keep = read(skill);
  writeFileSync(skill, "edited here\n");
  const r = hook("commit", cmd);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Commit blocked: the harness isn't healthy[\s\S]*release\/SKILL\.md/);
  writeFileSync(skill, keep);
});

test("an app can't change app-studio, whoever approves it; issues stay open", () => {
  const harness = { owner: "ildruido", repo: "app-studio" };
  for (const [mode, tool_name, extra] of [
    ["merge", "mcp__github__merge_pull_request", { pullNumber: 1 }],
    ["merge", "mcp__github__enable_pr_auto_merge", { pullNumber: 1 }],
    ["write", "mcp__github__create_or_update_file", { path: "CHANGELOG.md" }],
    ["write", "mcp__github__push_files", { branch: "main" }],
  ]) {
    const r = hook(mode, { tool_name, tool_input: { ...harness, ...extra } });
    assert.equal(r.status, 2, `${tool_name}: ${r.out}`);
    assert.match(r.stderr, /nobody changes app-studio from an app Project/);
  }
  const push = hook("commit", { tool_name: "Bash", cwd: studio, tool_input: { command: "git push https://github.com/ildruido/app-studio.git HEAD:main" } });
  assert.equal(push.status, 2, push.out);
  assert.match(push.stderr, /nobody changes app-studio/);
  // Issues aren't hooked: filing a harness-idea stays possible (the hook matchers in settings.json don't name them).
  const hooks = JSON.stringify(JSON.parse(read(join(app, ".claude/settings.json"))).hooks);
  assert.doesNotMatch(hooks, /issue_write|add_issue_comment/);
});

test("in an Owner-merged repo Claude can't merge, switch on auto-merge or approve; other repos pass the hook", () => {
  const content = { owner: "example", repo: "content-repo", pullNumber: 3 };
  for (const [tool_name, extra] of [
    ["mcp__github__merge_pull_request", {}],
    ["mcp__github__enable_pr_auto_merge", {}],
    ["mcp__github__pull_request_review_write", { method: "create", event: "APPROVE" }],
  ]) {
    const r = hook("merge", { tool_name, tool_input: { ...content, ...extra } });
    assert.equal(r.status, 2, `${tool_name}: ${r.out}`);
    assert.match(r.stderr, /only the App Creator merges in example\/content-repo/);
  }
  assert.equal(hook("merge", { tool_name: "mcp__github__enable_pr_auto_merge", tool_input: { owner: "example", repo: "other", pullNumber: 3 } }).status, 0);
});

test("merging this app's own PR waits until its checks were read green after the last push", () => {
  const pr = { owner: "example", repo: "e2e-app", pullNumber: 7 };
  git(app, "remote", "set-url", "--push", "origin", "https://github.com/example/e2e-app.git"); // the hook reads origin's URL
  const origFetch = git(app, "remote", "get-url", "origin");
  git(app, "remote", "set-url", "origin", "https://github.com/example/e2e-app.git");
  try {
    writeFileSync(transcript, "");
    const blocked = hook("merge", { tool_name: "mcp__github__merge_pull_request", tool_input: pr });
    assert.equal(blocked.status, 2, blocked.out);
    assert.match(blocked.stderr, /hasn't read the PR's checks/);
    const read_ = { type: "tool_use", id: "t1", name: "mcp__github__pull_request_read", input: { ...pr, method: "get_check_runs" } };
    const res = { type: "tool_result", tool_use_id: "t1", content: JSON.stringify({ check_runs: [{ name: "check", status: "completed", conclusion: "success", id: 1 }] }) };
    writeFileSync(transcript, [read_, res].map((b) => JSON.stringify({ message: { content: [b] } })).join("\n"));
    assert.equal(hook("merge", { tool_name: "mcp__github__merge_pull_request", tool_input: pr }).status, 0);
  } finally {
    git(app, "remote", "set-url", "origin", origFetch);
    git(app, "config", "--unset", "remote.origin.pushurl");
  }
});

// ---------- backlog.mjs (0.34.0) ----------

test("backlog: a new item gets the next free id, moves, and on done goes to BACKLOG-DONE with its version", () => {
  mkdirSync(join(app, "docs"), { recursive: true });
  writeFileSync(
    join(app, "docs/BACKLOG.md"),
    "# Backlog\n\n## In progress\n\n## To test\n\n## Ready\n### EE-001 Home page\n- Why: start\n- Acceptance criteria:\n  - [ ] Shows hello\n\n## Backlog\n\n## Later\n\n## Done\n",
  );
  writeFileSync(join(app, "docs/BACKLOG-DONE.md"), "# Backlog: done\n");
  assert.equal(backlog("next", "EE").stdout.trim(), "EE-002");
  const add = backlog("add", "EE", "Share a link", "--why", "people share");
  assert.equal(add.status, 0, add.out);
  assert.match(read(join(app, "docs/BACKLOG.md")), /## Backlog\n### EE-002 Share a link/);
  assert.equal(backlog("move", "EE-001", "To test").status, 0);
  assert.notEqual(backlog("done", "EE-001", "v0.2.0").status, 0, "unticked criteria are refused");
  const done = backlog("done", "EE-001", "v0.2.0", "--tick");
  assert.equal(done.status, 0, done.out);
  const bl = read(join(app, "docs/BACKLOG.md"));
  assert.match(bl, /## Done\n- EE-001 Home page.*v0\.2\.0/);
  assert.doesNotMatch(bl, /### EE-001/);
  assert.match(read(join(app, "docs/BACKLOG-DONE.md")), /### EE-001 Home page[\s\S]*\[x\] Shows hello/);
  const bug = backlog("add", "EE", "Bug: link is wrong", "--bug", "--found-in", "v0.2.0, step 2", "--steps", "click", "--expected", "a", "--actual", "b");
  assert.equal(bug.status, 0, bug.out);
  assert.match(read(join(app, "docs/BACKLOG.md")), /## Ready\n### EE-003 Bug: link is wrong/);
  assert.equal(sync("health").status, 0, "health accepts the result (no duplicate ids)");
  git(app, "add", "-A");
  git(app, "commit", "-qm", "feat: share a link");
  git(app, "push", "-q");
});

// ---------- releases (0.35.0, 0.35.2) ----------

test("release-prepare names the real last tag in a shallow clone without tags", () => {
  const clone = join(root, "shallow-app");
  git(root, "clone", "-q", "--depth", "1", "--no-tags", `file://${join(root, "app-origin.git")}`, clone);
  assert.equal(git(clone, "tag"), "", "the clone starts without tags");
  const r = node([join(app, ".claude/studio/studio-sync.mjs"), "release-prepare", "--app", clone], { cwd: clone });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Last tag: v0\.1\.0/);
  assert.match(r.out, /0\.2\.0/, "a feat commit proposes a minor bump");
  assert.match(r.out, /release-cut/);
  assert.doesNotMatch(r.out, /--apply/);
});

test("release-cut branches, bumps and moves Unreleased; release-tag-check follows the tag on origin", () => {
  const r = sync("release-cut", "--version", "0.2.0");
  assert.equal(r.status, 0, r.out);
  assert.equal(git(app, "rev-parse", "--abbrev-ref", "HEAD"), "chore/release-v0.2.0");
  assert.equal(JSON.parse(read(join(app, "package.json"))).version, "0.2.0");
  assert.match(read(join(app, "CHANGELOG.md")), /## \[Unreleased\]\n\n## \[0\.2\.0\] - \d{4}-\d{2}-\d{2}/);
  assert.equal(git(app, "log", "-1", "--format=%s"), "feat: share a link", "it never commits");
  const missing = sync("release-tag-check", "0.2.0");
  assert.equal(missing.status, 1, missing.out);
  git(app, "commit", "-qam", "chore(release): v0.2.0");
  git(app, "tag", "v0.2.0");
  git(app, "push", "-q", "origin", "v0.2.0");
  assert.equal(sync("release-tag-check", "0.2.0").status, 0);
  git(app, "checkout", "-q", "main");
});

// ---------- harness-sync (0.35.0, 0.35.1, live-check gate) ----------

test("sync stops on a release still pending its live check, and --live-check takes it", () => {
  const before = read(join(app, ".claude/studio/lock.json"));
  upstreamRelease("90.0.0", { pending: true, line: "E2E-PENDING-RELEASE", edit: "plugins/studio/skills/release/SKILL.md" });
  const r = sync("sync");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /not live-checked yet/);
  assert.equal(read(join(app, ".claude/studio/lock.json")), before, "nothing changed");
  const ok = sync("sync", "--live-check");
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /E2E-PENDING-RELEASE/, "the changelog excerpt is shown");
  assert.match(ok.out, /chore\(harness\): sync studio v90\.0\.0/);
  assert.match(read(join(app, ".claude/skills/release/SKILL.md")), /E2E-PENDING-RELEASE/);
  git(app, "add", "-A");
  git(app, "commit", "-qm", "chore(harness): sync studio v90.0.0");
});

test("sync when already in step says so and prints no commit line", () => {
  const r = sync("sync", "--live-check");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /already in step, nothing to commit/);
  assert.doesNotMatch(r.out, /chore\(harness\)/);
});

test("sync stops on a file edited in the app; the --force rerun still shows the excerpt and commit line", () => {
  upstreamRelease("90.1.0", { line: "E2E-APP-ACTION-LINE", edit: "plugins/studio/skills/release/SKILL.md" });
  const skill = join(app, ".claude/skills/release/SKILL.md");
  writeFileSync(skill, `${read(skill)}\nedited here\n`);
  const first = sync("sync");
  assert.equal(first.status, 1, first.out);
  assert.match(first.out, /skipped[\s\S]*release\/SKILL\.md/);
  assert.doesNotMatch(first.out, /chore\(harness\)/);
  const forced = sync("sync", "--force");
  assert.equal(forced.status, 0, forced.out);
  assert.match(forced.out, /E2E-APP-ACTION-LINE/);
  assert.match(forced.out, /is healthy/);
  assert.match(forced.out, /chore\(harness\): sync studio v90\.1\.0/);
  assert.doesNotMatch(read(skill), /edited here/);
});

// ---------- isolation ----------

test("the runner's real user settings were never touched", () => {
  assert.equal(fingerprint(realSettings), realBefore);
});
