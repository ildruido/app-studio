// Which live-check scenarios a change needs, by code (#272). Each scenario in releases/scenarios.json declares `covers`:
// globs of the app-facing files whose behaviour it exercises. `**` matches across folders, `*` within one.
// Callers pass app-facing files only (branch-gate.mjs appFacing), so this file has no imports.

export const globRe = (g) =>
  new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*") + "$");

export const covers = (scenario, file) => (Array.isArray(scenario?.covers) ? scenario.covers : []).some((g) => globRe(g).test(file));

/** Scenario ids of `where` whose `covers` match a app-facing file in `files`. */
export function requiredScenarios(catalog, files, where = "branch") {
  return (catalog ?? []).filter((s) => s.where === where && files.some((f) => covers(s, f))).map((s) => s.id);
}

/** App-facing changed files that no scenario (of any kind) covers. */
export function uncoveredFiles(catalog, files) {
  return files.filter((f) => !(catalog ?? []).some((s) => covers(s, f)));
}

/** Required scenarios the record neither lists nor skips (with a reason). */
export function missingScenarios(catalog, files, record) {
  const have = new Set([...(Array.isArray(record?.checks?.branch) ? record.checks.branch : []), ...(record?.checks?.skipped ?? []).map((s) => s.id)]);
  return requiredScenarios(catalog, files).filter((id) => !have.has(id));
}

// ---------- regression set (#273) ----------
// Scenarios marked `"regression": true` (branch ones only) are a small standing net for behaviour only a live check can prove.
// Code adds them to a release's branch check by rule; the rule and the last pass come from the release records, never from memory.
export const REGRESSION_EVERY = 5; // every 5th app-facing release (counted from the records) ...
export const REGRESSION_MAX_DAYS = 14; // ... or when the last pass is older than this

export const regressionSet = (catalog) => (catalog ?? []).filter((s) => s.regression === true && s.where === "branch").map((s) => s.id);

/** The last record (ascending order) whose status.regression says passed: { version, date } or null. */
export function lastRegression(records) {
  for (const r of [...records].reverse()) {
    const m = /^passed (\d{4}-\d{2}-\d{2})$/.exec(r?.status?.regression ?? "");
    if (m) return { version: r.version, date: m[1] };
  }
  return null;
}

/** Why this release must run the regression set, or null. `records` are the other releases, oldest first; `today` is YYYY-MM-DD. */
export function regressionDue(records, kind, today) {
  if (kind === "internal") return null;
  if (kind === "loader") return "a loader or setup release reaches every app";
  const last = lastRegression(records);
  if (!last) return "no regression pass is recorded yet";
  const since = records.slice(records.findIndex((r) => r.version === last.version) + 1).filter((r) => r.kind !== "internal").length;
  if (since + 1 >= REGRESSION_EVERY) return `this is app-facing release ${since + 1} since the last pass (${last.version})`;
  const days = (Date.parse(today) - Date.parse(last.date)) / 864e5;
  if (days > REGRESSION_MAX_DAYS) return `the last pass (${last.version}, ${last.date}) is ${Math.floor(days)} days old`;
  return null;
}
