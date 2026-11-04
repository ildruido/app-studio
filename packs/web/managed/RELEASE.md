# Web pack: release steps

The `release` skill's step 9 (build and ship) follows this.

1. CI on the release commit is green, including the server job and the container build.
2. The host runs the container built from `server/Dockerfile` (`docker build -f server/Dockerfile .`; the image holds the server and the built site). Migrations run when it starts.
3. **Deploy (Render):** the release deploys by itself: `.github/workflows/deploy.yml` calls the service's deploy hook when the version in `package.json` changes on `main`. Check that the Deploy run passed (Actions > Deploy). If it failed because `RENDER_DEPLOY_HOOK` is missing, tell Ale the one-time setup in `docs/PREVIEW.md` and, for now, the manual route (Render > the service > Manual Deploy > Deploy latest commit). The test script's first step is to check the app shows the released version (`/api/health` reports it).
4. Check the live site: `/api/health` shows the new version, the sign-in screen loads, one document saves and loads back.
5. A release that changes the database adds a migration; say in the handoff that it runs on the first start. A release that adds an environment variable lists it with where to set it.
6. In the handoff, say whether anything on the host needs Ale (a new setting, a missing secret).

Before inviting anyone else: remove the test account setting (`TEST_ACCOUNT_PASSWORD`) and the account, and make sure `BOOTSTRAP_INVITE` is off. See `docs/PREVIEW.md`.
