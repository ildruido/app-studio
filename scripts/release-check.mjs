#!/usr/bin/env node
// The release part of the required `check`: when harness files change, the plugin version is
// bumped and a release record releases/<version>.json exists for it; when a pack changes, that pack's version is bumped.
// It also says whether the packs smoke test must run (GITHUB_OUTPUT `packs=true|false`).
//   node scripts/release-check.mjs --base origin/main
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

export const HARNESS = [/^plugins\//, /^packs\//, /^scripts\/(studio-sync|studio-env)\.mjs$/, /^scripts\/env-setup\.sh$/];
const SMOKE = [/^packs\//, /^scripts\/(studio-sync|packs-smoke)\.mjs$/];
const semver = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

const nextOf = (v, kind) => {
  const x = semver(v);
  if (!x) return "?";
  return kind === "minor" ? `${x[0]}.${x[1] + 1}.0` : `${x[0]}.${x[1]}.${x[2] + 1}`;
};

/** Pure core. `before(path)` / `after(path)` return a file's text at the base / now, or null. */
export function evaluate(changed, before, after) {
  const problems = [];
  const touches = (res) => changed.some((f) => res.some((re) => re.test(f)));
  const version = (read, path) => {
    const t = read(path);
    try { return t ? JSON.parse(t).version : null; } catch { return null; }
  };
  if (touches(HARNESS)) {
    const p = "plugins/studio/.claude-plugin/plugin.json";
    const [old, now] = [version(before, p), version(after, p)];
    if (!newer(now, old)) problems.push(`Harness files changed but the plugin version in ${p} was not raised (${old} -> ${now}). Next free: ${nextOf(old, "patch")} (patch) or ${nextOf(old, "minor")} (minor); \`node scripts/studio-sync.mjs status\` also counts open PR branches.`);
    else if (!after(`releases/${now}.json`))
      problems.push(`There is no release record releases/${now}.json for the new plugin version (node scripts/release.mjs new --version ${now}, fill it in, then node scripts/release.mjs render).`);
  }
  for (const pack of new Set(changed.map((f) => /^packs\/([^/]+)\//.exec(f)?.[1]).filter(Boolean))) {
    const p = `packs/${pack}/pack.json`;
    if (!after(p)) continue; // pack removed
    const [old, now] = [version(before, p), version(after, p)];
    if (old && !newer(now, old)) problems.push(`Pack "${pack}" changed but its version in ${p} was not raised (${old} -> ${now}).`);
  }
  return { problems, smoke: touches(SMOKE) };
}

const git = (...args) => {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
};

if (process.argv[1]?.endsWith("release-check.mjs")) {
  const base = process.argv[process.argv.indexOf("--base") + 1];
  if (!base || base.startsWith("--")) { console.error("usage: release-check.mjs --base <ref>"); process.exit(2); }
  const diff = git("diff", "--name-only", `${base}...HEAD`);
  if (diff === null) { console.error(`Cannot diff against ${base} (fetch the full history).`); process.exit(2); }
  const changed = diff.split("\n").filter(Boolean);
  const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
  const { problems, smoke } = evaluate(changed, (p) => git("show", `${base}:${p}`), read);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `packs=${smoke}\n`);
  console.log(`${changed.length} files changed; packs smoke ${smoke ? "needed" : "not needed"}.`);
  if (problems.length) { console.error(problems.map((x) => `FAIL: ${x}`).join("\n")); process.exit(1); }
  console.log("Release check passed.");
}
