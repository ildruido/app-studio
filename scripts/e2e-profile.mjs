// A filled-in App profile for the throwaway apps of scripts/e2e.test.mjs and scripts/behaviour-check.mjs (issue #216):
// every template row gets a real value and the remaining prose placeholders are replaced, so health passes.
export const PROFILE = {
  App: "E2E App",
  Phase: "`build`",
  "Id prefix": "`EE`",
  Stack: "`artifact`",
  User: "the player",
  Repo: "https://github.com/example/e2e-app (private)",
  "Release target": "none",
  "Preview target": "none",
  Capabilities: "none",
  AI: "`off`",
  "AI plan": "none",
  "Access model": "`only invited people`",
  "Storage shape": "`per-person documents`",
  "Owner-merged repos": "`example/content-repo`",
  "AI public use": "n/a",
};

/** The template's CLAUDE.md with the App profile filled in (`rows` overrides PROFILE) and `rule` as the one Domain rule. */
export function fillProfile(md, { rows = {}, rule = "Scores are never shown to other players." } = {}) {
  const fill = { ...PROFILE, ...rows };
  return md
    .replace(/^- <rule>$/m, `- ${rule}`)
    .split("\n")
    .map((l) => {
      const m = /^\| ([^|]+?)\s+\|/.exec(l);
      return m && fill[m[1]] ? `| ${m[1]} | ${fill[m[1]]} |` : l;
    })
    .join("\n")
    .replace(/<[A-Za-z][^<>\n]*>/g, "x");
}
