# Static-site pack: review checklist

For the `reviewer` agent. A breach is blocking unless noted.

- **Deploy secrets.** A PR that changes `.github/workflows/`, `package.json` scripts, `scripts/` or `wrangler` settings can read `CLOUDFLARE_API_TOKEN` when its preview runs: read every such change line by line; nothing prints, sends or stores a secret.
- **Secrets.** No key, token, `.env` or private-key text in the diff, content, tests or logs.
- **Published content.** A change that adds a page, a post or an image is something visitors can read: check the text, personal details and image sources. Content that is not ready for the public does not go in a PR whose preview is public; it waits in `draft: true`, in the content repo behind Access, or on a branch without a preview.
- **Merging content.** If published content lives in a separate repo, Claude never merges or approves there when the App profile says the App Creator does.
- **Headers.** `public/_headers` is not loosened (no `unsafe-eval`, no wildcard script sources) without a recorded reason and a test.
- **Third-party code.** A new script, font or embed loaded from another site is a decision (privacy, speed, the Content-Security-Policy): record it in `docs/PRD.md` Decisions.
- **Both languages and accessibility.** A new page or string exists in both languages; the browser tests were not weakened (no skipped or loosened axe rule without a reason in the PR).
- **Dependencies.** A new dependency is justified; the lock file changes with `package.json`.
