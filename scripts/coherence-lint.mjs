#!/usr/bin/env node
// The cheap, automatic part of the skills coherence check (the judgement part is docs/COHERENCE-REVIEW.md).
// Fails on drift that is checkable without reading for meaning:
//   1. each skill's front matter: name = folder, one-line description, short, no ": " (the core's skills and
//      the ones a module ships in packs/<name>/skills/; a module's agents: name = file, a description)
//   2. README and the app template list every skill in plugins/studio/skills/; a module's skills and agents
//      are listed in that module's managed/STACK.md instead
//   7. no two of the core and the modules ship a skill or an agent under one name
//   3. the old persona name "Ale" in shipped files or current docs (the personas are App-Studio Owner,
//      App Creator, Tester, Admin); known leftovers are listed in ALLOW with a reason
//   4. studio-only vocabulary (owner-ok, tier:owner, release-check ...) inside shipped skills/templates/packs
//   6. agents never tell themselves to read CLAUDE.md (Claude Code already loads it into a custom agent's context)
//   5. `studio-sync.mjs <command>` mentioned in shipped files or docs must be a command the tool has
//   8. a model name in prose: shipped and current docs name roles ("the review model"); only the "Models" table in
//      harness-sync/harness.md and `model:` front matter name a model, and every pinned model is in that table
//   9. a pointer to a section of the app's CLAUDE.md (`CLAUDE.md "Git workflow"`) in a shipped file names a heading the
//      template has (sections moved to harness.md kept stale pointers; found by the 2026-11-27 coherence review)
//  10. a model described by strength ("a strong model", "the strongest model the session offers") in a shipped file:
//      use one of the three roles, so the "Models" table decides which model that is
// Run: node scripts/coherence-lint.mjs      (COHERENCE_ROOT lets the test run it over a planted tree)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.COHERENCE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_DESC = 500;

// Known leftovers, each with its reason. Remove an entry when the file is fixed.
const ALLOW = [
  [/^packs\/roadmap\/starter\//, /\bAle\b/, "roadmap pack still uses Ale as a status name; left for a product decision (changelog 0.24.8)"],
];

const walk = (dir) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? (["node_modules", "archive", "__pycache__", ".git"].includes(n) ? [] : walk(p)) : [p];
      });
const rel = (f) => relative(root, f).replaceAll("\\", "/");
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const textFiles = (dirs) => dirs.flatMap((d) => walk(join(root, d))).filter((f) => /\.(md|mjs|ts|json|yml|yaml|sh)$/.test(f) && rel(f) !== "docs/CHANGELOG-legacy.md"); // the frozen history is not re-linted

const hits = [];
const hit = (where, what) => hits.push(`${where}: ${what}`);

// 1. skills (the core's, then each module's) and a module's agents
const ls = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).sort() : []);
const folders = (d) => ls(d).filter((n) => statSync(join(root, d, n)).isDirectory());
const skills = folders("plugins/studio/skills");
const packs = folders("packs");
const packSkills = packs.flatMap((p) => folders(`packs/${p}/skills`).map((s) => ({ pack: p, name: s, file: `packs/${p}/skills/${s}/SKILL.md` })));
const packAgents = packs.flatMap((p) => ls(`packs/${p}/agents`).filter((n) => n.endsWith(".md")).map((n) => ({ pack: p, name: n.slice(0, -3), file: `packs/${p}/agents/${n}` })));
const checkFrontMatter = (file, expected, what) => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(read(file));
  if (!fm) return hit(file, "no front matter");
  const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1].trim();
  const desc = /^description:\s*(.+)$/m.exec(fm[1])?.[1].trim();
  if (name !== expected) hit(file, `name "${name}" differs from ${what} "${expected}"`);
  if (!desc) hit(file, "no one-line description");
  else {
    if (desc.length > MAX_DESC) hit(file, `description is ${desc.length} characters (max ${MAX_DESC})`);
    if (desc.includes(": ")) hit(file, 'description contains ": " (plain YAML breaks; use " - ")');
  }
};
for (const s of skills) checkFrontMatter(`plugins/studio/skills/${s}/SKILL.md`, s, "folder");
for (const s of packSkills) checkFrontMatter(s.file, s.name, "folder");
for (const a of packAgents) checkFrontMatter(a.file, a.name, "file");

