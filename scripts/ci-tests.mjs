// Runs every scripts/*.test.mjs, one ci-run per file, so a failure still names the file and file:line.
// A new test file needs no workflow change and no import from another suite. Used by CI: `node scripts/ci-tests.mjs`.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./ci-run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const testFiles = () => readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

if (process.argv[1]?.endsWith("ci-tests.mjs")) {
  let failed = 0;
  for (const f of testFiles()) {
    const code = run(f, ["node", "--test", "--test-reporter=spec", join("scripts", f)]);
    console.log(`${code === 0 ? "ok  " : "FAIL"} ${f}`);
    if (code !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}
