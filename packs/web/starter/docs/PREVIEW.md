# Private preview

A temporary copy of the web app for the owner to test on a phone. It runs on Render (free plan) from `render.yaml`. This is a test host, not the hosting decision.

## Set-up (once, about 10 minutes, on a computer)

1. Sign up at render.com with GitHub and let it see the `{{slug}}` repo.
2. New > Blueprint > pick the repo and the branch with `render.yaml` > Apply. It asks for `ANTHROPIC_API_KEY`: paste a key from console.anthropic.com (a spend limit of a few dollars is plenty). The AI endpoint uses this key, not a Claude plan.
3. When it is live, open Logs and find the line `First invite (one use, …): https://…/#/invite/…`. Open that link on the phone and create the account. Once you have signed in, delete the `BOOTSTRAP_INVITE` setting in Render (Environment) so no invite is printed again.

## Every release: deploy by hand

The preview does not deploy by itself (`autoDeploy: false`). After each merge that changes the web app: Render > `{{slug}}-preview` > Manual Deploy > Deploy latest commit. Every test script for the preview starts with this step. Migrations run at start-up.

## Notes

- The free site sleeps when idle (the first load takes about a minute) and the free database is deleted after 30 days. Export the data first if it matters.
- `PUBLIC_URL` is taken from the address Render reports. Keys live only in Render's settings, never in the repo.
- Render puts its own proxies in front, so the per-address sign-in limits are approximate there (the per-account limits still hold).
- Do not send invites to anyone else until the app has a real hosting plan.

## Test account

For testing without a real mailbox. In Render > Environment add `TEST_ACCOUNT_PASSWORD` (10 to 200 characters), then redeploy. After the restart you can sign in as `test@example.com` with that password (`TEST_ACCOUNT_EMAIL` changes the address; a new address makes a second account). Anyone with the link and the password gets in, so keep the link private.

**Before real hosting or any invite to others:** delete `TEST_ACCOUNT_PASSWORD` first, then remove the account with `node dist/src/admin.js delete-user test@example.com`. Deleting the account while the setting is still there brings it back at the next start.

## Later invites and admin

Render's free plan has no shell. Use `BOOTSTRAP_INVITE` only for the first account; for more, run `node dist/src/admin.js invite` on a paid instance, or locally against the database's external connection string from Render (see `server/README.md`).
