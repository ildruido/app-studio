// Run: node --test scripts/discovery-module.test.mjs
// The discovery module (#356): it installs in an app that has no stack, brings the research module, its
// Discovery profile is written by app-setup.mjs and checked by health only while the module is installed,
// and removing it leaves the app's documents and the research module in place.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DISCOVERY_FIELDS, SIGN_OFF_MODES, discoveryClose, discoveryProfileInit, discoveryProfileSet, docsFolder } from "../plugins/studio/hooks/app-setup.mjs";
import { discoveryNote, discoveryProfileProblems, install, readLock } from "./studio-sync.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = readFileSync(join(repo, "plugins/studio/templates/CLAUDE.md"), "utf8");
const PACK = join(repo, "packs/discovery");
const SKILLS = ["architecture-handoff", "discovery-interview", "exit-gate", "prototype", "riskiest-hypotheses"];
const tmp = mkdtempSync(join(tmpdir(), "discovery-"));
process.env.STUDIO_USER_SETTINGS = join(tmp, "home/.claude/settings.json");
let studio, app;
beforeEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  studio = join(tmp, "app-studio");
  app = join(tmp, "my-app");
  for (const d of ["plugins", "scripts", "packs"]) cpSync(join(repo, d), join(studio, d), { recursive: true });
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const run = (file, ...args) => spawnSync(process.execPath, [join(app, file), ...args], { cwd: app, encoding: "utf8" });
const sync = (...args) => run(".claude/studio/studio-sync.mjs", ...args);
const setup = (...args) => run(".claude/hooks/app-setup.mjs", ...args);
const claudeMd = () => readFileSync(join(app, "CLAUDE.md"), "utf8");
/** A discovery app: the core only, the template's CLAUDE.md with a discovery App profile. */
function discoveryApp() {
  install(app, studio);
  // The lines new-app fills by hand in discovery (domain rules, stack notes, AI public use).
  const filled = TEMPLATE.replace("- <rule>", "- None yet.").replace(/^(- \*\*(?:Build|QA|Release|Preview):\*\*) <.*>$/gm, "$1 TBD").replace(/^(\| AI public use\s+\|).*$/m, "$1 TBD |");
  writeFileSync(join(app, "CLAUDE.md"), filled);
  const init = setup("profile", "init", "--discovery", "--name", "Demo", "--prefix", "DM", "--repo", "o/demo", "User=the player", "Owner-merged repos=none");
  assert.equal(init.status, 0, init.stderr);
}

test("the pack is what the issue asks for: five skills that stop outside discovery, managed docs, starters", () => {
  assert.deepEqual(readdirSync(join(PACK, "skills")).sort(), SKILLS);
  for (const s of SKILLS) {
    const md = readFileSync(join(PACK, "skills", s, "SKILL.md"), "utf8");
    assert.match(md, new RegExp(`^name: ${s}$`, "m"));
    assert.match(md, /^model: inherit$/m);
    assert.match(md, /First run `node \.claude\/studio\/studio-sync\.mjs phase --discovery-only`/, `${s} starts with the discovery-only stop`);
    // Every branch file a skill links exists, and every branch file is linked.
    const linked = [...md.matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]);
    const files = readdirSync(join(PACK, "skills", s)).filter((f) => f !== "SKILL.md");
    assert.deepEqual([...new Set(linked)].sort(), files.sort(), `${s}: branch files`);
  }
  assert.deepEqual(readdirSync(join(PACK, "managed")).sort(), ["STACK.md", "WORKFLOW.md", "exit-criteria.md"]);
  assert.deepEqual(readdirSync(join(PACK, "starter/docs/discovery")).sort(), ["decision-log.md", "prototypes.md", "starting-idea.md", "status.md"]);
  assert.ok(!existsSync(join(PACK, "agents")), "lean: the handoff's reviewer is a briefed general agent, not a shipped one");
  assert.deepEqual(JSON.parse(readFileSync(join(PACK, "pack.json"), "utf8")).requires, ["research"]);
});

test("the default exit criteria and the status starter list the same nine rows", () => {
  const rows = (md) => [...md.matchAll(/^\| (\d+) \| ([^|]+?) \|/gm)].map((m) => `${m[1]} ${m[2].replace(/ current$/, "")}`);
  const criteria = rows(readFileSync(join(PACK, "managed/exit-criteria.md"), "utf8"));
  assert.equal(criteria.length, 9);
  assert.deepEqual(rows(readFileSync(join(PACK, "starter/docs/discovery/status.md"), "utf8")), criteria);
});

