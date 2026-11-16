# Web pack: review checklist

For the `reviewer` agent. A breach is blocking unless noted. Use Opus (high effort) for diffs that touch sign-in, permissions or the database.

- **Auth and access.** New routes require a session unless they are deliberately public; per-user paths check the user id; `shared/…` is not widened without a recorded decision.
- **Secrets.** No key, password, token or `.env` in the diff, tests, fixtures or logs. Nothing user-written (prompts, answers, passwords) is logged.
- **Input.** Bodies are size-limited and validated; SQL is parameterised; paths go through `parsePath`.
- **Sessions and cookies.** `HttpOnly`, `Secure`, `SameSite=Lax` stay; the cross-site `Origin` check stays.
- **CSP and headers.** Any loosening is justified in `docs/API.md` and tested.
- **Migrations.** Additive, numbered, never an edit to a shipped file; the rollback story is stated in the PR.
- **Contract.** A route or error-code change updates `docs/API.md` and the platform adapter in the same PR.
- **Platform layer.** Features call `getPlatform()`, not `fetch`.
- **Modules.** A feature module stays in `server/src/modules/` and its own migrations; the pack's files are not edited for it.
