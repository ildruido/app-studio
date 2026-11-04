// Decides which files of this private repo are copied to the public mirror, and builds that tree.
// Used by .github/workflows/mirror.yml:  tsx scripts/mirror/public-tree.ts <outDir>
// Private on purpose: project files, the harness, deploy config, CI, and the mirror tooling itself.
// A new project file or folder goes on these lists in the same PR that adds it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PRIVATE_PREFIXES = [
  ".claude/",
  ".github/",
  "docs/",
  "scripts/mirror/",
  "scripts/roadmap/",
];
export const PRIVATE_FILES = new Set([
  "CLAUDE.md",
  "README.md", // replaced by the public README
  "render.yaml",
  "tests/unit/roadmap.test.ts",
  "tests/unit/mirror.test.ts",
]);
// Scripts in package.json that only work with the private files.
export const PRIVATE_NPM_SCRIPTS = ["roadmap:check", "roadmap:data"];

export function isPublicPath(path: string): boolean {
  return !PRIVATE_FILES.has(path) && !PRIVATE_PREFIXES.some((p) => path.startsWith(p));
}

export function publicPackageJson(json: string): string {
  const pkg = JSON.parse(json) as { scripts?: Record<string, string> };
  for (const name of PRIVATE_NPM_SCRIPTS) delete pkg.scripts?.[name];
  return JSON.stringify(pkg, null, 2) + "\n";
}

function main(outDir: string): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && isPublicPath(f));
  for (const f of files) {
    const to = join(outDir, f);
    mkdirSync(dirname(to), { recursive: true });
    if (f === "package.json") {
      writeFileSync(to, publicPackageJson(readFileSync(join(root, f), "utf8")));
    } else {
      copyFileSync(join(root, f), to);
    }
  }
  copyFileSync(join(root, "scripts/mirror/PUBLIC-README.md"), join(outDir, "README.md"));
  const license = join(root, "scripts/mirror/LICENSE");
  if (existsSync(license)) copyFileSync(license, join(outDir, "LICENSE"));
  process.stdout.write(`Public tree: ${files.length} app files in ${outDir}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: public-tree.ts <outDir>");
    process.exit(2);
  }
  main(out);
}
