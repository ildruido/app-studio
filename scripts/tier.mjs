#!/usr/bin/env node
// The tier part of the required `check`: sets a PR's risk tier from the paths it changes.
//   owner : the App-Studio Owner must OK it (label `owner-ok`) before `check` can pass.
//   live  : app-facing files; merges when green, but apps wait for the studio-scratch live check.
//   auto  : merges when green.
// Unknown files fail closed to `owner`. A thread can only raise a tier (label `tier:owner`), never lower it. The repo variable ALL_NEED_OWNER=true sends every
// PR to `owner`.
// CI runs this file as it is on the base branch, so a PR cannot lower its own tier by editing it.
//   node scripts/tier.mjs --base origin/main        (env: LABELS = JSON array, ALL_NEED_OWNER)
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const ALE_PATHS = [
  /^scripts\/studio-env\.mjs$/,
  /^scripts\/env-setup\.sh$/,
  /^\.github\//,
  /^scripts\/(tier|release-check|packs-smoke|core-lint)(\.test)?\.mjs$/,
];
const WORDING_DOCS = ["docs/GOVERNANCE.md", "docs/studio-project-instructions.md"];
const LIVE_PATHS = [/^plugins\//, /^packs\//, /^scripts\/studio-sync\.mjs$/];
const AUTO_PATHS = [/^docs\//, /^README\.md$/, /^CHANGELOG\.md$/, /^scripts\/[^/]+\.test\.mjs$/];
const TEST_FILE = /(^|\/)[^/]*\.(test|spec)\.[cm]?[jt]sx?$|^tests?\//;
const MAX_LINES = 400;
const MAX_WORDS = 30;

// Words that carry a rule. A change to any of them (added or removed), or to any number, is not "wording only".
const RULE_WORD =
  /^(must|never|always|only|not|no|none|nothing|nobody|cannot|unless|except|without|instead|before|after|requir\w*|ok|okay|approv\w*|merg\w*|auto-merg\w*|tier\w*|check\w*|test\w*|verif\w*|live|owner|coordinator\w*|thread\w*|decid\w*|should|shall)$|n't$|\d/;

const normalize = (w) =>
  w.toLowerCase().replace(/’/g, "'").replace(/'s$/, "").replace(/^[^a-z0-9]+|[^a-z0-9']+$/g, "");

function lineKind(line) {
  if (/^\s*```/.test(line)) return "fence";
  const h = /^(#{1,6})\s/.exec(line);
  if (h) return `h${h[1].length}`;
  if (/^\s*[-*+]\s/.test(line)) return `bullet${line.search(/\S/)}`;
  if (/^\s*\d+[.)]\s/.test(line)) return `num${line.search(/\S/)}`;
  if (/^\s*\|/.test(line)) return "row";
  if (/^\s*>/.test(line)) return "quote";
  return line.trim() === "" ? "blank" : "p";
}

/** Word-level difference between two texts: the removed and the added words. */
function wordDiff(a, b) {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  let s = 0;
  while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let e = 0;
  while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
  const m = x.slice(s, x.length - e);
  const n = y.slice(s, y.length - e);
  if (m.length * n.length > 4e7) return null; // too large to compare: treat as a big change
  const w = n.length + 1;
  const dp = new Uint16Array((m.length + 1) * w);
  for (let i = m.length - 1; i >= 0; i--)
    for (let j = n.length - 1; j >= 0; j--)
      dp[i * w + j] = m[i] === n[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < m.length || j < n.length) {
    if (i < m.length && j < n.length && m[i] === n[j]) { i++; j++; }
    else if (j >= n.length || (i < m.length && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) removed.push(m[i++]);
    else added.push(n[j++]);
  }
  return { removed, added };
}

/** Is the change from `before` to `after` wording only? Returns { ok, words, reason }. */
export function wordingOnly(before, after) {
  const kinds = (t) => t.split("\n").map(lineKind).join(",");
  if (kinds(before) !== kinds(after))
    return { ok: false, words: 0, reason: "a heading, list item, table row or paragraph was added, removed or moved" };
  // A line that exists in both texts but in a different order was moved.
  const [bl, al] = [before.split("\n"), after.split("\n")];
  const [bs, as] = [new Set(bl), new Set(al)];
  const keep = (lines, other) => lines.filter((l) => l.trim() && other.has(l)).join("\n");
  if (keep(bl, as) !== keep(al, bs)) return { ok: false, words: 0, reason: "a line was moved" };
  const d = wordDiff(before, after);
  if (!d) return { ok: false, words: 0, reason: "too many words changed" };
  const changed = [...d.removed, ...d.added];
  const rule = changed.map(normalize).filter((w) => RULE_WORD.test(w));
  if (rule.length) return { ok: false, words: changed.length, reason: `a rule word or number changed (${[...new Set(rule)].join(", ")})` };
  if (changed.length > MAX_WORDS) return { ok: false, words: changed.length, reason: `${changed.length} words changed (limit ${MAX_WORDS})` };
  return { ok: true, words: changed.length, reason: "" };
}

const count = (text, re) => (text ? (text.match(re) ?? []).length : 0);
const TEST_CASE = /^\s*(test|it)(\.\w+)*\s*\(/gm;

/** A changelog line that asks someone to do a manual step (not "No **App action**" or "**App action:** none"). */
export function addsAction(line) {
  for (const m of line.matchAll(/(\bno\s+)?\*\*(App|Admin) action(:\*\*|\*\*:?)\s*(none\b)?/gi)) if (!m[1] && !m[4]) return true;
  return false;
}

/**
 * Pure core.
 *   changed   : paths changed by the PR (deleted files included)
 *   before/after(path) : file text at the base / now, or null
 *   numstat   : [{ path, lines }] changed lines per file
 *   addedChangelog : lines added to CHANGELOG.md
 *   labels, allNeedOwner
 */
export function classify({ changed, before, after, numstat = [], addedChangelog = [], labels = [], allNeedOwner = false }) {
  const rank = { auto: 0, live: 1, owner: 2 };
  let tier = "auto";
  const reasons = [];
  const raise = (t, why) => {
    if (rank[t] > rank[tier]) tier = t;
    reasons.push(`${t}: ${why}`);
  };

  if (allNeedOwner) raise("owner", "ALL_NEED_OWNER is on, every PR waits for the App-Studio Owner");
  if (labels.includes("tier:owner")) raise("owner", "the PR carries the tier:owner label");

  for (const f of changed) {
    if (ALE_PATHS.some((re) => re.test(f))) raise("owner", `${f} is the loader, CI or a tier rule`);
    else if (WORDING_DOCS.includes(f)) {
      const r = wordingOnly(before(f) ?? "", after(f) ?? "");
      if (r.ok) raise("auto", `${f}: wording only (${r.words} words)`);
      else raise("owner", `${f} is a rule file and ${r.reason}`);
    } else if (LIVE_PATHS.some((re) => re.test(f))) raise("live", `${f} reaches apps`);
    else if (AUTO_PATHS.some((re) => re.test(f))) raise("auto", `${f} is docs, a test or the changelog`);
    else raise("owner", `${f} is not a known file`);
  }

  for (const f of changed.filter((p) => TEST_FILE.test(p))) {
    const [b, a] = [before(f), after(f)];
    if (b && (a === null || count(a, TEST_CASE) < count(b, TEST_CASE))) raise("owner", `${f} loses a test`);
  }
  if (addedChangelog.some(addsAction)) raise("owner", "the changelog adds an App action or Admin action");
  const lines = numstat.filter((n) => !TEST_FILE.test(n.path) && n.path !== "CHANGELOG.md").reduce((s, n) => s + n.lines, 0);
  if (lines > MAX_LINES) raise("owner", `${lines} changed lines (limit about ${MAX_LINES}, tests and changelog excluded)`);

  return { tier, reasons };
}

const git = (...args) => {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null;
};

if (process.argv[1]?.endsWith("tier.mjs")) {
  const base = process.argv[process.argv.indexOf("--base") + 1];
  if (!base || base.startsWith("--")) { console.error("usage: tier.mjs --base <ref>"); process.exit(2); }
  const names = git("diff", "--name-only", "--no-renames", `${base}...HEAD`);
  const stat = git("diff", "--numstat", "--no-renames", `${base}...HEAD`);
  if (names === null || stat === null) { console.error(`Cannot diff against ${base} (fetch the full history).`); process.exit(2); }
  let labels = [];
  try { labels = JSON.parse(process.env.LABELS || "[]"); } catch { /* unreadable labels: ignore, paths still decide */ }
  const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
  const log = git("diff", "-U0", "--no-renames", `${base}...HEAD`, "--", "CHANGELOG.md") ?? "";
  const { tier, reasons } = classify({
    changed: names.split("\n").filter(Boolean),
    before: (p) => git("show", `${base}:${p}`),
    after: read,
    numstat: stat.split("\n").filter(Boolean).map((l) => {
      const [a, d, ...p] = l.split("\t");
      return { path: p.join("\t"), lines: (Number(a) || 0) + (Number(d) || 0) };
    }),
    addedChangelog: log.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")),
    labels,
    allNeedOwner: process.env.ALL_NEED_OWNER === "true",
  });
  const text = `Tier: ${tier}\n${[...new Set(reasons)].map((r) => `- ${r}`).join("\n")}\n`;
  console.log(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${text}`);
}
