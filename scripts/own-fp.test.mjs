// Run: node --test scripts/own-fp.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBookkeeping, ownFingerprint } from "./own-fp.mjs";

const sh = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const put = (d, f, t) => { mkdirSync(join(d, f, ".."), { recursive: true }); writeFileSync(join(d, f), t); };
const commit = (d, m) => { sh(d, "add", "-A"); sh(d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", m); };

test("bookkeeping files are the generated ones", () => {
  assert.ok(isBookkeeping("CHANGELOG.md") && isBookkeeping("releases/0.43.1.json") && isBookkeeping("plugins/studio/.claude-plugin/plugin.json"));
  assert.equal(isBookkeeping("scripts/finish.mjs"), false);
});

test("merging a main that touches CHANGELOG and the plugin version leaves the fingerprint unchanged", () => {
  const d = mkdtempSync(join(tmpdir(), "own-fp-"));
  try {
    sh(d, "init", "-q", "-b", "main");
    put(d, "CHANGELOG.md", "# Changelog\n\n## 0.43.0\n- a\n");
    put(d, "plugins/studio/.claude-plugin/plugin.json", '{\n  "name": "studio",\n  "version": "0.43.0"\n}\n');
    put(d, "docs/shared.md", "l1\nl2\nl3\nl4\nl5\n");
    commit(d, "base");
    sh(d, "update-ref", "refs/remotes/origin/main", "HEAD");
    sh(d, "checkout", "-q", "-b", "pr");
    put(d, "docs/shared.md", "l1\nl2\nMINE\nl4\nl5\n");
    put(d, "CHANGELOG.md", "# Changelog\n\n## 0.43.1\n- mine\n\n## 0.43.0\n- a\n");
    put(d, "plugins/studio/.claude-plugin/plugin.json", '{\n  "name": "studio",\n  "version": "0.43.1"\n}\n');
    commit(d, "pr");
    const before = ownFingerprint("origin/main", d);
    assert.ok(before);
    // main moves: its own changelog entry, a version bump, and a change next to the PR's lines in a shared file
    sh(d, "checkout", "-q", "main");
    put(d, "CHANGELOG.md", "# Changelog\n\n## 0.43.0\n- a\n\n## 0.42.0\n- z\n");
    put(d, "plugins/studio/.claude-plugin/plugin.json", '{\n  "name": "studio",\n  "version": "0.43.1"\n}\n');
    put(d, "docs/shared.md", "l1\nl2\nl3\nl4\nOTHER\n");
    commit(d, "main moved");
    sh(d, "update-ref", "refs/remotes/origin/main", "HEAD");
    sh(d, "checkout", "-q", "pr");
    const m = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "origin/main", "-m", "sync"], { cwd: d, encoding: "utf8" });
    assert.equal(m.status, 0, m.stderr);
    assert.equal(ownFingerprint("origin/main", d), before);
    // a real change of the PR's own files does change it
    put(d, "docs/shared.md", "l1\nl2\nMINE2\nl4\nOTHER\n");
    commit(d, "real change");
    assert.notEqual(ownFingerprint("origin/main", d), before);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
