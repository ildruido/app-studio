// Run: node --test scripts/app-setup.test.mjs
// Tests for the new-app / intake helper scripts (issue #182, item 6): app-setup.mjs, handoff.mjs, idea-file.mjs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { adminChecklist, repoSettingsReport, repoSettingsText, modelRoles, packPlan, profileSet, discoveryValues, projectInstructions, projectReport } from "../plugins/studio/hooks/app-setup.mjs";
import { lintHandoff } from "../plugins/studio/hooks/handoff.mjs";
import { ideaIssue } from "../plugins/studio/skills/harness-idea/idea-file.mjs";

const SETUP = resolve("plugins/studio/hooks/app-setup.mjs");
const HANDOFF = resolve("plugins/studio/hooks/handoff.mjs");
const IDEA = resolve("plugins/studio/skills/harness-idea/idea-file.mjs");
const TEMPLATE = readFileSync("plugins/studio/templates/CLAUDE.md", "utf8");
const base = { slug: "demo", title: "Demo" };

test("pack-plan: web app with AI, invite-only, roadmap", () => {
  const p = packPlan({ ...base, target: "web", ai: "on", access: "invite", roadmap: "yes" });
  assert.deepEqual(p.packs, ["web"]);
  assert.match(p.commands[0], /pack add web --slug demo --title "Demo"$/);
  assert.ok(p.commands.some((c) => c.endsWith("npm install --prefix server")));
  assert.ok(p.commands.some((c) => c.endsWith("pack add ai-web")));
  assert.ok(p.commands.some((c) => c.endsWith("pack add user")));
  assert.ok(p.commands.some((c) => c.endsWith("pack add roadmap")));
  assert.equal(p.signIn, "invite");
  assert.ok(!p.notes.some((n) => /AI public use/.test(n)));
});

test("pack-plan: first pack named decides the build; artifact AI uses `ai`; no user module without sign-in or per-person docs", () => {
  const p = packPlan({ ...base, target: "web+artifact", ai: "off", access: "none" });
  assert.deepEqual(p.packs, ["web", "artifact"]);
  assert.equal(p.user, false);
  const a = packPlan({ ...base, target: "artifact", ai: "on", access: "shared", storage: "per-person" });
  assert.ok(a.commands.some((c) => c.endsWith("pack add ai")));
  assert.ok(a.commands.some((c) => c.endsWith("pack add user")));
  assert.equal(a.signIn, null);
});

test("pack-plan: AI on with anyone able to get in raises the public-use decision", () => {
  for (const access of ["open", "none"]) assert.ok(packPlan({ ...base, target: "web", ai: "on", access }).notes.some((n) => /AI public use/.test(n)));
});

test("pack-plan: static site is the pack alone; impossible combinations throw", () => {
  const s = packPlan({ ...base, target: "static-site", ai: "off", access: "none" });
  assert.deepEqual(s.packs, ["static-site"]);
  assert.equal(s.commands.length, 2);
  assert.throws(() => packPlan({ ...base, target: "static-site", ai: "on" }), /no AI/);
  assert.throws(() => packPlan({ ...base, target: "web", ai: "off", access: "shared" }), /artifact-only/);
  assert.throws(() => packPlan({ ...base, target: "artifact", ai: "off", access: "open" }), /artifact-only app is shared/);
  assert.throws(() => packPlan({ ...base, target: "mobile", ai: "off", access: "none" }), /--target/);
});

test("admin-checklist: fixed clicks, checks named, default-branch step only when needed", () => {
  const a = adminChecklist({ repo: "me/demo" });
  assert.match(a, /Allow auto-merge/);
  assert.match(a, /`CI gate` and `health`/);
  assert.doesNotMatch(a, /default branch to `main`/);
  const b = adminChecklist({ repo: "me/demo", checks: "health", defaultBranch: "master", envMissing: true, cloudflare: true });
  assert.match(b, /^1\. Switch the default branch/);
  assert.match(b, /`health`;/);
  assert.match(b, /app-studio apps/);
  assert.match(b, /Cloudflare/);
  assert.throws(() => adminChecklist({ repo: "nope" }), /--repo/);
});

