import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".claude/workflows");
const data = JSON.parse(readFileSync(join(root, "docs/audits/harness-audit.json"), "utf8"));
const base = (g) => g.replace(/\/?\*.*$/, "");

test("every workflow parses and starts with a literal meta", async () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.match(src, /^export const meta = \{/, f);
    assert.match(src, /name: '[a-z-]+'/, f);
    // body uses await at top level and workflow globals: wrap it so only syntax is checked.
    const body = src.replace(/^export const meta =/, "const meta =");
    assert.doesNotThrow(() => new Function(`return async (args, agent, pipeline, parallel, log, phase) => {${body}}`), f);
  }
});

test("the audit data file points at files that exist and has the shape the workflows read", () => {
  assert.ok(data.slices.length > 0 && Array.isArray(data.rules) && data.synthesis);
  for (const s of data.slices) for (const g of s.files) {
    const p = base(g);
    if (!p.includes("*")) assert.ok(existsSync(join(root, p)), `${s.id}: ${g}`);
  }
  for (const c of data.coherence.checks) for (const g of c.files) {
    const p = base(g);
    if (!p.includes("*")) assert.ok(existsSync(join(root, p)), `${c.id}: ${g}`);
  }
});
