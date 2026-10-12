# Web pack: release steps

The `release` skill's step 9 (build and ship) follows this.

1. CI on the release commit is green, including the server job and the container build.
2. The host runs the container built from `server/Dockerfile` (`docker build -f server/Dockerfile .`; the image holds the server and the built site). Migrations run when it starts.
3. **Preview (Render):** it does not deploy by itself. After each merge or release, Ale does Render > the preview service > Manual Deploy > Deploy latest commit. Claude cannot do this from a cloud session, so **every test script for the web app starts with that step** and names the commit or version to expect (`/api/health` reports the version).
4. Check the live site: `/api/health` shows the new version, the sign-in screen loads, one document saves and loads back.
5. A release that changes the database adds a migration; say in the handoff that it runs on the first start. A release that adds an environment variable lists it with where to set it.
6. In the handoff, say whether anything on the host needs Ale (a new setting, a deploy).

Before the app is shared with anyone else, or gets a real hosting plan: remove the test account setting (`TEST_ACCOUNT_PASSWORD`) and the account, and make sure `BOOTSTRAP_INVITE` is off. See `docs/PREVIEW.md`.
