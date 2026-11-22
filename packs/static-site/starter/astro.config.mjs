import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// A static site: `astro build` writes plain files to dist/ and nothing runs on a server.
// SITE_URL is the public address (used for canonical and alternate links); the deploy workflow sets it.
export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4321",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],
  // The default language lives under /en/; the bare address goes there.
  redirects: { "/": "/en/" },
});