// 2. skill lists
for (const [file, label] of [["README.md", "README"], ["plugins/studio/templates/CLAUDE.md", "the app template CLAUDE.md"]]) {
  const text = read(file);
  const missing = skills.filter((s) => !text.includes(`\`${s}\``));
  if (missing.length) hit(file, `${label} does not list skill(s): ${missing.join(", ")}`);
}

for (const p of packs) {
  const mine = [...packSkills.filter((s) => s.pack === p).map((s) => ["skill", s.name]), ...packAgents.filter((a) => a.pack === p).map((a) => ["agent", a.name])];
  if (!mine.length) continue;
  const file = `packs/${p}/managed/STACK.md`;
  const text = read(file);
  const missing = mine.filter(([kind, n]) => !text.includes(`\`${n}\``) && !text.includes(kind === "skill" ? `.claude/skills/${n}/` : `.claude/agents/${n}.md`));
  if (missing.length) hit(file, `the module's STACK.md does not list its ${missing.map(([kind, n]) => `${kind} ${n}`).join(", ")}`);
}

// 7. one name, one owner
for (const [kind, core, shipped] of [
  ["skill", skills, packSkills],
  ["agent", ls("plugins/studio/agents").filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3)), packAgents],
]) {
  const owner = new Map(core.map((n) => [n, "the core"]));
  for (const s of shipped) {
    if (owner.has(s.name)) hit(s.file, `${kind} name "${s.name}" is already shipped by ${owner.get(s.name)}`);
    else owner.set(s.name, `the ${s.pack} pack`);
  }
}

// 3. old persona name
for (const f of [...textFiles(["plugins", "packs", "docs"]), join(root, "README.md")]) {
  const r = rel(f);
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (!/\bAle\b/.test(line)) return;
    if (ALLOW.some(([p, re]) => p.test(r) && re.test(line))) return;
    hit(`${r}:${i + 1}`, `old persona name "Ale" (use App-Studio Owner, App Creator, Tester or Admin): ${line.trim().slice(0, 100)}`);
  });
}

// 4. studio-only vocabulary in what apps get
const STUDIO_ONLY = /owner-ok|tier:owner|ALL_NEED_OWNER|release-check\.mjs|scripts\/tier\.mjs/;
for (const f of textFiles(["plugins", "packs"])) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (STUDIO_ONLY.test(line) && !/core-lint|packs\/README/.test(rel(f)))
      hit(`${rel(f)}:${i + 1}`, `studio-only wording in a file apps receive: ${line.trim().slice(0, 100)}`);
  });
}

// 5. commands that exist
const tool = read("scripts/studio-sync.mjs");
const commands = new Set([...tool.matchAll(/opts\.cmd === "([a-z-]+)"/g)].map((m) => m[1]));
if (commands.size)
  for (const f of [...textFiles(["plugins", "docs"]), join(root, "README.md")]) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/studio-sync\.mjs\s+([a-z][a-z-]+)/g))
        if (!commands.has(m[1])) hit(`${rel(f)}:${i + 1}`, `unknown studio-sync command "${m[1]}"`);
    });
  }

// 6. agents must not re-read CLAUDE.md
for (const f of [...textFiles(["plugins/studio/agents"]), ...packAgents.map((a) => join(root, a.file))]) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/\b(read|open|cat)\b[^.\n]*CLAUDE\.md/i.test(line) && !/already in (your )?context/i.test(line))
      hit(`${rel(f)}:${i + 1}`, `agent re-reads CLAUDE.md, which is already in context at start-up: ${line.trim().slice(0, 100)}`);
  });
}

