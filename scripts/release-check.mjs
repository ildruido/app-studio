#!/usr/bin/env node
// The release part of the required `check`. A PR that changes harness files adds its unreleased entry, releases/unreleased/<id>.json, and
// leaves the plugin version alone; a release is cut on purpose: the plugin version is raised, a record releases/<version>.json exists
// for it and no unreleased entry is left behind (so the commit that adds a record holds exactly that release). Entries leave only through
// a cut. When a pack changes, that pack's version is bumped.
// It also says whether the packs smoke test must run (GITHUB_OUTPUT `packs=true|false`).
//   node scripts/release-check.mjs --base origin/main
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";

export const HARNESS = [/^plugins\//, /^packs\//, /^scripts\/(studio-sync|studio-env)\.mjs$/, /^scripts\/env-setup\.sh$/];
const SMOKE = [/^packs\//, /^scripts\/(studio-sync|packs-smoke)\.mjs$/];
const semver = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

const ENTRY = /^releases\/unreleased\/[^/]+\.json$/;

/** Pure core. `before(path)` / `after(path)` return a file's text at the base / now, or null. `entriesNow`: the entry files left in releases/unreleased/. */
export function evaluate(changed, before, after, entriesNow = []) {
  const problems = [];
  const touches = (res) => changed.some((f) => res.some((re) => re.test(f)));
  const version = (read, path) => {
    const t = read(path);
    try { return t ? JSON.parse(t).version : null; } catch { return null; }
  };
  const p = "plugins/studio/.claude-plugin/plugin.json";
  const [old, now] = [version(before, p), version(after, p)];
  const raised = newer(now, old);
  const entries = changed.filter((f) => ENTRY.test(f));
  const own = entries.filter((f) => after(f) && !before(f)); // added by this PR
  const folded = entries.filter((f) => !after(f)); // removed by this PR
  if (old && now !== old && !raised) problems.push(`The plugin version in ${p} went from ${old} to ${now}: it only ever goes up, and only in a release cut (node scripts/finish.mjs release).`);
  // A release record is written once, by the cut that raises the version; afterwards only its status may change (a main check that
  // passed, a rollback). So no PR can rewrite what a release says it shipped.
  const noStatus = (t) => { try { const { status, ...rest } = JSON.parse(t); return JSON.stringify(rest); } catch { return t; } };
  for (const f of changed.filter((x) => /^releases\/\d+\.\d+\.\d+\.json$/.test(x))) {
    const [b, a] = [before(f), after(f)];
    if (b && (!a || noStatus(a) !== noStatus(b))) problems.push(`${f} is a release that main already has: it cannot be ${a ? "rewritten" : "removed"} (only its status may change).`);
    if (!b && a && !(raised && f === `releases/${now}.json`)) problems.push(`${f} was added without raising the plugin version to it: a record is written only by a release cut (node scripts/finish.mjs release).`);
  }
  if (raised) {
    if (!after(`releases/${now}.json`)) problems.push(`There is no release record releases/${now}.json for the new plugin version (a release is cut by code: node scripts/finish.mjs release).`);
    if (entriesNow.length) problems.push(`The plugin version was raised to ${now} but ${entriesNow.length} unreleased entr${entriesNow.length === 1 ? "y is" : "ies are"} left (${entriesNow.join(", ")}): a cut folds every entry into the record (node scripts/finish.mjs next rebuilds it after main moved).`);
  } else {
    if (folded.length) problems.push(`Unreleased entries were removed without a release (${folded.join(", ")}): entries leave only through a cut, which raises the plugin version. To take a merged change back, revert its files in a new PR, which adds its own entry.`);
    if (changed.some((f) => f !== p && HARNESS.some((re) => re.test(f))) && !own.length)
      problems.push("Harness files changed but the PR adds no unreleased entry in releases/unreleased/ (node scripts/finish.mjs start writes it). A PR no longer raises the plugin version; a release is cut on purpose.");
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
  let entriesNow = [];
  try { entriesNow = readdirSync("releases/unreleased").filter((f) => f.endsWith(".json")).map((f) => `releases/unreleased/${f}`); } catch { /* no entries */ }
  const { problems, smoke } = evaluate(changed, (p) => git("show", `${base}:${p}`), read, entriesNow);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `packs=${smoke}\n`);
  console.log(`${changed.length} files changed; packs smoke ${smoke ? "needed" : "not needed"}.`);
  if (problems.length) { console.error(problems.map((x) => `FAIL: ${x}`).join("\n")); process.exit(1); }
  console.log("Release check passed.");
}
