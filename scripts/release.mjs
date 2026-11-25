#!/usr/bin/env node
// The one way into app-studio's release data. Plain code, no model: short text by default, `--json` for scripts.
//   node scripts/release.mjs <command> [args] [--json] [--studio <dir>]
//   gate --since X              can an app move past X? (every release in range is checked)
//   summary --since X           one line per release: version, summary, references
//   actions --since X --for app|admin   only the manual steps, numbered, with their release
//   details <version>           one full record, readable
//   scenarios <version> --where branch|main   scenario ids (and catalog entries, once there is a catalog)
//   new [--version X] [--kind internal|app-facing|loader]   an empty record, next free patch by default
//   validate                    records, scenario catalog (shape, branch vs main, floor rule) and CHANGELOG.md are well formed and in step
//   pass-main <version> [--date YYYY-MM-DD]   status.main: pending -> passed <date>, then render
//   pending                     releases still waiting on a main check
//   render [--check]            write CHANGELOG.md from the records (--check: only compare)
// Records live in releases/<version>.json. Versions up to 0.36.2 are read from docs/CHANGELOG-legacy.md (frozen).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = /^\d+\.\d+\.\d+$/;
const KINDS = ["internal", "app-facing", "loader"];
export const LEGACY_LAST = "0.36.2";
// The floor rule (GOVERNANCE section 5) applies to releases after this one; earlier records were written before it.
export const FLOOR_AFTER = "0.38.1";

