#!/usr/bin/env node
// Fingerprint of a PR's own changes: what the owner OK is tied to (GOVERNANCE section 9). Plain code, data only.
//   node scripts/own-fp.mjs --base origin/main     prints the fingerprint (empty when the PR changes nothing of its own)
// It must not move when `main` is merged into the branch, so it leaves out the files code writes for a change or a release (the unreleased
// entry, the release record, CHANGELOG.md, the plugin version) and uses zero context lines: a context line of a shared file is what a main sync changes.
import { spawnSync } from "node:child_process";

export const PLUGIN = "plugins/studio/.claude-plugin/plugin.json";
export const BOOKKEEPING = [/^releases\/\d+\.\d+\.\d+\.json$/, /^releases\/unreleased\/[^/]+\.json$/, /^CHANGELOG\.md$/, new RegExp(`^${PLUGIN.replace(/\./g, "\\.")}$`)];
export const isBookkeeping = (f) => BOOKKEEPING.some((re) => re.test(f));

const git = (args, input, cwd) => spawnSync("git", args, { encoding: "utf8", input, cwd, maxBuffer: 1 << 28 });

export function ownFingerprint(base, cwd) {
  const names = git(["diff", "--name-only", `${base}...HEAD`], undefined, cwd);
  if (names.status !== 0) throw new Error(`cannot diff against ${base} (fetch the full history)`);
  const files = names.stdout.split("\n").filter((f) => f && !isBookkeeping(f));
  if (!files.length) return "";
  const diff = git(["diff", "-U0", `${base}...HEAD`, "--", ...files], undefined, cwd);
  if (diff.status !== 0) throw new Error("git diff failed");
  return git(["patch-id", "--stable"], diff.stdout, cwd).stdout.split(" ")[0].trim();
}

if (process.argv[1]?.endsWith("own-fp.mjs")) {
  const i = process.argv.indexOf("--base");
  try { console.log(ownFingerprint(i > 0 ? process.argv[i + 1] : "origin/main")); }
  catch (e) { console.error(e.message); process.exit(1); }
}