test("project-report fills names from the real template and leaves only the goal sentence to Claude", () => {
  const tpl = readFileSync("plugins/studio/templates/project-instructions.md", "utf8");
  const body = projectInstructions(tpl, { name: "Demo", repo: "me/demo" });
  assert.match(body, /This Project builds Demo with the studio harness/);
  assert.doesNotMatch(body, /<App name>|<app repo>/);
  assert.doesNotMatch(body, /^# Project instructions template/m);
  const models = readFileSync("plugins/studio/skills/harness-sync/harness.md", "utf8");
  const roles = modelRoles(models);
  const r = projectReport({ name: "Demo", repo: "me/demo", template: tpl, checklist: "CHECKLIST", models });
  // The settings come from the one model table, so a new model is one edit there.
  assert.ok(r.includes(`Thread model: ${roles["the standard thread model"].model}\n- Thread effort: ${roles["the standard thread model"].effort}\n- Coordinator model: ${roles["the review model"].model}`));
  const other = "## Models\n\n| Role | Model | Effort | Used for |\n|---|---|---|---|\n| the standard thread model | Alpha | low | x |\n| the review model | Beta | high | y |\n\n## Next\n";
  assert.match(projectReport({ name: "Demo", repo: "me/demo", template: tpl, checklist: "C", models: other }), /Thread model: Alpha\n- Thread effort: low\n- Coordinator model: Beta/);
  assert.throws(() => modelRoles("## Models\n\n| the review model | Beta | high | y |\n"), /no row for "the standard thread model"/);
  assert.match(r, /TODO \(Claude\)/);
  assert.match(r, /CHECKLIST$/);
  assert.match(projectReport({ name: "Demo", repo: "me/demo", template: tpl, checklist: "C", goal: "Ship it", models }), /^Ship it$/m);
});

test("profile set edits rows, adds a known missing row, rejects unknown fields; the real template round-trips", () => {
  const md = profileSet(TEMPLATE, { Stack: "`web`", "AI plan": "none" });
  assert.match(md, /^\| Stack\s+\| `web` \|$/m);
  assert.match(md, /^\| AI plan\s+\| none \|$/m);
  assert.equal(md.split("\n").length, TEMPLATE.split("\n").length);
  const noPhase = TEMPLATE.replace(/^\| Phase.*\n/m, "");
  assert.match(profileSet(noPhase, { Phase: "build" }), /^\| Phase\s+\| build \|$/m);
  assert.throws(() => profileSet(TEMPLATE, { Colour: "red" }), /unknown App profile field/);
  assert.throws(() => profileSet("# nothing", { App: "x" }), /App profile/);
  assert.match(profileSet(TEMPLATE, { Capabilities: "a | b" }), /a \\\| b/);
});

test("profile init --discovery writes the identifying rows and TBD everywhere undecided", () => {
  const md = profileSet(TEMPLATE, discoveryValues({ name: "Demo", prefix: "DM", repo: "me/demo" }));
  assert.match(md, /^\| App\s+\| Demo \|$/m);
  assert.match(md, /^\| Phase\s+\| discovery \|$/m);
  assert.match(md, /^\| Id prefix\s+\| `DM` \|$/m);
  assert.match(md, /^\| Repo\s+\| https:\/\/github\.com\/me\/demo \(private\) \|$/m);
  for (const f of ["Stack", "Release target", "Preview target", "Capabilities", "AI", "AI plan", "Access model", "Storage shape"]) assert.match(md, new RegExp(`^\\| ${f}\\s+\\| TBD \\(decided at build start\\) \\|$`, "m"));
  assert.throws(() => discoveryValues({ name: "Demo" }), /required/);
});

test("app-setup CLI: profile init then set in a temp app, and a clear error outside one", () => {
  const dir = mkdtempSync(join(tmpdir(), "setup-"));
  writeFileSync(join(dir, "CLAUDE.md"), TEMPLATE);
  execFileSync("node", [SETUP, "profile", "init", "--discovery", "--name", "Demo", "--prefix", "DM", "--repo", "me/demo", "User=the player"], { cwd: dir });
  execFileSync("node", [SETUP, "profile", "set", "Phase=build"], { cwd: dir });
  const md = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  assert.match(md, /^\| Phase\s+\| build \|$/m);
  assert.match(md, /^\| User\s+\| the player \|$/m);
  const out = execFileSync("node", [SETUP, "pack-plan", "--target", "artifact", "--ai", "off", "--access", "shared", "--slug", "demo", "--title", "Demo"], { encoding: "utf8" });
  assert.match(out, /pack add artifact --slug demo/);
  const bad = spawnSync("node", [SETUP, "profile", "set", "Phase=build"], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /CLAUDE\.md not found/);
});

const step = (n) => `${n}. **Do:** Press the button.\n   **Expect:** A box shows.`;
const item = (title, count, start = 1) => `### ${title}\n${Array.from({ length: count }, (_, i) => step(start + i)).join("\n")}\n`;
const CLOSE = "Reply with the step numbers that failed and what you saw. A screenshot helps.";

test("handoff lint passes a good script and counts per item and in total", () => {
  assert.deepEqual(lintHandoff(`Open the app at the link (v0.3.0).\n\n${item("Share a link", 7)}\n${item("Dark mode", 7)}\n${CLOSE}\n`), []);
  assert.match(lintHandoff(`${item("Share a link", 8)}\n${CLOSE}`).join("\n"), /8 steps, at most 7 per item/);
  assert.match(lintHandoff(`${item("A", 7)}\n${item("B", 7)}\n${item("C", 2)}\n${CLOSE}`).join("\n"), /16 steps in all, at most 15/);
});

test("handoff lint flags a missing Do or Expect, a missing closing line and an empty script", () => {
  const p = lintHandoff(`### A\n1. Do: tap it\n2. Expect: a box\n\nthanks`).join("\n");
  assert.match(p, /step 1: no "Expect:"/);
  assert.match(p, /step 2: no "Do:"/);
  assert.match(p, /last line is not the closing request/);
  assert.match(lintHandoff("hello").join("\n"), /no numbered steps/);
  assert.deepEqual(lintHandoff(`1. Do: tap\n   Expect: box\n\n${CLOSE}`), []);
});

test("handoff CLI exits 1 on a bad script and 0 on a good one", () => {
  const dir = mkdtempSync(join(tmpdir(), "handoff-"));
  const good = join(dir, "good.md");
  const bad = join(dir, "bad.md");
  writeFileSync(good, `${item("A", 2)}\n${CLOSE}\n`);
  writeFileSync(bad, `${item("A", 9)}\n${CLOSE}\n`);
  assert.match(execFileSync("node", [HANDOFF, "lint", good], { encoding: "utf8" }), /ok/);
  assert.equal(spawnSync("node", [HANDOFF, "lint", bad], { encoding: "utf8" }).status, 1);
});

test("idea-file prefills prefix, label, app name, version and headings; refuses missing facts", () => {
  const i = ideaIssue({ area: "release skill", title: "ask once", happened: "asked twice", why: "step 3", name: "Demo", version: "0.41.0" });
  assert.equal(i.title, "[harness-idea] release skill: ask once");
  assert.deepEqual(i.labels, ["harness-idea"]);
  for (const h of ["**App name**\nDemo", "**Harness version**\n0.41.0", "**What happened**\nasked twice", "**Why it's the harness**\nstep 3", "**Suggested change**\n(none)"]) assert.ok(i.body.includes(h), h);
  assert.throws(() => ideaIssue({ area: "x", title: "y", happened: "z", name: "Demo", version: "1" }), /missing: --why/);
  assert.throws(() => ideaIssue({ area: "x", title: "y", happened: "z", why: "w" }), /App row.*harness version/);
});

test("idea-file CLI reads the app name and version from the app", () => {
  const dir = mkdtempSync(join(tmpdir(), "idea-"));
  mkdirSync(join(dir, ".claude/studio"), { recursive: true });
  writeFileSync(join(dir, ".claude/studio/lock.json"), JSON.stringify({ studio: "0.41.0" }));
  writeFileSync(join(dir, "CLAUDE.md"), profileSet(TEMPLATE, { App: "Demo" }));
  const out = JSON.parse(execFileSync("node", [IDEA, "--area", "hook", "--title", "t", "--happened", "h", "--why", "w", "--suggest", "s"], { cwd: dir, encoding: "utf8" }));
  assert.match(out.body, /\*\*App name\*\*\nDemo/);
  assert.match(out.body, /\*\*Harness version\*\*\n0\.41\.0/);
  assert.match(out.body, /\*\*Suggested change\*\*\ns/);
});

const goodRepo = { default_branch: "main", allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, allow_auto_merge: true, delete_branch_on_merge: true };
const goodRules = [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "CI gate" }, { context: "health" }] } }];

