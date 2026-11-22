// Runs one check; when it fails, prints a short summary (what failed, file:line, message) as the last lines of
// the step, adds GitHub error annotations and appends it to the run's summary page. The full output is still
// printed above, so nothing is lost. Used by CI: `node scripts/ci-run.mjs <label> -- <command...>`.
//   Exit code = the command's exit code.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { summarize } from "../plugins/studio/hooks/failure-summary.mjs";

export function run(label, cmd, { env = process.env, write = (s) => process.stdout.write(s) } = {}) {
  const res = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  write(out);
  if (res.status === 0) return 0;
  const summary = summarize(out, { label });
  write(`\n==== ${summary.split("\n")[0]}\n${summary.split("\n").slice(1).join("\n")}\n====\n`);
  for (const m of summary.matchAll(/^- (.+)\n {2}at (\S+?):(\d+)(?::\d+)?\n(?: {2}(.+))?/gm)) {
    const msg = `${m[1]}${m[4] ? `: ${m[4]}` : ""}`.replace(/[\r\n%]/g, " ");
    write(`::error file=${m[2]},line=${m[3]},title=${label}::${msg}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${label}\n\`\`\`\n${summary}\n\`\`\`\n`);
  return res.status ?? 1;
}

if (process.argv[1]?.endsWith("ci-run.mjs")) {
  const sep = process.argv.indexOf("--");
  if (sep < 3) { console.error("usage: ci-run.mjs <label> -- <command...>"); process.exit(2); }
  process.exit(run(process.argv.slice(2, sep).join(" "), process.argv.slice(sep + 1)));
}
