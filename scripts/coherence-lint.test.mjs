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
