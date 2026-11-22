# Hosting and previews (Cloudflare, free)

The site is plain files, published to Cloudflare's free static hosting (Pages) by `.github/workflows/deploy.yml`. Nothing runs on a server. Cost: the hosting is free; only a domain name costs money (optional: the free `{{slug}}.pages.dev` address works).

## Set-up (once, about 10 minutes, on a computer)

1. Sign up (free) at dash.cloudflare.com.
2. Copy your **Account ID**: dash.cloudflare.com > Workers & Pages > the "Account ID" box on the right.
3. Make the deploy key (Cloudflare's screens change now and then; if yours differ, look for the permission **Cloudflare Pages: Edit** on an **account** token): top right profile icon > Profile > API credentials > API Tokens > Create token > name it `{{slug}}-deploy` > Policies: **Start from scratch** > **Start with an Account policy** > pick your account > search "Pages" > **Cloudflare Pages: Edit** > close the panel > Token expiration: **1 year** > Continue to summary > Create Token. Copy the token now (it is shown once). **The token expires after 1 year and deploys stop then**, so add a renewal reminder to your backlog (make a new token the same way and replace the `CLOUDFLARE_API_TOKEN` secret).
4. In GitHub, the `{{slug}}` repo > Settings > Secrets and variables > Actions > Secrets > New repository secret. Add `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the Account ID).
5. GitHub > Actions > Deploy > Run workflow (branch main). The first run creates the Cloudflare project and publishes the live site at `https://{{slug}}.pages.dev`. If the repo has a different name from the Cloudflare project you want, add a repository variable `CLOUDFLARE_PROJECT` first (Settings > Secrets and variables > Actions > Variables > New repository variable).
6. Optional, your own domain: Cloudflare > Workers & Pages > the project > Custom domains > Set up a domain. Then add the repository variable `SITE_URL` with the full address (for example `https://example.com`) so canonical and alternate links use it.

From then on a release (a merge that changes `version` in `package.json`) publishes by itself. Until step 4 is done, previews and deploys say what is missing; they do not fail ordinary PRs.

## Previews: one link per pull request

Every ready PR from this repo is published at `https://pr-<number>.{{slug}}.pages.dev`, and the link is posted on the PR (the comment is updated on each push).

**Previews are public.** Anyone with the link can open one. They are not listed anywhere and send `X-Robots-Tag: noindex, nofollow` (so search engines skip them), but a link shared by mistake shows a draft to the world. Keep unpublished or private content out of previews, or protect them as below.

**Protect previews with Cloudflare Access (one click).** Cloudflare dashboard > Workers & Pages > `{{slug}}` > Settings > General > **Enable access policy**. This locks every preview address behind a Cloudflare sign-in for your Cloudflare account (the live site and your domain stay public). The first time, Cloudflare may ask you to set up Zero Trust: choose the Free plan (up to 50 users) and a team name. To let other people see previews, add them in Cloudflare Zero Trust > Access > Policies (the policy is named after the project). The PR comment still shows the link; it asks for sign-in.

**Switch previews off.** GitHub > Settings > Secrets and variables > Actions > Variables > New repository variable `PREVIEWS` = `off`. Delete it to turn them back on.

## Content from a separate repo (optional)

By default posts live in `content-sample/` in this repo, one file per post and language: `en/<slug>.mdx`, `it/<slug>.mdx`. To keep real content in another repo:

1. Put the same layout in the content repo (`en/…`, `it/…`).
2. Here: Settings > Secrets and variables > Actions > Variables: `CONTENT_REPO` = `owner/content-repo`, and optionally `CONTENT_REF` = a branch, tag or commit (default `main`; pin a tag or commit to publish only reviewed content).
3. If the content repo is private: GitHub profile > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token. Repository access: Only select repositories > the content repo. Permissions: Repository permissions > Contents > Read-only. Copy it into a repository secret here named `CONTENT_REPO_TOKEN`.
4. Previews and the live site then build with that content. CI and the browser tests always use `content-sample/`, so they need no token.
5. To publish when the content repo changes, add a workflow there that runs on a push to its `main` and calls `gh api repos/<owner>/{{slug}}/dispatches -f event_type=content-updated` with a token secret that may write to this repo (Contents: Read and write). The Deploy workflow here then redeploys main with the newest content.

A merge in the content repo is then a publish: protect that repo's `main` the way this one is protected.

## Notes

- The deploy token can publish this one Cloudflare account's Pages projects and nothing else. Keep it only in the GitHub secret, never in the repo, issues or chat.
- A PR that changes `.github/workflows/` or the npm scripts can read the deploy secrets when its preview runs: review those changes first (the reviewer checklist says so).
- Previews are deleted by Cloudflare after 30 days (the 100 newest are kept).