// 8. model names live in one table and in front matter
const MODELS_FILE = "plugins/studio/skills/harness-sync/harness.md";
const MODEL_NAME = /\b(opus|sonnet|haiku|fable)\b/i;
// Files that name a model for another reason, each with that reason.
const MODEL_ALLOW = [
  [/^docs\/governance\/model-review\.md$/, "the log of model reviews names the models each one tested"],
  [/^packs\/ai-web\/(managed|starter)\//, "the models an app's own AI feature calls, not the models threads run on"],
  [/^docs\/(wiki|audits)\//, "human pages and dated audit records are not rules"],
];
const frontMatter = (lines) => (lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1);
const tableModels = new Set();
{
  const lines = read(MODELS_FILE).split("\n");
  const start = lines.findIndex((l) => /^## Models\s*$/.test(l));
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && /^## /.test(l));
  const section = start < 0 ? [] : lines.slice(start, end < 0 ? lines.length : end);
  for (const l of section) {
    const m = /^\|\s*(the [a-z ]+ model)\s*\|\s*([^|]+?)\s*\|/.exec(l);
    if (m) tableModels.add(m[2].toLowerCase());
  }
  if (existsSync(join(root, MODELS_FILE)) && !tableModels.size) hit(MODELS_FILE, 'no "## Models" table that maps a role ("the ... model") to a model');
  for (const f of [...textFiles(["plugins", "packs", "docs"]), join(root, "README.md")].filter((f) => f.endsWith(".md") && existsSync(f))) {
    if (MODEL_ALLOW.some(([path]) => path.test(rel(f)))) continue;
    const all = readFileSync(f, "utf8").split("\n");
    const fmEnd = frontMatter(all);
    all.forEach((line, i) => {
      if (i < fmEnd && /^model:/.test(line)) {
        const pinned = line.slice(6).trim().toLowerCase();
        if (pinned !== "inherit" && tableModels.size && !tableModels.has(pinned)) hit(`${rel(f)}:${i + 1}`, `pins the model "${pinned}", which the "Models" table in ${MODELS_FILE} does not list`);
        return;
      }
      if (rel(f) === MODELS_FILE && i > start && (end < 0 || i < end) && /^\s*\|/.test(line)) return; // only the table's own rows
      if (MODEL_NAME.test(line)) hit(`${rel(f)}:${i + 1}`, `names a model in prose; name the role ("the standard thread model", "the review model", "the strongest model") and keep the name in the "Models" table of ${MODELS_FILE}: ${line.trim().slice(0, 100)}`);
    });
  }
}

// 9. pointers into the app's CLAUDE.md name a heading the template has
{
  const headings = new Set([...read("plugins/studio/templates/CLAUDE.md").matchAll(/^#{2,3} (.+?)\s*$/gm)].map((m) => m[1]));
  if (headings.size)
    for (const f of textFiles(["plugins", "packs"]).filter((f) => f.endsWith(".md"))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/CLAUDE\.md`?,? ?\(?"([^"]+)"/g))
          if (!headings.has(m[1])) hit(`${rel(f)}:${i + 1}`, `points to CLAUDE.md "${m[1]}", a section the app template does not have (name the file that holds it)`);
      });
    }
}

// 10. a model is named by its role, never by its strength
const BY_STRENGTH = /\b(?:strong|stronger|weaker|cheaper|bigger|smaller|faster) model\b|\bstrongest model (?:the session|available|on offer)/i;
for (const f of textFiles(["plugins", "packs"]).filter((f) => f.endsWith(".md"))) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (BY_STRENGTH.test(line)) hit(`${rel(f)}:${i + 1}`, `describes a model by strength; name the role ("the standard thread model", "the review model", "the strongest model"): ${line.trim().slice(0, 100)}`);
  });
}

if (hits.length) {
  console.error(`Coherence lint found drift:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`Coherence lint passed (${skills.length} skills, ${packSkills.length} in modules).`);
