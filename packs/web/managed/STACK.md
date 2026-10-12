# Web pack: a website with its own server

The app ships as a multi-file site (`npm run build:web` → `dist-web/`) served together with `/api/*` by one Node server (`server/`, its own package: Hono, TypeScript, Postgres). The contract between page and server is `docs/API.md`; change it in the same PR as the code.

## What the server gives you

Invite-only sign-in (argon2id passwords, hashed session tokens, `<slug>-session` cookie), per-user documents (`/api/db/*`, same shapes as the artifact `db`), an AI endpoint (`/api/coach`, streaming; Haiku for `quick`, Sonnet for `default`), a monthly token allowance per person, strict browser security headers, an admin command (`npm run admin`: invite, reset-password, delete-user, set-allowance, list-users), migrations that run at start-up, a health route, and a Dockerfile. Details: `server/README.md`.

## Rules

- **Platform layer.** The page reaches the server only through `src/platform/web.ts`; features never call `fetch("/api/…")`.
- **Secrets** live in the host's settings (`ANTHROPIC_API_KEY`, `DATABASE_URL`), never in the repo, the page, the logs or the test output. CI scans for keys.
- **AI key.** The web app's AI calls use an Anthropic API key (pay as you go), not the owner's Claude plan. Say so when the owner first asks for the AI to be switched on.
- **No prompt or answer text in server logs.**
- **One server instance.** Sign-in limits and allowances are counted in memory.
- **Data access.** `data/users/<userId>/…` is private to that person; `shared/…` is open to every signed-in person. Any other path is closed. Widening this is a security change: record it in `docs/PRD.md` Decisions and have the reviewer look at it.
- **Migrations** are additive and numbered (`server/migrations/NNN_name.sql`); never edit one that has shipped.
- **CSP.** The default policy allows only same-origin scripts. An app that needs WebAssembly or workers loosens it in `server/src/web.ts` and its test, and documents why in `docs/API.md`.
- **Tests.** Server tests run against Postgres (`TEST_DATABASE_URL`), browser tests against the real server with a scripted AI (`server/e2e/server.ts`, test-only, refuses production).

## Build scripts

`build:web` (typecheck + site). `build` points at the primary target. Hybrid apps also have `build:artifact` (see the artifact pack). Server: `cd server && npm ci`, `npm test`, `npm run build`.

## App profile

- **Release target:** the host the app runs on (a hosting plan, or "Render preview only" while there is none).
- **Preview target:** the Render preview from `docs/PREVIEW.md`, deployed by hand.
- **AI plan:** "API key on the server; quick tier by default".
- **Stack notes:** point at this pack; add only app-specific lines.
