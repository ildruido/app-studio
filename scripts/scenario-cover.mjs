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
