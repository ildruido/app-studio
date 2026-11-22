# Static-site pack: release steps

The `release` skill's step 9 (build and ship) follows this.

1. CI on the release commit is green (`CI gate` and `health`), including the browser tests.
2. Run `npm run build` with the content the release should publish (the repository variable `CONTENT_REF` pins the content repo to a branch, tag or commit); check `dist/` has both languages.
3. **Deploy (Cloudflare Pages):** the release deploys by itself: `.github/workflows/deploy.yml` publishes `main` when the version in `package.json` changes. Check that the Deploy run passed (Actions > Deploy). If it failed because `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is missing, tell the App Creator the one-time setup in `docs/PREVIEW.md` and run Deploy by hand once it is done.
4. Check the live site at the address Cloudflare reports, not a guessed one: `SITE_URL`, else the address in the Deploy run's summary ("Cloudflare address"). A `pages.dev` name can be taken by someone else, and Cloudflare then adds a suffix (`my-site-2ko.pages.dev`). The Deploy run already fails if the live page is not this site (`scripts/live-check.mjs` compares its `<title>`); never report a release address you did not read from the run or the variable. Then: `/en/` and `/it/` load, a post opens, the 404 page shows for a missing address, and the page source has no preview `noindex` header (`curl -I` the live address: no `x-robots-tag: noindex`).
5. If the release changed hosting settings, secrets or variables, list them in the handoff with where to set them.
6. Tell the App Creator whether anything on Cloudflare or GitHub needs them (a missing secret, a domain).
