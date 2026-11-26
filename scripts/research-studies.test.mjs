// The research module's study numbering and index rows (packs/research/managed/studies.mjs).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addRow, nextId, setVerdict, slugOf } from "../packs/research/managed/studies.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = join(root, "packs/research");
const script = join(pack, "managed/studies.mjs");
const starter = readFileSync(join(pack, "starter/docs/research/studies.md"), "utf8");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const run = (cwd, ...args) => spawnSync("node", [script, ...args], { cwd, encoding: "utf8" });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "studies-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  return dir;
}

test("ids: the highest number wins, in rows, links and folder names; an id inside a title is not one", () => {
  assert.equal(nextId([""]), "R-001");
  assert.equal(nextId(["| R-002 | x |", "R-009-some-study\nR-004-other"]), "R-010");
  assert.equal(nextId(["| R-002 | [Pricing the R-10 plan](R-002-pricing/protocol.md) | Generic | light | see R-077 |"]), "R-003");
  assert.equal(nextId(["docs/research/R-012-x/protocol.md"]), "R-013");
  assert.equal(nextId(["PR-120 and XR-77 are not study ids", "R-001"]), "R-002");
});

test("slug: lower case, hyphens, cut at a word", () => {
  assert.equal(slugOf("Who pays for it? (first look, 2026)"), "who-pays-for-it-first-look-2026");
  assert.equal(slugOf("Città più grandi"), "citta-piu-grandi");
  const long = slugOf("Do small organisations already pay for comparable scheduling help today");
  assert.ok(long.length <= 40 && !long.endsWith("-"), long);
  assert.throws(() => slugOf("???"), /at least one letter/);
});

