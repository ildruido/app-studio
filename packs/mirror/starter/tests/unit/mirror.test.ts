import { describe, expect, it } from "vitest";
import { isPublicPath, publicPackageJson } from "../../scripts/mirror/public-tree";

describe("public mirror", () => {
  it("keeps project files private", () => {
    for (const p of [
      "CLAUDE.md",
      "README.md",
      "render.yaml",
      ".claude/skills/release/SKILL.md",
      ".github/workflows/ci.yml",
      "docs/BACKLOG.md",
      "scripts/mirror/public-tree.ts",
      "scripts/roadmap/cli.ts",
      "tests/unit/roadmap.test.ts",
      "tests/unit/mirror.test.ts",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("publishes the app's code", () => {
    for (const p of [
      "src/main.ts",
      "index.html",
      "package.json",
      "tests/unit/platform.test.ts",
      "CHANGELOG.md",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("drops scripts that need private files", () => {
    const pkg = JSON.parse(
      publicPackageJson(
        JSON.stringify({
          scripts: { test: "vitest run", "roadmap:check": "x", "roadmap:data": "y" },
        }),
      ),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts).toEqual({ test: "vitest run" });
  });
});
