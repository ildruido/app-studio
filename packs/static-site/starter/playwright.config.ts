import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the BUILT site (what is deployed), on a desktop and on a phone.
const URL = "http://localhost:4321";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  ...(process.env.CI && { globalTimeout: 6 * 60_000 }),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: URL,
    trace: "on-first-retry",
    // Cloud sessions ship a Chromium that may not match this Playwright version.
    ...(process.env.PW_CHROMIUM && { launchOptions: { executablePath: process.env.PW_CHROMIUM } }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Always the sample content, so the tests do not depend on a content repo.
    command: "npx astro build && node scripts/serve.mjs 4321",
    url: URL,
    timeout: 120_000,
    env: { CONTENT_DIR: "./content-sample" },
    reuseExistingServer: !process.env.CI,
  },
});
