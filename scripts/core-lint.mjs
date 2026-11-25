#!/usr/bin/env node
// Fails when the shared core names a particular app or stack detail that belongs in an
// app's App profile or in a stack pack, or when a stack pack names a particular app.
// Run: node scripts/core-lint.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// CORE_LINT_ROOT lets the test run this lint over a small planted tree.
const root = process.env.CORE_LINT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["plugins/studio"];
// Stack packs may name their stack (that is their job: window.claude, modelTier, Render,
// the 16 MB limit) but never an app, nor an app's own build names (Lab, dist-lab).
const PACKS = ["packs"];
const APP = [
  [/chess|stockfish|\bfen\b|\bpgn\b/i, "an app's subject"],
  [/\bCC-\d|chess-coach/i, "an app's ids or repo"],
  [/coach/i, "an app's naming (a pack's AI endpoint and tables are called ai)"],
];
// One app's own names: banned in the core and in packs alike.
const APP_STACK = [
  [/\bLab\b|build:lab|dist-lab/, "one app's build name (e.g. Lab-style)"],
  [/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]{8,}/, "a specific artifact link"],
];
// Stack details a pack legitimately names; banned only in the core.
const STACK = [
  [/window\.claude|claude\.use\(|\b16 ?MB\b|single-?file|modelTier|render\.com|\bRender\b/, "a stack detail"],
];
const PLACEHOLDER = /(?<!\$)\{\{(?!slug\}\}|title\}\})[^}]*\}\}/;

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "__pycache__" || n === "node_modules" ? [] : walk(p)) : [p];
  });

const hits = [];
const scan = (dirs, banned, extra = []) => {
  for (const file of dirs.flatMap((d) => walk(join(root, d)))) {
    // Pack starters and docs may contain template placeholders; only {{slug}} and {{title}} exist.
    const rules = [...banned, ...extra];
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const [re, what] of rules)
          if (re.test(line)) hits.push(`${relative(root, file)}:${i + 1}: ${what}: ${line.trim().slice(0, 120)}`);
      });
  }
};
scan(CORE, [...APP, ...APP_STACK, ...STACK]);
scan(PACKS, [...APP, ...APP_STACK], [[PLACEHOLDER, "an unknown placeholder (only {{slug}} and {{title}})"]]);
// Every agent and skill declares its model and effort in frontmatter (#250). `model: inherit`
// is the deliberate "this one follows the thread" choice and needs no effort.
const dirOf = (d) => { try { return readdirSync(join(root, d)); } catch { return []; } };
const declared = [
  ...dirOf("plugins/studio/agents").filter((n) => n.endsWith(".md")).map((n) => `plugins/studio/agents/${n}`),
  ...dirOf("plugins/studio/skills").map((n) => `plugins/studio/skills/${n}/SKILL.md`),
];
for (const rel of declared) {
  let text;
  try { text = readFileSync(join(root, rel), "utf8"); } catch { continue; }
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  const model = fm.match(/^model:\s*(\S+)/m)?.[1];
  if (!model) hits.push(`${rel}: no \`model:\` in frontmatter (use \`model: inherit\` on purpose)`);
  else if (model !== "inherit" && !/^effort:\s*\S+/m.test(fm)) hits.push(`${rel}: \`model: ${model}\` without \`effort:\``);
}
if (hits.length) {
  console.error(`Core names app or stack details, a pack names an app (move them to an App profile or a stack pack), or an agent or skill declares no model and effort:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("Core is generic; packs name no app.");