test("no skill of the module hard-codes the docs folder or leaves discovery vocabulary of the source project", () => {
  for (const s of SKILLS)
    for (const f of readdirSync(join(PACK, "skills", s))) {
      const md = readFileSync(join(PACK, "skills", s, f), "utf8");
      assert.doesNotMatch(md, /docs\/discovery\//, `${s}/${f} uses the profile's Docs folder, not a fixed path`);
      assert.doesNotMatch(md, /inception|product owner|\bH-0\d|\bD-0\d|\bR-00\d/i, `${s}/${f}`);
    }
});

test("discovery-profile init writes the section after the App profile and takes over an unused decision log", () => {
  const r = discoveryProfileInit(TEMPLATE, { product: "A timer | for cooks", users: "home cooks" }, { own: () => true });
  assert.ok(r.md.indexOf("## Discovery profile") > r.md.indexOf("### Stack notes"), "after the whole App profile");
  assert.ok(r.md.indexOf("## Discovery profile") < r.md.indexOf("## Roles"));
  assert.match(r.md, /^\| Product\s+\| A timer \\\| for cooks \|$/m);
  assert.match(r.md, /^\| Starting idea\s+\| `docs\/discovery\/starting-idea\.md` /m);
  assert.match(r.md, /^\| Docs folder\s+\| `docs\/discovery\/` \|$/m);
  assert.match(r.md, /^\| Sign-off mode\s+\| per artifact \|$/m);
  assert.match(r.md, /^\| Exit criteria\s+\| default \|$/m);
  assert.match(r.md, /^\| Prototype look and feel \| not set yet \|$/m);
  assert.equal(r.decisionLog, "docs/discovery/decision-log.md");
  assert.match(r.md, /^\| Decision log\s+\| `docs\/discovery\/decision-log\.md` \|$/m);
  assert.equal(r.md.replace(/\n## Discovery profile[\s\S]*?(?=\n## Roles)/, "").replace(/^\| Decision log.*$/m, ""), TEMPLATE.replace(/^\| Decision log.*$/m, ""), "nothing else in CLAUDE.md changes");
  for (const f of DISCOVERY_FIELDS) assert.match(r.md, new RegExp(`^\\| ${f}\\s*\\|`, "m"), f);
});

test("discovery-profile init: options, and what it refuses", () => {
  const r = discoveryProfileInit(TEMPLATE, { product: "P", users: "U", docs: "./docs/before-build", idea: "docs/idea.md", signOff: "Autonomous with record", extra: { Principles: "People first" } });
  assert.match(r.md, /^\| Docs folder\s+\| `docs\/before-build\/` \|$/m);
  assert.match(r.md, /^\| Starting idea\s+\| `docs\/idea\.md` /m);
  assert.match(r.md, /^\| Sign-off mode\s+\| autonomous with record \|$/m);
  assert.match(r.md, /^\| Principles\s+\| People first \|$/m);
  const paired = discoveryProfileInit(TEMPLATE, { product: "P", users: "U", extra: { "Docs folder": "notes/pre" } }, { own: () => true });
  assert.match(paired.md, /^\| Docs folder\s+\| `notes\/pre\/` \|$/m);
  assert.match(paired.md, /^\| Starting idea\s+\| `notes\/pre\/starting-idea\.md` /m, "a Docs folder pair moves every path with it");
  assert.equal(paired.decisionLog, "notes/pre/decision-log.md");
  assert.throws(() => discoveryProfileInit(TEMPLATE, { product: "P", users: "U", idea: "../idea.md" }), /folder inside the repo/);
  assert.equal(r.decisionLog, null, "the decision log row is left alone unless the caller says the discovery log is free to use");
  assert.match(r.md, /^\| Decision log\s+\| `docs\/PRD\.md` "Decisions"/m);
  assert.throws(() => discoveryProfileInit(r.md, { product: "P", users: "U" }), /already has a "## Discovery profile"/);
  assert.throws(() => discoveryProfileInit(TEMPLATE, { product: "P" }), /--product .* and --users .* are required/);
  assert.throws(() => discoveryProfileInit(TEMPLATE, { product: "P", users: "U", signOff: "never" }), /Sign-off mode must be "per artifact" or "autonomous with record"/);
  assert.throws(() => discoveryProfileInit(TEMPLATE, { product: "P", users: "U", extra: { App: "X" } }), /unknown Discovery profile field "App"/);
  assert.throws(() => discoveryProfileInit("# no profile\n", { product: "P", users: "U" }), /no "## App profile"/);
  for (const bad of ["/etc", "../other", "docs/../..", ""]) assert.throws(() => docsFolder(bad), /folder inside the repo/, bad);
  // An app that keeps its own decision log keeps it.
  const own = discoveryProfileInit(TEMPLATE.replace(/^\| Decision log.*$/m, "| Decision log   | `docs/decisions.md` |"), { product: "P", users: "U" }, { own: () => true });
  assert.equal(own.decisionLog, null);
});

test("discovery-profile set changes only the named rows and validates them", () => {
  const md = discoveryProfileInit(TEMPLATE, { product: "P", users: "U" }).md;
  const out = discoveryProfileSet(md, { "Domain risks": "Health claims", "Sign-off mode": "autonomous with record" });
  assert.match(out, /^\| Domain risks\s+\| Health claims \|$/m);
  assert.match(out, /^\| Sign-off mode\s+\| autonomous with record \|$/m);
  assert.match(out, /^\| Product\s+\| P \|$/m);
  assert.match(out, /^\| App\s+\| <App name>\s+\|$/m, "the App profile is not touched");
  assert.throws(() => discoveryProfileSet(md, { "Sign-off mode": "sometimes" }), /Sign-off mode must be/);
  assert.throws(() => discoveryProfileSet(md, { Stack: "web" }), /unknown Discovery profile field "Stack"/);
  assert.throws(() => discoveryProfileSet(md, { Product: " " }), /needs a value/);
  assert.throws(() => discoveryProfileSet(TEMPLATE, { Product: "P" }), /run discovery-profile init first/);
});

test("in a discovery app: pack add brings research too, health asks for the profile, init satisfies it", () => {
  discoveryApp();
  assert.equal(sync("health").status, 0, sync("health").stdout);
  const add = sync("pack", "add", "discovery");
  assert.equal(add.status, 0, add.stderr + add.stdout);
  assert.deepEqual(Object.keys(readLock(app).packs).sort(), ["discovery", "research"], "no base pack, the research module comes with it");
  assert.ok(!existsSync(join(app, "package.json")), "no package.json is made");
  for (const s of [...SKILLS, "research"]) assert.ok(existsSync(join(app, ".claude/skills", s, "SKILL.md")), s);
  assert.ok(existsSync(join(app, ".claude/skills/prototype/design-alternatives.md")));
  for (const f of ["WORKFLOW.md", "exit-criteria.md", "STACK.md"]) assert.ok(existsSync(join(app, ".claude/packs/discovery", f)), f);
  for (const f of ["status.md", "starting-idea.md", "prototypes.md", "decision-log.md"]) assert.ok(existsSync(join(app, "docs/discovery", f)), f);

  const before = sync("health");
  assert.equal(before.status, 1);
  assert.match(before.stdout, /discovery module is installed but CLAUDE\.md has no "## Discovery profile" section; write it with: node \.claude\/hooks\/app-setup\.mjs discovery-profile init/);

  const init = setup("discovery-profile", "init", "--product", "A kitchen timer that talks", "--users", "home cooks", "Domain risks=Food safety claims");
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /Decision log row now points at docs\/discovery\/decision-log\.md/);
  const ok = sync("health");
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(sync("phase", "--discovery-only").status, 0);

  // Decisions now go to the discovery log, numbered by the script.
  const dec = run(".claude/hooks/decisions.mjs", "add", "Launch in one country first", "--decision", "One country", "--why", "Budget", "--by", "App Creator");
  assert.equal(dec.status, 0, dec.stderr);
  assert.match(readFileSync(join(app, "docs/discovery/decision-log.md"), "utf8"), /^### D-001 Launch in one country first/m);
  assert.equal(sync("health").status, 0);
});

test("health names a broken Discovery profile: an empty row, an unknown sign-off mode, a docs folder that is not there", () => {
  discoveryApp();
  assert.equal(sync("pack", "add", "discovery").status, 0);
  assert.equal(setup("discovery-profile", "init", "--product", "P", "--users", "U").status, 0);
  const edit = (from, to) => writeFileSync(join(app, "CLAUDE.md"), claudeMd().replace(from, to));
  edit(/^\| Target users\s+\| U \|$/m, "| Target users   |  |");
  assert.match(sync("health").stdout, /the Discovery profile has no Target users; set it with: node \.claude\/hooks\/app-setup\.mjs discovery-profile set/);
  assert.equal(setup("discovery-profile", "set", "Target users=U").status, 0);
  edit(/^\| Sign-off mode\s+\| per artifact \|$/m, "| Sign-off mode  | whenever |");
  assert.match(sync("health").stdout, /Sign-off mode must be "per artifact" or "autonomous with record" \(it says "whenever"\)/);
  assert.equal(setup("discovery-profile", "set", "Sign-off mode=per artifact", "Docs folder=docs/elsewhere").status, 0);
  const gone = sync("health");
  assert.equal(gone.status, 1);
  assert.match(gone.stdout, /Docs folder "docs\/elsewhere\/" is not a folder in this repo/);
  mkdirSync(join(app, "docs/elsewhere"));
  assert.equal(sync("health").status, 0, sync("health").stdout);
  const refused = setup("discovery-profile", "set", "Sign-off mode=never");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Sign-off mode must be/);
});

test("init leaves the decision log alone once decisions exist; the two lists of sign-off modes agree", () => {
  discoveryApp();
  assert.equal(sync("pack", "add", "discovery").status, 0);
  mkdirSync(join(app, "docs"), { recursive: true });
  // Any D-NNN mention counts, as it does for numbering: a table row as much as a heading.
  writeFileSync(join(app, "docs/PRD.md"), "# PRD\n\n## Decisions\n\n| Id | Decision |\n| --- | --- |\n| D-001 | Something |\n");
  const init = setup("discovery-profile", "init", "--product", "P", "--users", "U");
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /Decision log row is unchanged/);
  assert.match(claudeMd(), /^\| Decision log\s+\| `docs\/PRD\.md` "Decisions"/m);
  for (const mode of SIGN_OFF_MODES) {
    assert.equal(setup("discovery-profile", "set", `Sign-off mode=${mode}`).status, 0);
    assert.deepEqual(discoveryProfileProblems(app, readLock(app)), [], mode);
  }
});

test("removing the module at the end of discovery: skills go, documents and research stay, health stops asking", () => {
  discoveryApp();
  assert.equal(sync("pack", "add", "discovery").status, 0);
  assert.equal(setup("discovery-profile", "init", "--product", "P", "--users", "U").status, 0);
  writeFileSync(join(app, "docs/discovery/mvp.md"), "# MVP\n");
  const stuck = sync("pack", "remove", "research");
  assert.equal(stuck.status, 1, "research can't go while discovery needs it");
  const rm = sync("pack", "remove", "discovery");
  assert.equal(rm.status, 0, rm.stderr + rm.stdout);
  for (const s of SKILLS) assert.ok(!existsSync(join(app, ".claude/skills", s)), `${s} removed`);
  assert.ok(!existsSync(join(app, ".claude/packs/discovery/WORKFLOW.md")));
  assert.ok(existsSync(join(app, ".claude/skills/research/SKILL.md")), "research stays");
  for (const f of ["mvp.md", "status.md", "decision-log.md", "prototypes.md"]) assert.ok(existsSync(join(app, "docs/discovery", f)), `${f} stays`);
  // The profile section may stay as history: without the module nothing checks it.
  writeFileSync(join(app, "CLAUDE.md"), claudeMd().replace(/^\| Sign-off mode.*$/m, "| Sign-off mode  | whatever |"));
  assert.equal(sync("health").status, 0, sync("health").stdout);
  assert.deepEqual(discoveryProfileProblems(app, { packs: {} }), []);
});

test("an app without the module is not asked for a Discovery profile, and the skills stop once it is building", () => {
  discoveryApp();
  assert.equal(sync("health").status, 0);
  assert.doesNotMatch(sync("health").stdout, /Discovery profile/);
  execFileSync(process.execPath, [join(app, ".claude/hooks/app-setup.mjs"), "profile", "set", "Phase=build"], { cwd: app });
  const stop = sync("phase", "--discovery-only");
  assert.equal(stop.status, 1);
  assert.match(stop.stdout, /already building/);
});

// --- #357: the modules are wired into the start of an app and into "start building" ---

test("the start-up note in discovery says the phase, exit criteria done of total and the next document", () => {
  discoveryApp();
  assert.match(discoveryNote(app), /^Phase: discovery \(no stack chosen yet\)\. Discovery ends only when the App Creator says "start building"/, "without the module: the phase only");
  assert.equal(sync("pack", "add", "discovery").status, 0);
  assert.equal(setup("discovery-profile", "init", "--product", "P", "--users", "U").status, 0);
  assert.match(discoveryNote(app), /^Phase: discovery\. Exit criteria: 0 of 9 done\. Next: Product foundation \(criterion 1, not started\); .*WORKFLOW\.md/);
  const tracker = join(app, "docs/discovery/status.md");
  const set = (n, status) => writeFileSync(tracker, readFileSync(tracker, "utf8").replace(new RegExp(`^(\\| ${n} \\|[^|]+\\|)[^|]+\\|`, "m"), `$1 ${status} |`));
  set(1, "done");
  set(2, "in progress");
  set(7, "dropped (D-004)");
  assert.match(discoveryNote(app), /Exit criteria: 1 of 8 done\. Next: Target users and personas \(criterion 2, in progress\)/, "a dropped criterion is not counted");
  // The session's start-up hook (`check --warn`) prints it, first.
  const warn = sync("check", "--warn");
  assert.equal(warn.status, 0);
  assert.match(warn.stdout, /^Phase: discovery\. Exit criteria: 1 of 8 done\./);
  for (const n of [2, 3, 4, 5, 6, 8]) set(n, "`Done`");
  assert.match(discoveryNote(app), /Exit criteria: 7 of 8 done\. Next: the exit gate report \(exit-gate skill\)/, "the decision log is never the next document");
  set(9, "done");
  assert.match(discoveryNote(app), /Exit criteria: 8 of 8 done\. Next: the exit gate report \(exit-gate skill\)/);
  writeFileSync(tracker, "# Discovery status\n");
  assert.match(discoveryNote(app), /docs\/discovery\/status\.md lists no exit criteria/, "an empty tracker is never read as ready");
  // Another docs folder is followed; a missing tracker is said, never guessed.
  assert.equal(setup("discovery-profile", "set", "Docs folder=docs/elsewhere").status, 0);
  assert.match(discoveryNote(app), /No status tracker found at docs\/elsewhere\/status\.md/);
  execFileSync(process.execPath, [join(app, ".claude/hooks/app-setup.mjs"), "profile", "set", "Phase=build"], { cwd: app });
  assert.equal(discoveryNote(app), null, "a building app gets no note");
  assert.doesNotMatch(sync("check", "--warn").stdout, /Phase: discovery/);
});

test("discovery-profile close removes the section, marks the tracker as history once, and changes nothing else", () => {
  const md = discoveryProfileInit(TEMPLATE, { product: "P", users: "U", docs: "docs/pre" }).md;
  const r = discoveryClose(md, "# Discovery status\n\nTracker.\n", "2026-11-26");
  assert.equal(r.md, TEMPLATE, "CLAUDE.md is back to what it was before the section");
  assert.equal(r.folder, "docs/pre/");
  assert.equal(discoveryClose(md.replace("| `docs/pre/` |", "| `docs/pre/` (moved) |"), null, "2026-11-26").folder, "docs/pre/", "a note after the folder is ignored, as health does");
  assert.match(r.status, /^# Discovery status\n\n> \*\*Frozen on 2026-11-26\.\*\* Discovery ended when the App Creator said "start building"\. .*`docs\/BACKLOG\.md`\.\n\nTracker\.\n$/);
  assert.equal(discoveryClose(md, r.status, "2026-12-01").status, null, "an already frozen tracker is not stamped again");
  assert.equal(discoveryClose(md, null, "2026-11-26").status, null);
  assert.throws(() => discoveryClose(TEMPLATE, null, "2026-11-26"), /no "## Discovery profile" section \(nothing to close\)/);
  // The section at the very end of the file.
  const tail = discoveryClose(`${TEMPLATE.split("\n## Roles")[0].trimEnd()}\n\n## Discovery profile\n\n| Field | Value |\n| --- | --- |\n| Docs folder | \`docs/discovery/\` |\n`, null, "2026-11-26");
  assert.equal(tail.md, `${TEMPLATE.split("\n## Roles")[0].trimEnd()}\n`);
});

test("start building: the gate still runs in discovery, then the module goes, research stays and the app is healthy in build", () => {
  discoveryApp();
  assert.equal(sync("pack", "add", "discovery").status, 0);
  assert.equal(setup("discovery-profile", "init", "--product", "P", "--users", "U").status, 0);
  writeFileSync(join(app, "docs/discovery/mvp.md"), "# MVP\n");
  assert.equal(sync("phase", "--discovery-only").status, 0, "the exit gate can run first");
  // The stack is chosen and every TBD answered (here: a static site, which needs no npm install to pass health).
  assert.equal(sync("pack", "add", "static-site", "--slug", "demo", "--title", "Demo").status, 0);
  // The Release target is read from static-site.md itself, so the skill and health cannot drift apart again (#401).
  const skillReleaseTarget = readFileSync(join(repo, "plugins/studio/skills/new-app/static-site.md"), "utf8").match(/Release target `([^`]+)`/)[1];
  const rows = ["Phase=build", "Stack=static-site", `Release target=${skillReleaseTarget}`, "Preview target=none", "Capabilities=none", "AI=off", "AI plan=none", "Access model=anyone, no login", "Storage shape=needs something else"];
  assert.equal(setup("profile", "set", ...rows).status, 0);
  writeFileSync(join(app, "CLAUDE.md"), claudeMd().replace(/^(- \*\*(?:Build|QA|Release|Preview):\*\*) TBD$/gm, "$1 see the pack").replace(/^(\| AI public use\s+\|).*$/m, "$1 not needed |"));
  assert.equal(sync("pack", "remove", "discovery").status, 0);
  const close = setup("discovery-profile", "close", "--date", "2026-11-26");
  assert.equal(close.status, 0, close.stderr);
  assert.match(close.stdout, /Discovery profile removed from CLAUDE\.md\. docs\/discovery\/status\.md is marked as history\. The documents in docs\/discovery\/ stay/);
  assert.doesNotMatch(claudeMd(), /## Discovery profile/);
  assert.match(claudeMd(), /^\| Decision log\s+\| `docs\/discovery\/decision-log\.md` \|$/m, "the decision log stays the app's log");
  assert.match(readFileSync(join(app, "docs/discovery/status.md"), "utf8"), /^> \*\*Frozen on 2026-11-26\.\*\*/m);
  assert.deepEqual(Object.keys(readLock(app).packs).sort(), ["research", "static-site"]);
  for (const f of ["mvp.md", "status.md", "decision-log.md"]) assert.ok(existsSync(join(app, "docs/discovery", f)), `${f} stays`);
  assert.ok(existsSync(join(app, ".claude/skills/research/SKILL.md")));
  assert.ok(!existsSync(join(app, ".claude/skills/exit-gate")));
  const h = sync("health");
  assert.equal(h.status, 0, h.stdout);
  assert.equal(sync("phase").stdout.trim(), "build");
  assert.equal(setup("discovery-profile", "close").status, 1, "a second close has nothing to do");
});

test("new-app, prd-intake and the templates point at the modules the way the scripts work", () => {
  const read = (f) => readFileSync(join(repo, f), "utf8");
  const path = read("plugins/studio/skills/new-app/discovery.md");
  for (const cmd of ["pack add discovery", "discovery-profile init --product", "pack remove discovery", "discovery-profile close", "exit-gate", "architecture-handoff.md"]) assert.ok(path.includes(cmd), `new-app/discovery.md: ${cmd}`);
  assert.ok(path.indexOf("exit-gate") < path.indexOf("pack remove discovery"), "the gate runs before the module is removed");
  assert.doesNotMatch(path, /pack remove (discovery )?research|pack remove research/, "research is never removed");
  const intake = read("plugins/studio/skills/prd-intake/SKILL.md");
  assert.match(intake, /\$\{CLAUDE_SKILL_DIR\}\/from-discovery\.md/);
  const branch = read("plugins/studio/skills/prd-intake/from-discovery.md");
  for (const word of ["mvp.md", "roadmap.md", "In scope", "decisions.mjs"]) assert.ok(branch.includes(word), `prd-intake/from-discovery.md: ${word}`);
  for (const f of ["plugins/studio/templates/CLAUDE.md", "plugins/studio/templates/project-instructions.md"]) {
    const line = read(f).split("\n").filter((l) => /In discovery/.test(l) && /WORKFLOW\.md/.test(l));
    assert.equal(line.length, 1, `${f}: one line for discovery`);
    assert.match(line[0], /[Oo]ne thread per discovery document or research study/);
    assert.match(line[0], /ids come from the scripts/);
  }
});
