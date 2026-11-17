# Mirror pack: release steps

## One-time setup (Admin, about 5 minutes)

Claude gives the Admin these steps with the real names filled in, once, before the first release that should be public.

1. GitHub > New repository: same owner, name `<app>-app` (or another name), **Public**, completely empty (no README, licence or .gitignore).
2. If the name is not `<app>-app`: private repo > Settings > Secrets and variables > Actions > Variables > New repository variable `PUBLIC_REPO` = `<owner>/<name>`.
3. GitHub > Settings > Developer settings > Fine-grained tokens > Generate new token: only the public repo, permission **Contents: Read and write**, expiry 1 year (note the date).
4. Private repo > Settings > Secrets and variables > Actions > New repository secret `PUBLIC_MIRROR_TOKEN` = the token.
5. Mirror the current release once: Actions > Mirror > Run workflow, with its tag (e.g. `v0.4.0`).

Claude also adds `scripts/mirror/LICENSE` (the licence text the app needs) and fills in `scripts/mirror/PUBLIC-README.md`.

## Every release

The `release` skill's step 9 adds: check the Mirror run that started after `Release tag` passed, and that the public repo shows the new tag. If it failed because the token is missing or expired, give the Admin step 3 and 4 again; the release itself is not blocked.
