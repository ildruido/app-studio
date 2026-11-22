import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Lints the TypeScript and JavaScript files. Astro and MDX pages are checked by `astro check` (typecheck).
export default tseslint.config(
  {
    ignores: [
      "**/dist",
      ".astro",
      "content",
      "coverage",
      "playwright-report",
      "test-results",
      "node_modules",
      ".claude",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  prettier,
);
