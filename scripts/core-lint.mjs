#!/usr/bin/env node
// Fails when the shared core names a particular app or stack detail that belongs in an
// app's App profile or in a stack pack. Run: node scripts/core-lint.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["plugins/studio", "plugins/session-usage"];
const BANNED = [
  [/chess|stockfish|\bfen\b|\bpgn\b/i, "an app's subject"],
  [/\bCC-\d|chess-coach/i, "an app's ids or repo"],
  [/window\.claude|claude\.use\(|\b16 ?MB\b|single-?file|\bLab\b|build:lab|dist-lab|modelTier|render\.com|\bRender\b/, "a stack detail"],
  [/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]{8,}/, "a specific artifact link"],
];

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "__pycache__" ? [] : walk(p)) : [p];
  });

const hits = [];
for (const file of CORE.flatMap((d) => walk(join(root, d)))) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const [re, what] of BANNED)
        if (re.test(line)) hits.push(`${relative(root, file)}:${i + 1}: ${what}: ${line.trim().slice(0, 120)}`);
    });
}
if (hits.length) {
  console.error(`Core names app or stack details (move them to an App profile or a stack pack):\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("Core is generic.");
