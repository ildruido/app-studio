# Static-site pack: QA checklist

For the `qa` agent. Browser tests are in `e2e/` and run against the built site with the sample content (`npm run test:e2e`).

- **Both languages.** Every page exists in `en` and `it`, with the right `<html lang>`, a working language switch and an `hreflang` alternate; the bare address goes to `/en/`.
- **Accessibility.** No axe violations (WCAG A and AA) on any page; keyboard: the skip link works, focus is visible, every control reachable with the Tab key; images have `alt` text.
- **Phone width.** No horizontal scroll at 375 px; text readable without zooming; light and dark theme.
- **404.** A missing address shows the 404 page with status 404.
- **Content.** A new post shows in the blog list (newest first), opens, and a `draft: true` post does not appear.
- **Build output.** `dist/` has no `sk-ant-` key, token or private key; no leftover `localhost` address in canonical links when `SITE_URL` is set.
- **Preview.** The PR has a preview comment with a working link, and the preview answers with `x-robots-tag: noindex`. If previews are protected by Cloudflare Access, the link asks for sign-in. Say so when the Cloudflare secrets are not set and no preview could be made.