test("add: a row in the starter index, cells kept safe, bad input refused", () => {
  const md = addRow(starter, { id: "R-001", title: "Market | size [first]", slug: "market-size", type: "Market size", tier: "standard" });
  assert.match(md, /\| R-001 \| \[Market \\\| size first\]\(R-001-market-size\/protocol\.md\) \| Market size \| standard \| In progress \|\n$/);
  const two = addRow(md, { id: "R-002", title: "Second", slug: "second", type: "Generic", tier: "light" });
  assert.ok(two.indexOf("| R-001 |") < two.indexOf("| R-002 |"), "rows stay in id order");
  assert.throws(() => addRow(two, { id: "R-002", title: "Again", slug: "again", type: "Generic", tier: "light" }), /already in/);
  assert.throws(() => addRow(starter, { id: "R-001", title: "T", slug: "t", type: "Generic", tier: "huge" }), /--tier/);
  assert.throws(() => addRow(starter, { id: "R-001", title: "T", slug: "t", tier: "light" }), /--type/);
  assert.throws(() => addRow(starter, { id: "R-001", title: "T", slug: "Bad Slug", type: "Generic", tier: "light" }), /--slug/);
  const later = addRow(`${two}\nNotes the app added:\n\n| Term | Meaning |\n| --- | --- |\n| SAM | reachable market |\n`, { id: "R-003", title: "Third", slug: "third", type: "Generic", tier: "light" });
  assert.match(later, /\| R-002 \|.*\n\| R-003 \|.*\n\nNotes the app added:/, "the row joins the index table, not a later table of the app");
  assert.match(addRow(null, { id: "R-001", title: "T", slug: "t", type: "Generic", tier: "deep" }), /^# Research studies[\s\S]*\| R-001 \|/, "a missing index is made");
});

test("verdict: only that row's last cell changes", () => {
  let md = addRow(starter, { id: "R-001", title: "First \\| one", slug: "first", type: "Generic", tier: "light" });
  md = addRow(md, { id: "R-002", title: "Second", slug: "second", type: "Generic", tier: "deep" });
  const out = setVerdict(md, "R-001", "Reshape (H2 contradicted | medium)");
  assert.match(out, /\| R-001 \| \[First \\\\\| one\]\(R-001-first\/protocol\.md\) \| Generic \| light \| Reshape \(H2 contradicted \\\| medium\) \|/);
  assert.match(out, /\| R-002 \| .* \| In progress \|/);
  assert.throws(() => setVerdict(md, "R-007", "Stop"), /not in/);
  assert.throws(() => setVerdict(md, "R-001", " "), /empty/);
});

test("command line: ids count the remote branches, so two threads don't collide", () => {
  const origin = repo();
  mkdirSync(join(origin, "docs/research"), { recursive: true });
  writeFileSync(join(origin, "docs/research/studies.md"), starter);
  git(origin, "add", "-A");
  git(origin, "commit", "-qm", "start");
  const a = mkdtempSync(join(tmpdir(), "studies-a-"));
  const b = mkdtempSync(join(tmpdir(), "studies-b-"));
  try {
    git(tmpdir(), "clone", "-q", origin, a);
    git(tmpdir(), "clone", "-q", origin, b);
    for (const d of [a, b]) {
      git(d, "config", "user.email", "t@example.com");
      git(d, "config", "user.name", "t");
    }
    assert.equal(run(a, "next", "--fetch").stdout.trim(), "R-001");
    const first = run(a, "add", "Do they pay today?", "--type", "User reality check", "--tier", "standard", "--fetch");
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^R-001 added .*docs\/research\/R-001-do-they-pay-today\//);
    git(a, "checkout", "-qb", "study-a");
    git(a, "add", "-A");
    git(a, "commit", "-qm", "study");
    git(a, "push", "-q", "origin", "study-a");
    // Thread b has never seen that branch: only --fetch shows it the id is taken.
    assert.equal(run(b, "next").stdout.trim(), "R-001");
    const second = run(b, "add", "How big is it", "--type", "Market size", "--tier", "deep", "--slug", "size", "--fetch");
    assert.match(second.stdout, /^R-002 added .*docs\/research\/R-002-size\//);
    // A study folder on a branch counts even when its index row is missing there.
    mkdirSync(join(a, "docs/research/R-005-orphan"), { recursive: true });
    writeFileSync(join(a, "docs/research/R-005-orphan/protocol.md"), "# R-005\n");
    git(a, "add", "-A");
    git(a, "commit", "-qm", "orphan");
    git(a, "push", "-q", "origin", "study-a");
    assert.equal(run(b, "next", "--fetch").stdout.trim(), "R-006");
    const v = run(b, "verdict", "R-002", "Needs primary research");
    assert.equal(v.status, 0, v.stderr);
    assert.match(readFileSync(join(b, "docs/research/studies.md"), "utf8"), /\| R-002 \| \[How big is it\]\(R-002-size\/protocol\.md\) \| Market size \| deep \| Needs primary research \|/);
    assert.equal(run(b, "verdict", "R-009", "Stop").status, 1);
    assert.equal(run(b, "nonsense").status, 1);
  } finally {
    for (const d of [origin, a, b]) rmSync(d, { recursive: true, force: true });
  }
});

test("command line: works outside git and makes the index when it is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "studies-plain-"));
  try {
    const out = run(dir, "add", "First look", "--type", "Generic", "--tier", "light");
    assert.equal(out.status, 0, out.stderr);
    assert.ok(existsSync(join(dir, "docs/research/studies.md")));
    assert.equal(run(dir, "next").stdout.trim(), "R-002");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the real module installs in an app with no stack, the installed script runs there, and remove takes it out", () => {
  const tmp = mkdtempSync(join(tmpdir(), "studies-app-"));
  const studio = join(tmp, "app-studio");
  const app = join(tmp, "my-app");
  const env = { ...process.env, STUDIO_USER_SETTINGS: join(tmp, "home/.claude/settings.json") };
  const sync = (...args) => spawnSync("node", [join(studio, "scripts/studio-sync.mjs"), ...args, "--app", app], { encoding: "utf8", env });
  try {
    for (const d of ["plugins", "scripts"]) cpSync(join(root, d), join(studio, d), { recursive: true });
    cpSync(pack, join(studio, "packs/research"), { recursive: true });
    mkdirSync(app);
    assert.equal(sync("install").status, 0);
    writeFileSync(join(app, "CLAUDE.md"), "# Demo\n\n## App profile\n\n| Field | Value |\n| --- | --- |\n| App | Demo |\n| Phase | discovery |\n| Id prefix | `DM` |\n| Repo | https://github.com/o/demo |\n| Stack | TBD |\n| AI | TBD |\n| Access model | TBD |\n| Storage shape | TBD |\n\n## Roles\n");
    const add = sync("pack", "add", "research");
    assert.equal(add.status, 0, add.stderr + add.stdout);
    const got = [
      ".claude/skills/research/SKILL.md",
      ".claude/skills/research/external-research.md",
      ".claude/agents/research-skeptic.md",
      ".claude/packs/research/FRAMEWORK.md",
      ".claude/packs/research/protocol-template.md",
      ".claude/packs/research/report-template.md",
      ".claude/packs/research/sizing-sheet-template.md",
      ".claude/packs/research/competitor-entry-template.md",
      ".claude/packs/research/studies.mjs",
    ];
    for (const f of [...got, "docs/research/studies.md"]) assert.ok(existsSync(join(app, f)), f);
    assert.ok(!existsSync(join(app, "package.json")), "no package.json is made");
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(app, ".claude/studio/lock.json"), "utf8")).packs), ["research"], "no base pack comes with it");
    assert.doesNotMatch(sync("health").stdout, /research/, "health has nothing to say about the module");
    const study = spawnSync("node", [".claude/packs/research/studies.mjs", "add", "A first study", "--type", "Generic", "--tier", "light"], { cwd: app, encoding: "utf8" });
    assert.match(study.stdout, /^R-001 added/, study.stderr);
    assert.equal(sync("pull").status, 0);
    const rm = sync("pack", "remove", "research");
    assert.equal(rm.status, 0, rm.stderr + rm.stdout);
    for (const f of got) assert.ok(!existsSync(join(app, f)), `${f} removed`);
    assert.match(readFileSync(join(app, "docs/research/studies.md"), "utf8"), /R-001/, "the app keeps its studies");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// The module must stay generic and self-contained: what it ships names no product, no outside
// tool brand and no real study, and every file it points at exists.
const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
test("the module's files point only at files it ships", () => {
  const shipped = new Set([
    ...files(join(pack, "managed")).map((f) => `.claude/packs/research/${f.slice(join(pack, "managed").length + 1)}`),
    ...files(join(pack, "skills")).map((f) => `.claude/skills/${f.slice(join(pack, "skills").length + 1)}`),
    ...files(join(pack, "agents")).map((f) => `.claude/agents/${f.slice(join(pack, "agents").length + 1)}`),
  ]);
  for (const f of files(pack)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\.claude\/(?:packs\/research|skills\/research|agents)\/[A-Za-z0-9._/-]*[A-Za-z0-9]/g)) assert.ok(shipped.has(m[0]), `${f} points at ${m[0]}, which the module does not ship`);
    if (f.includes("/skills/research/")) for (const m of text.matchAll(/\]\(([a-z-]+\.md)\)/g)) assert.ok(existsSync(join(pack, "skills/research", m[1])), `${f} links ${m[1]}`);
  }
});

test("the skill is one skill with five branches, and no study id from a real project ships", () => {
  assert.deepEqual(readdirSync(join(pack, "skills")), ["research"], "one skill; the kinds of study are branches, not skills");
  assert.deepEqual(readdirSync(join(pack, "skills/research")).sort(), ["SKILL.md", "competitive-analysis.md", "competitor-scan.md", "external-research.md", "market-size.md", "user-reality-check.md"]);
  for (const f of files(pack)) {
    if (f.endsWith("pack.json")) continue;
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /\b[RDH]-0\d\d\b|\bproduct owner\b|\binception\b|\bdiscovery (phase|artifact|profile)\b|\bpersonas?\b/i, `${f} carries a real id or another project's vocabulary`);
  }
});
