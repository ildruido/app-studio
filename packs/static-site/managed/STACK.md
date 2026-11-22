# Static-site pack: a content site with no server

The app ships as plain files (`npm run build` writes `dist/`): [Astro](https://astro.build) pages and MDX posts, English and Italian, published to Cloudflare's free static hosting (Pages) by GitHub Actions. There is no server, no database, no sign-in and no AI in this pack.

## What the pack gives you

- Astro 7 with MDX, a language folder in the address (`/en/…`, `/it/…`; the bare address goes to `/en/`), a home page, a blog list and post pages, a 404 page, `hreflang` links, a skip link and a light and dark theme. The words of the site itself are in `src/lib/i18n.ts`.
- Posts as content: `content-sample/<lang>/<slug>.mdx` (front matter: `title`, `date`, optional `description`, optional `draft: true`). With the repository variable `CONTENT_REPO` the real posts come from a separate repo (`docs/PREVIEW.md`); `content-sample/` stays for the tests.
- npm scripts the harness relies on: `dev`, `check` (format, lint, typecheck, unit tests, build), `test`, `test:e2e`, `build`.
- CI (`ci.yml`) with the `CI gate` job, the `Harness` workflow's `health` job and the `Release tag` workflow, like every app.
- `deploy.yml`: a public preview link per PR, production on release, a manual run, and a redeploy when the content repo says `content-updated`. Setup (Cloudflare account, token, secrets, Access) is in `docs/PREVIEW.md`.
- Browser tests (`e2e/`): every page in both languages on a desktop and on a phone: right `lang`, an alternate language link, no accessibility violations (axe, WCAG A and AA), no sideways scroll, the language switch, the 404 page.

## Known limits

- **Static only.** No server code, forms that store data, sign-in or runtime AI. A site that needs them needs another pack (and a harness idea first).
- **The `base` pack does not go with this one.** This pack carries its own build, lint and test setup (Astro, not Vite), so it replaces `base`; do not add `base`, `web` or `artifact` to the same app.
- **No platform layer.** Pages do not call `getPlatform()`; there is nothing to call.
- **Previews are public** (see below and `docs/PREVIEW.md`).
- **One host.** Cloudflare Pages. Cloudflare is moving Pages and Workers static assets together; Pages still works and has the one-click preview protection this pack documents. If Cloudflare retires it, a later pack release moves to Workers static assets.
- **The real deploy is not tested in app-studio** (it needs your Cloudflare account); the build, checks, browser tests and the workflow files are.
- **Two languages are built in** (`en`, `it`). More means editing `src/lib/i18n.ts`.

## Rules

- **Previews are public.** Anyone with a preview link can open it. Keep private or unpublished content out of previews, or turn on Cloudflare Access for them (`docs/PREVIEW.md`); previews send `noindex`.
- **Secrets** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CONTENT_REPO_TOKEN`) live only in GitHub's secrets, never in the repo, the built site, the logs or the test output. CI scans for keys.
- **Content repo.** If published content lives in a separate repo, a merge there is a publish; decide in the App profile who may merge it.
- **Accessibility and phone first.** A page change keeps the browser tests green: both languages, WCAG A and AA, no sideways scroll at phone width.
- **No runtime code from outside.** The headers (`public/_headers`) allow scripts and styles from the site itself only; loosening them is a decision to record, with a test.
- **Both languages.** A new page or word goes into both `en` and `it` (a unit test fails if a word is missing from one).
