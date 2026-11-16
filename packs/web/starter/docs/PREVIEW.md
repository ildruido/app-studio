# Private preview

The owner's private copy of the web app. It runs on Render from `render.yaml`, on paid plans (about $13 a month in 2026; check render.com/pricing before signing up). The free plans are fine for a throwaway trial only: the free database is deleted after 30 days.

## Set-up (once, about 10 minutes, on a computer)

1. Sign up at render.com with GitHub and let it see the `{{slug}}` repo.
2. New > Blueprint > pick the repo and the branch with `render.yaml` > Apply.
3. Deploys on release: Render > `{{slug}}-preview` > Settings > Deploy Hook > copy the URL. Then GitHub > the `{{slug}}` repo > Settings > Secrets and variables > Actions > New repository secret: name `RENDER_DEPLOY_HOOK`, value the URL. From then on every release deploys by itself.
4. When it is live, the log shows `sign-in: <mode>` (the `SIGN_IN_MODE` setting from the App profile's access model). With `invite`, find the line `First invite (one use, …): https://…/#/invite/…`, open that link on the phone and create the account; once you have signed in, delete the `BOOTSTRAP_INVITE` setting in Render (Environment) so no invite is printed again. With `open`, open the site and choose "Create an account". With `none` there is no account: the site opens straight away.

## Every release: deploys by itself

A release (a merge that changes the version in `package.json`) deploys the app through `.github/workflows/deploy.yml`. Ordinary merges don't (`autoDeploy: false`). To deploy something else, or if the `RENDER_DEPLOY_HOOK` secret is missing: Render > `{{slug}}-preview` > Manual Deploy > Deploy latest commit. A test script starts by checking the app shows the released version. Migrations run at start-up.

## Notes

- On the free plans the site sleeps when idle (the first load takes about a minute) and the database is deleted after 30 days. Export the data first if it matters.
- `PUBLIC_URL` is taken from the address Render reports. Keys live only in Render's settings, never in the repo.
- Render puts its own proxies in front, so the per-address sign-in limits are approximate there (the per-account limits still hold).
- Before inviting anyone else, do the steps under "Test account" below.

## Test account

For testing without a real mailbox. In Render > Environment add `TEST_ACCOUNT_PASSWORD` (10 to 200 characters), then redeploy. After the restart you can sign in as `test@example.com` with that password (`TEST_ACCOUNT_EMAIL` changes the address; a new address makes a second account). Anyone with the link and the password gets in, so keep the link private.

**Before inviting anyone else:** delete `TEST_ACCOUNT_PASSWORD` first, then remove the account with `node dist/src/admin.js delete-user test@example.com`. Deleting the account while the setting is still there brings it back at the next start.

## Later invites and admin

Use `BOOTSTRAP_INVITE` only for the first account; for more, run `node dist/src/admin.js invite` in the service's Shell (paid plans), or locally against the database's external connection string from Render (see `server/README.md`).