test("repo-settings: OK only when merge settings and the ruleset checks are all there", () => {
  const ok = repoSettingsReport({ repo: goodRepo, rules: goodRules });
  assert.equal(ok.ok, true);
  assert.match(repoSettingsText(ok, "me/demo"), /^REPO SETTINGS OK/);
});

test("repo-settings: the e2e run's state (GitHub defaults, no ruleset) says plainly what is missing", () => {
  const defaults = { default_branch: "main", allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true, allow_auto_merge: false, delete_branch_on_merge: false };
  const r = repoSettingsReport({ repo: defaults, rules: [] });
  assert.equal(r.ok, false);
  const t = repoSettingsText(r, "me/demo");
  assert.match(t, /^REPO SETTINGS MISSING/);
  for (const m of [/merge commits/, /rebase merging/, /auto-merge is off/, /delete head branches/, /NO ruleset on main/]) assert.match(t, m);
  assert.match(t, /leave merging to the App Creator/);
});

test("repo-settings: a ruleset without a named check, a wrong default branch and unreadable fields are each reported", () => {
  const onlyHealth = [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "health" }] } }];
  assert.match(repoSettingsText(repoSettingsReport({ repo: goodRepo, rules: onlyHealth }), "r/x"), /does not require the check "CI gate"/);
  assert.equal(repoSettingsReport({ repo: goodRepo, rules: onlyHealth }, { checks: "health" }).ok, true); // discovery: health only
  assert.match(repoSettingsText(repoSettingsReport({ repo: { ...goodRepo, default_branch: "master" }, rules: goodRules }), "r/x"), /default branch is "master"/);
  const hidden = { ...goodRepo };
  delete hidden.allow_auto_merge;
  const u = repoSettingsReport({ repo: hidden, rules: goodRules });
  assert.equal(u.ok, false);
  assert.match(repoSettingsText(u, "r/x"), /^REPO SETTINGS NOT CONFIRMED.*allow_auto_merge/);
});

