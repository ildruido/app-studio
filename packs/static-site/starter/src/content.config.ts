import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Posts are files named <language>/<slug>.md or .mdx. They come from CONTENT_DIR: this repo's
// `content-sample/` by default (also what the tests use), or a checkout of a separate content repo
// (the CI workflow puts it in `content/` when the repository variable CONTENT_REPO is set).
const base = process.env.CONTENT_DIR ?? "./content-sample";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
