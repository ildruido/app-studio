import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "coherence-lint.mjs");
const skill = (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n`;

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "coh-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, dirname(p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}
const run = (files) => {
  const r = spawnSync(process.execPath, [script], { env: { ...process.env, COHERENCE_ROOT: tree(files) }, encoding: "utf8" });
  return { code: r.status, out: r.stderr + r.stdout };
};
const good = {
  "plugins/studio/skills/alpha/SKILL.md": skill("alpha", "Do alpha things - when asked."),
  "README.md": "Skills: `alpha`.",
  "plugins/studio/templates/CLAUDE.md": "Harness: skills `alpha`.",
  "scripts/studio-sync.mjs": 'if (opts.cmd === "health") {}',
};

test("a coherent tree passes", () => assert.equal(run(good).code, 0));
test("the real repo passes", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
test("skill name must match its folder", () => {
  const r = run({ ...good, "plugins/studio/skills/alpha/SKILL.md": skill("beta", "x") });
  assert.equal(r.code, 1); assert.match(r.out, /differs from folder/);
});
test('description with ": " fails', () => {
  const r = run({ ...good, "plugins/studio/skills/alpha/SKILL.md": skill("alpha", "Use for: things") });
  assert.equal(r.code, 1); assert.match(r.out, /": "/);
});
test("long description fails", () => {
  const r = run({ ...good, "plugins/studio/skills/alpha/SKILL.md": skill("alpha", "x".repeat(501)) });
  assert.equal(r.code, 1); assert.match(r.out, /501 characters/);
});
test("a skill missing from README or template fails", () => {
  const r = run({ ...good, "plugins/studio/skills/beta/SKILL.md": skill("beta", "Beta.") });
  assert.equal(r.code, 1); assert.match(r.out, /README does not list skill\(s\): beta/); assert.match(r.out, /template CLAUDE.md does not list/);
});
test("old persona name fails, the roadmap leftover is allowed", () => {
  assert.equal(run({ ...good, "docs/x.md": "Ask Ale first." }).code, 1);
  assert.equal(run({ ...good, "packs/roadmap/starter/a.ts": "ownerIsAle = /^Ale's /" }).code, 0);
  assert.equal(run({ ...good, "docs/archive/old.md": "Ale" }).code, 0);
});
test("studio-only wording in a shipped skill fails", () => {
  const r = run({ ...good, "plugins/studio/skills/alpha/SKILL.md": skill("alpha", "x") + "Add the label owner-ok.\n" });
  assert.equal(r.code, 1); assert.match(r.out, /studio-only wording/);
});
test("unknown studio-sync command fails", () => {
  const r = run({ ...good, "docs/y.md": "run `node studio-sync.mjs frobnicate`" });
  assert.equal(r.code, 1); assert.match(r.out, /unknown studio-sync command "frobnicate"/);
  assert.equal(run({ ...good, "docs/y.md": "run `node studio-sync.mjs health`" }).code, 0);
});

// Helper agents load the app's CLAUDE.md into their context at start-up (Claude Code docs, "What loads at startup"),
// so an agent that tells itself to read it again pays for the same text twice.
test("an agent that re-reads CLAUDE.md fails", () => {
  const r = run({ ...good, "plugins/studio/agents/qa.md": "---\nname: qa\n---\nRead `CLAUDE.md` first, above all the App profile.\n" });
  assert.equal(r.code, 1); assert.match(r.out, /agents\/qa\.md:4.*already in context/);
});
test("an agent that uses CLAUDE.md from its context passes", () => {
  const r = run({ ...good, "plugins/studio/agents/qa.md": "---\nname: qa\n---\nThe App profile in `CLAUDE.md` is already in your context.\n" });
  assert.equal(r.code, 0, r.out);
});
test("the shipped agents do not re-read CLAUDE.md", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