test("project-report: says the app is not set up until the settings are verified; admin-checklist can leave the repo clicks out", () => {
  const tpl = readFileSync("plugins/studio/templates/project-instructions.md", "utf8");
  const models = readFileSync("plugins/studio/skills/harness-sync/harness.md", "utf8");
  assert.match(projectReport({ name: "Demo", repo: "me/demo", template: tpl, checklist: "C", models }), /^\*\*SETUP NOT COMPLETE/);
  assert.match(projectReport({ name: "Demo", repo: "me/demo", template: tpl, checklist: "C", models, settingsVerified: true }), /^\*\*Repo settings: verified from GitHub/);
  assert.doesNotMatch(adminChecklist({ repo: "me/demo", repoSettings: false }), /Allow auto-merge|ruleset/i);
  assert.equal(adminChecklist({ repo: "me/demo", repoSettings: false }), "Nothing for the Admin to do.");
  assert.match(adminChecklist({ repo: "me/demo" }), /read the settings back from GitHub/);
});

test("repo-settings: ruleset must restrict deletions, block force pushes and not require up-to-date branches", () => {
  const bare = [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "CI gate" }, { context: "health" }] } }];
  const t = repoSettingsText(repoSettingsReport({ repo: goodRepo, rules: bare }), "r/x");
  for (const m of [/restrict deletions/, /block force pushes/, /up to date/]) assert.match(t, m);
});

test("repo-settings CLI: --from file, exit code, and the phase picks the checks", () => {
  const dir = mkdtempSync(join(tmpdir(), "rs-"));
  const script = resolve("plugins/studio/hooks/app-setup.mjs");
  const onlyHealth = [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "health" }] } }];
  writeFileSync(join(dir, "s.json"), JSON.stringify({ repo: goodRepo, rules: onlyHealth }));
  const run = (cwd) => spawnSync("node", [script, "repo-settings", "--repo", "me/demo", "--from", join(dir, "s.json")], { cwd, encoding: "utf8" });
  const build = run(dir); // no CLAUDE.md: the default needs CI gate too
  assert.equal(build.status, 1);
  assert.match(build.stdout, /MISSING.*\n.*"CI gate"/s);
  writeFileSync(join(dir, "CLAUDE.md"), "## App profile\n\n| Field | Value |\n|---|---|\n| Phase | `discovery` |\n");
  const disc = run(dir);
  assert.equal(disc.status, 0);
  assert.match(disc.stdout, /^REPO SETTINGS OK/);
});

test("repo-settings: NOT CONFIRMED carries the auto-merge fallback, and the clicks mention CI gate at start building", () => {
  const hidden = { ...goodRepo };
  delete hidden.allow_auto_merge;
  assert.match(repoSettingsText(repoSettingsReport({ repo: hidden, rules: goodRules }), "r/x"), /enable_pr_auto_merge.*confirmed by behaviour.*not by reading the settings/);
  assert.match(adminChecklist({ repo: "me/demo", checks: "health" }), /at "start building", the ruleset needs the `CI gate` check added too/);
  assert.doesNotMatch(adminChecklist({ repo: "me/demo" }), /at "start building"/);
  assert.match(repoSettingsText(repoSettingsReport({ repo: hidden, rules: goodRules }), "r/x"), /re-run the bootstrap PR's CI/);
});
