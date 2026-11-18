#!/usr/bin/env node
// The cheap, automatic part of the skills coherence check (the judgement part is docs/COHERENCE-REVIEW.md).
// Fails on drift that is checkable without reading for meaning:
//   1. each skill's front matter: name = folder, one-line description, short, no ": "
//   2. README and the app template list every skill in plugins/studio/skills/
//   3. the old persona name "Ale" in shipped files or current docs (the personas are App-Studio Owner,
//      App Creator, Tester, Admin); known leftovers are listed in ALLOW with a reason
//   4. studio-only vocabulary (owner-ok, tier:owner, release-check ...) inside shipped skills/templates/packs
//   5. `studio-sync.mjs <command>` mentioned in shipped files or docs must be a command the tool has
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
const textFiles = (dirs) => dirs.flatMap((d) => walk(join(root, d))).filter((f) => /\.(md|mjs|ts|json|yml|yaml|sh)$/.test(f));

const hits = [];
const hit = (where, what) => hits.push(`${where}: ${what}`);

// 1. skills
const skillsDir = join(root, "plugins/studio/skills");
const skills = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory()).sort() : [];
for (const s of skills) {
  const file = `plugins/studio/skills/${s}/SKILL.md`;
  const fm = /^---\n([\s\S]*?)\n---/.exec(read(file));
  if (!fm) { hit(file, "no front matter"); continue; }
  const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1].trim();
  const desc = /^description:\s*(.+)$/m.exec(fm[1])?.[1].trim();
  if (name !== s) hit(file, `name "${name}" differs from folder "${s}"`);
  if (!desc) hit(file, "no one-line description");
  else {
    if (desc.length > MAX_DESC) hit(file, `description is ${desc.length} characters (max ${MAX_DESC})`);
    if (desc.includes(": ")) hit(file, 'description contains ": " (plain YAML breaks; use " - ")');
  }
}

// 2. skill lists
for (const [file, label] of [["README.md", "README"], ["plugins/studio/templates/CLAUDE.md", "the app template CLAUDE.md"]]) {
  const text = read(file);
  const missing = skills.filter((s) => !text.includes(`\`${s}\``));
  if (missing.length) hit(file, `${label} does not list skill(s): ${missing.join(", ")}`);
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

if (hits.length) {
  console.error(`Coherence lint found drift:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`Coherence lint passed (${skills.length} skills).`);
