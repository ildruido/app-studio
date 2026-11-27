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
test("an agent told to read CLAUDE.md passes (a helper agent does not get it in its context)", () => {
  const r = run({ ...good, "plugins/studio/agents/qa.md": "---\nname: qa\n---\nRead `CLAUDE.md` first, above all the App profile.\n" });
  assert.equal(r.code, 0, r.out);
});
test("an agent that uses CLAUDE.md from its context passes", () => {
  const r = run({ ...good, "plugins/studio/agents/qa.md": "---\nname: qa\n---\nThe App profile in `CLAUDE.md` is already in your context.\n" });
  assert.equal(r.code, 0, r.out);
});
test("the shipped agents do not re-read CLAUDE.md", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

// Modules that ship skills and agents (#352).
const agent = (name, desc = "Checks things.") => `---\nname: ${name}\ndescription: ${desc}\nmodel: inherit\n---\n\nCheck.\n`;
const mod = {
  ...good,
  "packs/notes/pack.json": '{ "name": "notes", "kind": "module" }',
  "packs/notes/managed/STACK.md": "Ships the `note-taker` skill and `.claude/agents/note-checker.md`.",
  "packs/notes/skills/note-taker/SKILL.md": skill("note-taker", "Take notes - when asked."),
  "packs/notes/agents/note-checker.md": agent("note-checker"),
};
test("a module with a skill and an agent passes, without the README or the template naming them", () => assert.equal(run(mod).code, 0));
test("a module's skill and agent get the front matter checks", () => {
  const r = run({ ...mod, "packs/notes/skills/note-taker/SKILL.md": skill("other", "Take notes: now."), "packs/notes/agents/note-checker.md": "No front matter.\n" });
  assert.equal(r.code, 1);
  assert.match(r.out, /packs\/notes\/skills\/note-taker\/SKILL\.md: name "other" differs from folder "note-taker"/);
  assert.match(r.out, /packs\/notes\/agents\/note-checker\.md: no front matter/);
});
test("a module's skill or agent missing from its STACK.md fails", () => {
  const r = run({ ...mod, "packs/notes/managed/STACK.md": "Ships the `note-taker` skill." });
  assert.equal(r.code, 1); assert.match(r.out, /packs\/notes\/managed\/STACK\.md: the module's STACK\.md does not list its agent note-checker/);
});
test("one name, one owner: a module against the core, and against another module", () => {
  const r = run({
    ...mod,
    "plugins/studio/agents/note-checker.md": agent("note-checker"),
    "packs/other/managed/STACK.md": "Ships `note-taker` and `alpha`.",
    "packs/other/skills/note-taker/SKILL.md": skill("note-taker", "Also takes notes."),
    "packs/other/skills/alpha/SKILL.md": skill("alpha", "Also alpha."),
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /agent name "note-checker" is already shipped by the core/);
  assert.match(r.out, /packs\/other\/skills\/note-taker\/SKILL\.md: skill name "note-taker" is already shipped by the notes pack/);
  assert.match(r.out, /packs\/other\/skills\/alpha\/SKILL\.md: skill name "alpha" is already shipped by the core/);
});
// Helper agents do not get CLAUDE.md in their context (model review 2026-11-27), so an agent may be told to read it.
test("a module's agent may read CLAUDE.md", () => {
  const r = run({ ...mod, "packs/notes/agents/note-checker.md": `${agent("note-checker")}First read CLAUDE.md.\n` });
  assert.equal(r.code, 0, r.out);
});

test("a model is named only in the Models table and in front matter", () => {
  const table = "# Harness\n\n## Models\n\n| Role | Model | Effort | Used for |\n|---|---|---|---|\n| the standard thread model | Sonnet | medium | threads |\n| the review model | Opus | high | reviews |\n\n## Next\n\nText.\n";
  const agent = (model) => `---\nname: helper\ndescription: Helps.\nmodel: ${model}\n---\n\nYou help.\n`;
  const ok = { ...good, "plugins/studio/skills/harness-sync/SKILL.md": skill("harness-sync", "Sync the harness - when asked."), "README.md": "Skills: `alpha`, `harness-sync`.", "plugins/studio/templates/CLAUDE.md": "Harness: skills `alpha`, `harness-sync`.", "plugins/studio/skills/harness-sync/harness.md": table, "plugins/studio/agents/helper.md": agent("opus"), "docs/governance/model-review.md": "Reviewed on Sonnet.", "packs/ai-web/managed/STACK.md": "Default `claude-haiku-5-5`." };
  assert.equal(run(ok).code, 0, run(ok).out);
  const prose = run({ ...ok, "plugins/studio/templates/project-instructions.md": "Threads run on Sonnet." });
  assert.equal(prose.code, 1); assert.match(prose.out, /project-instructions\.md:1: names a model in prose/);
  const after = run({ ...ok, "plugins/studio/skills/harness-sync/harness.md": table + "Use Opus here.\n" });
  assert.equal(after.code, 1); assert.match(after.out, /harness\.md:\d+: names a model in prose/);
  const pin = run({ ...ok, "plugins/studio/agents/helper.md": agent("haiku") });
  assert.equal(pin.code, 1); assert.match(pin.out, /pins the model "haiku"/);
  const none = run({ ...ok, "plugins/studio/skills/harness-sync/harness.md": "# Harness\n" });
  assert.equal(none.code, 1); assert.match(none.out, /no "## Models" table/);
});
