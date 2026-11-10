#!/usr/bin/env node
// Fails when the shared core names a particular app or stack detail that belongs in an
// app's App profile or in a stack pack, or when a stack pack names a particular app.
// Run: node scripts/core-lint.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["plugins/studio"];
// Stack packs may name their stack (that is their job) but never an app.
const PACKS = ["packs"];
const APP = [
  [/chess|stockfish|\bfen\b|\bpgn\b/i, "an app's subject"],
  [/\bCC-\d|chess-coach/i, "an app's ids or repo"],
  [/coach/i, "an app's naming (a pack's AI endpoint and tables are called ai)"],
];
const STACK = [
  [/window\.claude|claude\.use\(|\b16 ?MB\b|single-?file|\bLab\b|build:lab|dist-lab|modelTier|render\.com|\bRender\b/, "a stack detail"],
  [/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]{8,}/, "a specific artifact link"],
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
scan(CORE, [...APP, ...STACK]);
scan(PACKS, APP, [[PLACEHOLDER, "an unknown placeholder (only {{slug}} and {{title}})"]]);
if (hits.length) {
  console.error(`Core names app or stack details, or a pack names an app (move them to an App profile or a stack pack):\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("Core is generic; packs name no app.");