const num = (v) => v.split(".").map(Number);
export const cmp = (a, b) => {
  const [x, y] = [num(a), num(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const isoDate = () => new Date().toISOString().slice(0, 10);
const list = (v) => (Array.isArray(v) ? v : []);

// ---------- reading ----------

/** Entries of the frozen legacy changelog, as the same shape as a record, plus the text they came from. */
export function parseLegacy(text) {
  const parts = text.replace(/\r\n/g, "\n").split(/\n(?=## \[)/);
  const out = [];
  for (const body of parts) {
    const h = /^## \[(\d+\.\d+\.\d+)\] - (\S+)/.exec(body);
    if (!h) continue;
    const live = /^[\s>*_-]*Live check:\s*\**\s*([^\n]*)/im.exec(body)?.[1].trim() ?? "";
    const origin = /^- Origin:\s*([^\n]*)/m.exec(body)?.[1] ?? /^- ([^\n]*)/m.exec(body)?.[1] ?? "";
    const summary = origin.replace(/\*\*/g, "").split(/(?<=[.:;])\s/)[0].replace(/[.:;]$/, "").slice(0, 110);
    // A line asks for a step unless it says only "No **App action**" or "**App action:** none".
    const actionLines = (kind) =>
      body.split("\n").filter((l) => {
        const t = l.replace(new RegExp(`\\b(no|none)\\b[^.\\n]{0,12}\\*\\*${kind} action\\*\\*`, "gi"), "").replace(new RegExp(`\\*\\*${kind} action:?\\*\\*:?\\s*(none|not needed)`, "gi"), "");
        return new RegExp(`\\*\\*${kind} action`, "i").test(t);
      });
    out.push({
      legacy: true,
      version: h[1],
      date: h[2],
      summary,
      status: { main: /^pending/i.test(live) ? "pending" : /^rolled back/i.test(live) ? live.replace(/\s*\(.*$/, "") : /^passed/i.test(live) ? `passed ${/\d{4}-\d{2}-\d{2}/.exec(live)?.[0] ?? ""}`.trim() : "not needed" },
      appActions: actionLines("App").map((l) => l.replace(/^[-*\s]+/, "")),
      adminActions: actionLines("Admin").map((l) => l.replace(/^[-*\s]+/, "")),
      text: body.trim(),
    });
  }
  return out;
}

export function studioVersion(studio) {
  return JSON.parse(readFileSync(join(studio, "plugins/studio/.claude-plugin/plugin.json"), "utf8")).version;
}

/** Every record file: [{ file, record|null, error }]. */
export function readRecordFiles(studio) {
  const dir = join(studio, "releases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "scenarios.json")
    .sort()
    .map((file) => {
      try { return { file, record: JSON.parse(readFileSync(join(dir, file), "utf8")) }; }
      catch (e) { return { file, record: null, error: e.message }; }
    });
}

/** All releases, newest first: legacy entries and records in one list. */
export function loadAll(studio) {
  const legacyFile = join(studio, "docs/CHANGELOG-legacy.md");
  const legacy = existsSync(legacyFile) ? parseLegacy(readFileSync(legacyFile, "utf8")) : [];
  const records = readRecordFiles(studio).filter((r) => r.record && VERSION.test(r.record.version ?? "")).map((r) => ({ legacy: false, ...r.record }));
  const byVersion = new Map(legacy.map((e) => [e.version, e]));
  for (const r of records) byVersion.set(r.version, r); // a record wins over a legacy entry of the same version
  return [...byVersion.values()].sort((a, b) => cmp(b.version, a.version));
}

const mainStatus = (r) => String(r.status?.main ?? "pending");
const isRolledBack = (r) => /^rolled back/i.test(mainStatus(r)); // "Live check: rolled back in <version>": its steps no longer apply
const isPending = (r) => /^pending/i.test(mainStatus(r));
const refText = (r) => {
  const f = r.refs ?? {};
  const bits = [...list(f.issues).map((n) => `#${n}`), f.pr ? `PR #${f.pr}` : null, ...list(f.ideas).map((n) => `idea #${n}`)].filter(Boolean);
  return bits.length ? ` (${bits.join(", ")})` : "";
};

// ---------- commands (pure: data in, { text, data, ok } out) ----------

export function gate(all, current, since) {
  const valid = VERSION.test(since ?? "");
  const range = all.filter((r) => cmp(r.version, current) <= 0 && (!valid || cmp(r.version, since) > 0));
  const blocking = range.filter(isPending).map((r) => ({ version: r.version, why: "its check on main is still pending" }));
  const data = { since: valid ? since : null, target: current, releases: range.length, blocking };
  if (blocking.length)
    return { ok: false, data, text: `BLOCKED: ${blocking.map((b) => `${b.version} (${b.why})`).join("; ")}. No app moves past ${valid ? since : "its version"} until that check passes.` };
  return { ok: true, data, text: `OK: ${valid ? since : "your version"} -> ${current} (${range.length} release${range.length === 1 ? "" : "s"}).` };
}

export function summary(all, current, since) {
  const valid = VERSION.test(since ?? "");
  const range = all.filter((r) => cmp(r.version, current) <= 0 && (!valid || cmp(r.version, since) > 0));
  const data = range.map((r) => ({ version: r.version, summary: r.summary, refs: r.refs ?? null }));
  const text = range.length ? range.map((r) => `${r.version}  ${r.summary}${refText(r)}`).join("\n") : `Nothing newer than ${since}.`;
  return { ok: true, data, text };
}

export function actions(all, current, since, who) {
  const valid = VERSION.test(since ?? "");
  const key = who === "admin" ? "adminActions" : "appActions";
  const range = all.filter((r) => cmp(r.version, current) <= 0 && (!valid || cmp(r.version, since) > 0) && !isRolledBack(r));
  const data = range.filter((r) => list(r[key]).length).map((r) => ({ version: r.version, steps: list(r[key]) }));
  const text = data.length
    ? data.map((d) => `${d.version}:\n${d.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`).join("\n")
    : `No ${who === "admin" ? "Admin" : "App"} actions since ${since}.`;
  return { ok: true, data, text };
}

export function details(all, version) {
  const r = all.find((x) => x.version === version);
  if (!r) return { ok: false, data: null, text: `No release ${version}.` };
  if (r.legacy) return { ok: true, data: r, text: r.text };
  const L = (name, v) => (list(v).length ? `${name}:\n${list(v).map((s, i) => `  ${i + 1}. ${s}`).join("\n")}` : `${name}: none`);
  const text = [
    `${r.version} (${r.date}) ${r.kind}`,
    `${r.summary}${refText(r)}`,
    L("For the App Creator", r.appCreator),
    L("App actions", r.appActions),
    L("Admin actions", r.adminActions),
    `Branch checks: ${branchText(r)}`,
    `Main checks: ${list(r.checks?.main).join(", ") || "none"}; status ${mainStatus(r)}`,
    L("Not verified", r.notVerified),
  ].join("\n");
  return { ok: true, data: r, text };
}

const branchText = (r) => {
  const b = r.checks?.branch;
  return Array.isArray(b) ? (b.join(", ") || "none") : `none (${b?.none ?? "no reason given"})`;
};

export function scenarios(all, version, where, catalog) {
  const r = all.find((x) => x.version === version);
  if (!r) return { ok: false, data: null, text: `No release ${version}.` };
  const ids = where === "main" ? list(r.checks?.main) : Array.isArray(r.checks?.branch) ? r.checks.branch : [];
  const cat = new Map(list(catalog?.scenarios).map((s) => [s.id, s]));
  const data = ids.map((id) => cat.get(id) ?? { id, missing: true });
  const text = ids.length
    ? data.map((s) => (s.missing ? `${s.id}  (not in the scenario catalog yet)` : `${s.id}  ${s.title ?? ""}`.trim())).join("\n")
    : `No ${where} scenarios for ${version}.`;
  return { ok: true, data, text };
}

export function pending(all) {
  const rows = all.filter(isPending).map((r) => ({ version: r.version, summary: r.summary }));
  return { ok: true, data: rows, text: rows.length ? rows.map((r) => `${r.version}  ${r.summary}`).join("\n") : "No release waits for a main check." };
}

export function newRecord(all, current, version, kind = "app-facing", date = isoDate()) {
  const top = all.reduce((m, r) => (cmp(r.version, m) > 0 ? r.version : m), current);
  const v = version ?? `${num(top)[0]}.${num(top)[1]}.${num(top)[2] + 1}`;
  if (!VERSION.test(v)) return { ok: false, text: `"${v}" is not a version like 1.2.3.` };
  if (all.some((r) => r.version === v) && version) return { ok: false, text: `Release ${v} already exists.` };
  if (!KINDS.includes(kind)) return { ok: false, text: `kind must be one of ${KINDS.join(", ")}.` };
  const record = {
    version: v,
    date,
    summary: "",
    kind,
    refs: { issues: [], ideas: [], pr: null },
    appCreator: [],
    appActions: [],
    adminActions: [],
    checks: { branch: kind === "internal" ? { none: "internal change, apps never receive it" } : [], main: [] },
    status: { main: kind === "loader" ? "pending" : "not needed" },
    notVerified: [],
  };
  return { ok: true, version: v, record, text: `releases/${v}.json (next free version ${v})` };
}

// ---------- validation ----------

const strList = (v) => Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim());
const numList = (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n > 0);

export function validateRecord(r, file) {
  const p = [];
  const bad = (m) => p.push(`${file}: ${m}`);
  if (!VERSION.test(r.version ?? "")) bad("version must look like 1.2.3");
  else if (file !== `${r.version}.json`) bad(`file name must be ${r.version}.json`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")) bad("date must be YYYY-MM-DD");
  if (typeof r.summary !== "string" || !r.summary.trim()) bad("summary is empty");
  if (!KINDS.includes(r.kind)) bad(`kind must be one of ${KINDS.join(", ")}`);
  const f = r.refs;
  if (!f || typeof f !== "object" || !numList(f.issues ?? []) || !numList(f.ideas ?? []) || (f.pr != null && !(Number.isInteger(f.pr) && f.pr > 0))) bad("refs must be { issues: [numbers], ideas: [numbers], pr: number or null }");
  for (const k of ["appCreator", "appActions", "adminActions", "notVerified"]) if (!strList(r[k])) bad(`${k} must be a list of non-empty strings (empty list for none)`);
  const b = r.checks?.branch;
  if (!(strList(b) || (b && typeof b.none === "string" && b.none.trim()))) bad("checks.branch must be a list of scenario ids, or { none: reason }");
  if (!strList(r.checks?.main ?? null)) bad("checks.main must be a list of scenario ids (empty list for none)");
  const s = r.status?.main;
  if (!(s === "pending" || s === "not needed" || /^rolled back in \d+\.\d+\.\d+$/.test(s ?? "") || /^passed \d{4}-\d{2}-\d{2}$/.test(s ?? ""))) bad('status.main must be "pending", "not needed", "passed YYYY-MM-DD" or "rolled back in <version>"');
  if (list(r.checks?.main).length && s === "not needed") bad('status.main cannot be "not needed" when checks.main lists scenarios');
  if (!list(r.checks?.main).length && s === "pending") bad('status.main is "pending" but checks.main lists no scenario');
  // Floor rule: what apps get is branch-tested, or says why not; a loader or setup release is also checked on main.
  if (VERSION.test(r.version ?? "") && cmp(r.version, FLOOR_AFTER) > 0 && r.kind !== "internal") {
    if (Array.isArray(b) && !b.length) bad('an app-facing release needs at least one branch scenario in checks.branch, or { none: "<reason>" }');
    if (r.kind === "loader" && !list(r.checks?.main).length) bad("a loader release needs at least one main scenario in checks.main");
  }
  return p;
}

// ---------- scenario catalog (releases/scenarios.json) ----------

const PR_STATES = ["merged", "open", "closed", "none"];
const CONCLUSIONS = ["success", "failure"];
const validPattern = (v) => { try { new RegExp(v); return typeof v === "string" && v.length > 0; } catch { return false; } };

/** Each rule is something code reads on GitHub (PR state, a check, a file) or in the result text, never Claude's own verdict. */
function validatePassRule(rule) {
  if (!rule || typeof rule !== "object") return ["a pass rule must be an object with a type"];
  switch (rule.type) {
    case "pr-state": return PR_STATES.includes(rule.state) ? [] : [`pr-state rule needs state ${PR_STATES.join("|")}`];
    case "check": return typeof rule.name === "string" && rule.name.trim() && CONCLUSIONS.includes(rule.conclusion)
      ? [] : [`check rule needs a name and conclusion ${CONCLUSIONS.join("|")}`];
    case "file": {
      if (typeof rule.path !== "string" || !rule.path.trim()) return ["file rule needs a path"];
      if (typeof rule.exists !== "boolean" && !validPattern(rule.contains)) return ["file rule needs exists (true|false) or contains (text)"];
      return [];
    }
    case "exec":
    case "exec-absent": {
      if (typeof rule.step !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(rule.step)) return [`${rule.type} rule needs a step name (lowercase words joined by dashes)`];
      if (rule.type === "exec-absent") return validPattern(rule.matches) ? [] : ["exec-absent rule needs matches (a valid pattern)"];
      if (rule.exit !== undefined && !Number.isInteger(rule.exit) && !["nonzero", "any"].includes(rule.exit)) return ["exec rule: exit is a number, nonzero or any"];
      return rule.matches === undefined || validPattern(rule.matches) ? [] : ["exec rule: matches is not a valid pattern"];
    }
    case "output": return validPattern(rule.matches) ? [] : ["output rule: matches is empty or not a valid pattern"];
    default: return [`unknown pass rule type "${rule.type}" (use pr-state, check, file, exec, exec-absent or output)`];
  }
}

export function validateCatalog(c) {
  const p = [];
  if (!c || !Array.isArray(c.scenarios)) return ["needs { scenarios: [{ id, title, where, source, prompt, pass }] }"];
  const seen = new Set();
  for (const [i, s] of c.scenarios.entries()) {
    const name = typeof s?.id === "string" && s.id ? `scenario "${s.id}"` : `scenario #${i + 1}`;
    const bad = (m) => p.push(`${name}: ${m}`);
    if (!s || typeof s !== "object") { bad("must be an object"); continue; }
    if (typeof s.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) bad("id must be lowercase words joined by dashes");
    else if (seen.has(s.id)) bad("duplicate id");
    seen.add(s.id);
    for (const k of ["title", "prompt", "source"]) if (typeof s[k] !== "string" || !s[k].trim()) bad(`${k} is empty`);
    if (!["branch", "main"].includes(s.where)) bad("where must be branch or main");
    if (!Array.isArray(s.pass) || !s.pass.length) bad("needs at least one pass rule");
    else {
      for (const rule of s.pass) for (const m of validatePassRule(rule)) bad(m);
      // Floor: the verdict needs evidence code wrote, unless the scenario tests what Claude says (and says why).
      const mb = s["model-behaviour"];
      if (mb !== undefined && (typeof mb !== "string" || !mb.trim())) bad('"model-behaviour" needs the reason as text');
      else if (!mb && !s.pass.some((r) => r && r.type !== "output")) bad('needs at least one rule that code reads (exec, file, pr-state or check), or "model-behaviour": "<reason>"');
    }
  }
  return p;
}

export function validate(studio) {
  const problems = [];
  const files = readRecordFiles(studio);
  for (const f of files) {
    if (!f.record) problems.push(`releases/${f.file}: not valid JSON (${f.error})`);
    else problems.push(...validateRecord(f.record, f.file).map((m) => `releases/${m}`));
  }
  const cat = join(studio, "releases/scenarios.json");
  let where = null;
  if (existsSync(cat)) {
    try {
      const c = JSON.parse(readFileSync(cat, "utf8"));
      problems.push(...validateCatalog(c).map((m) => `releases/scenarios.json: ${m}`));
      where = new Map(list(c.scenarios).map((s) => [s?.id, s?.where]));
    } catch (e) { problems.push(`releases/scenarios.json: not valid JSON (${e.message})`); }
  }
  if (where)
    for (const { record: r } of files.filter((f) => f.record))
      for (const [under, ids] of [["branch", Array.isArray(r.checks?.branch) ? r.checks.branch : []], ["main", list(r.checks?.main)]])
        for (const id of ids) {
          if (!where.has(id)) problems.push(`releases/${r.version}.json: scenario "${id}" is not in releases/scenarios.json`);
          else if (where.get(id) !== under) problems.push(`releases/${r.version}.json: "${id}" is a ${where.get(id)} scenario but is listed under checks.${under}`);
        }
  let current = null;
  try { current = studioVersion(studio); } catch { problems.push("plugins/studio/.claude-plugin/plugin.json: cannot read the version"); }
  if (current && cmp(current, LEGACY_LAST) > 0 && !files.some((f) => f.record?.version === current)) problems.push(`The plugin version ${current} has no record releases/${current}.json.`);
  const rendered = render(studio);
  const have = existsSync(join(studio, "CHANGELOG.md")) ? readFileSync(join(studio, "CHANGELOG.md"), "utf8") : null;
  if (have !== rendered) problems.push("CHANGELOG.md is not what `node scripts/release.mjs render` produces (it is written only by that command).");
  return problems;
}

// ---------- CHANGELOG.md (written only by code) ----------

const HEADER = `# Changelog

All notable changes to the studio harness, newest first. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

This file is written only by \`node scripts/release.mjs render\` from \`releases/<version>.json\`; do not edit it. Releases up to ${LEGACY_LAST} are kept unchanged in \`docs/CHANGELOG-legacy.md\`.
`;

export function renderEntry(r) {
  const live = /^pending/i.test(mainStatus(r)) ? "pending" : mainStatus(r);
  const steps = (kind, v) => (list(v).length ? `**${kind} action:** ${list(v).map((s, i) => `${i + 1}. ${s}`).join(" ")}` : `**${kind} action:** none.`);
  const lines = [
    `## [${r.version}] - ${r.date}`,
    "",
    `Live check: ${live}`,
    "",
    `- ${r.summary}${refText(r)}.`,
    list(r.appCreator).length ? `- For the App Creator: ${list(r.appCreator).join("; ")}.` : "- For the App Creator: nothing changes.",
    `- ${steps("App", r.appActions)}`,
    `- ${steps("Admin", r.adminActions)}`,
    `- Checks: branch ${branchText(r)}; main ${list(r.checks?.main).join(", ") || "none"}.`,
    list(r.notVerified).length ? `- Not verified: ${list(r.notVerified).join("; ")}.` : "- Not verified: nothing noted.",
  ];
  return lines.join("\n");
}

export function render(studio) {
  const records = readRecordFiles(studio).filter((r) => r.record && VERSION.test(r.record.version ?? "")).map((r) => r.record).sort((a, b) => cmp(b.version, a.version));
  const legacyFile = join(studio, "docs/CHANGELOG-legacy.md");
  const legacy = existsSync(legacyFile)
    ? readFileSync(legacyFile, "utf8").replace(/\r\n/g, "\n").split(/\n(?=## \[)/).filter((p) => /^## \[/.test(p)).map((p) => p.trim()).filter((p) => !records.some((r) => p.startsWith(`## [${r.version}]`)))
    : [];
  return `${HEADER}\n${[...records.map(renderEntry), ...legacy].join("\n\n")}\n`;
}

/** Pure: the record with status.main set to passed. */
export function passMain(record, date) {
  if (!record) return { error: "No such record. Legacy entries (up to 0.36.2) are already settled." };
  if (!/^pending/i.test(String(record.status?.main))) return { error: `${record.version} is not pending (status.main is "${record.status?.main}").` };
  return { record: { ...record, status: { ...record.status, main: `passed ${date}` } } };
}

// ---------- CLI ----------

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined; };
const OPTS_WITH_VALUE = new Set(["--since", "--for", "--where", "--version", "--kind", "--studio", "--date"]);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !OPTS_WITH_VALUE.has(arr[i - 1]));

function main() {
  const cmd = argv[0];
  const studio = resolve(opt("--studio") ?? join(here, ".."));
  const json = flag("--json");
  const out = (res) => {
    console.log(json ? JSON.stringify(res.data ?? { ok: res.ok, text: res.text }, null, 2) : res.text);
    process.exit(res.ok === false ? 1 : 0);
  };
  const need = (v, what) => { if (!v) { console.error(`usage: release.mjs ${cmd} ${what}`); process.exit(2); } return v; };
  const all = () => loadAll(studio);
  switch (cmd) {
    case "gate": return out(gate(all(), studioVersion(studio), need(opt("--since"), "--since <version>")));
    case "summary": return out(summary(all(), studioVersion(studio), need(opt("--since"), "--since <version>")));
    case "actions": return out(actions(all(), studioVersion(studio), need(opt("--since"), "--since <version> --for app|admin"), opt("--for") === "admin" ? "admin" : "app"));
    case "details": return out(details(all(), need(positional[0], "<version>")));
    case "scenarios": {
      const where = opt("--where") === "main" ? "main" : "branch";
      const f = join(studio, "releases/scenarios.json");
      return out(scenarios(all(), need(positional[0], "<version> --where branch|main"), where, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null));
    }
    case "pending": return out(pending(all()));
    case "new": {
      const res = newRecord(all(), studioVersion(studio), opt("--version"), opt("--kind"));
      if (res.ok) {
        const file = join(studio, "releases", `${res.version}.json`);
        if (existsSync(file)) return out({ ok: false, text: `${file} already exists.` });
        writeFileSync(file, `${JSON.stringify(res.record, null, 2)}\n`);
      }
      return out(res);
    }
    case "validate": {
      const problems = validate(studio);
      return out({ ok: !problems.length, data: { problems }, text: problems.length ? problems.map((p) => `FAIL: ${p}`).join("\n") : "Release data is valid and CHANGELOG.md is in step." });
    }
    case "render": {
      const text = render(studio);
      const file = join(studio, "CHANGELOG.md");
      const same = existsSync(file) && readFileSync(file, "utf8") === text;
      if (flag("--check")) return out({ ok: same, text: same ? "CHANGELOG.md is in step." : "CHANGELOG.md differs from the records: run `node scripts/release.mjs render`." });
      if (!same) writeFileSync(file, text);
      return out({ ok: true, text: same ? "CHANGELOG.md already in step." : "CHANGELOG.md written." });
    }
    case "pass-main": {
      const v = need(positional[0], "<version> [--date YYYY-MM-DD]");
      const file = join(studio, "releases", `${v}.json`);
      const res = passMain(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null, opt("--date") ?? isoDate());
      if (res.error) return out({ ok: false, text: res.error });
      writeFileSync(file, `${JSON.stringify(res.record, null, 2)}\n`);
      writeFileSync(join(studio, "CHANGELOG.md"), render(studio));
      return out({ ok: true, text: `${v}: status.main is now "${res.record.status.main}"; CHANGELOG.md rendered.` });
    }
    default:
      console.error("usage: release.mjs gate|summary|actions|details|scenarios|new|validate|pass-main|pending|render (see the top of this file)");
      process.exit(2);
  }
}

if (process.argv[1]?.endsWith("release.mjs")) main();
