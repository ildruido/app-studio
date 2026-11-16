# {{title}} server

Backend for the web app (contract in `docs/API.md`). Node 22, TypeScript, Hono, Postgres. Its own package: `cd server && npm ci`.

| Command                                   | What it does                                         |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Run from source (needs the variables below)          |
| `npm run typecheck`                       | Typecheck                                            |
| `TEST_DATABASE_URL=postgres://… npm test` | Tests; the database ones are skipped without the URL |
| `docker build -f server/Dockerfile -t {{slug}} .` (from the repo root) | Container image: the server and the web app |
| `npx tsx e2e/server.ts`                   | Test server for the browser tests (test-only invite route, scripted stand-ins for modules); never in the image |

Environment: `DATABASE_URL` (required), `SIGN_IN_MODE` (`invite`, `open` or `none`, from the App profile's access model; absent means `invite`; anything else stops the server; see "Sign-in and the admin command"), `WEB_DIR` (folder with the built web app, `npm run build:web` at the repo root; the image sets it; from a checkout the server also finds `../dist-web`; without one it answers the API only), `PORT` (8080), `PUBLIC_URL` (address used in invite links; default the host's `RENDER_EXTERNAL_URL`, else `http://localhost:PORT`), `TRUST_PROXY=1` (set when exactly one reverse proxy sits in front: the client address then comes from the last `X-Forwarded-For` entry, and the cross-site check uses `X-Forwarded-Host`; without it every client behind the proxy shares one rate-limit bucket), `BOOTSTRAP_INVITE=1` (while there are no accounts, prints one invite link in the start-up log; for hosts without a shell, see `docs/PREVIEW.md`), `TEST_ACCOUNT_PASSWORD` (opt-in test account: at start-up makes sure an account exists with this password, 10 to 200 characters, and puts the password back if it differs; address from `TEST_ACCOUNT_EMAIL`, default `test@example.com`; it skips the invite, so private previews only, and never log the value), `COOKIE_SECURE=0` (plain-http local development only; ignored in production), `AUTH_TEST_USER_ID` (dev only: acts as this user when nobody is signed in; refused when `NODE_ENV=production` unless `ALLOW_TEST_USER=1`). Migrations in `migrations/` run at start-up.

## Sign-in and the admin command

`SIGN_IN_MODE` picks who can get in: `invite` (accounts only from an invite link), `open` (anyone can create an account; at most 5 new accounts per address per hour; a taken email is reported, which tells a visitor that the address has an account) or `none` (no accounts, no sign-in routes, no sign-in screen: every visitor reads and writes `shared/...` documents, per-person paths are refused, document requests are limited per address, and the account commands below refuse; `AUTH_TEST_USER_ID` and `TEST_ACCOUNT_PASSWORD` are refused). `BOOTSTRAP_INVITE` works only with `invite`. Start-up logs `sign-in: <mode>`.

Passwords are hashed with argon2id; sessions are random tokens kept as hashes in Postgres and sent in a `{{slug}}-session` cookie (HttpOnly, Secure, SameSite=Lax, 30 days). Wrong passwords are limited to 5 per account and 30 per address per 15 minutes; the counters live in memory, so run **one server instance** (a restart clears them). Anyone can lock an account out for 15 minutes with five wrong guesses; that is the accepted trade-off. A taken email is reported at sign-up, but only to someone holding a valid invite.

Run the admin command where `DATABASE_URL` is set: `npm run admin -- <command>` from source, or `node dist/src/admin.js <command>` in the container.

| Command                    | Does                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `invite [note] [--days N]` | Prints a one-use invite link (`PUBLIC_URL/#/invite/<token>`), valid 7 days by default      |
| `delete-user <email>`      | Removes the account, its sessions and saved documents (and a module's data for the person) |
| `reset-password <email>`   | Sets a new random password, prints it once, ends the person's sessions                     |
| `disable-user <email>`     | The account can't sign in any more and is signed out everywhere (its data stays)           |
| `enable-user <email>`      | Lets a disabled account sign in again                                                      |
| `list-users`               | Accounts (disabled ones are marked)                                                        |

The page that opens `#/invite/<token>` and posts to `/api/auth/signup` comes with the web build.

## Modules

A feature the app opts into (AI, for example) is a module pack: its server code is a file in `src/modules/` whose default export builds a `ServerModule` (`src/module-loader.ts`: routes mounted at `/api/<name>`, admin commands, a note per person in `list-users`, a hook that removes a person's data on `delete-user`). The server loads every file there at start-up and the admin command does too; with none, the server has no module. A module's tables go in `migrations/<name>_NNN_*.sql` (they run after the numbered ones). The browser-test server gives a module that calls an outside service a scripted stand-in from `e2e/modules/<name>.ts`.

## The web app, headers and limits

The server hands out the web build and sets the browser security headers on every response (`docs/API.md`, "The site and its headers"). Per signed-in person: 600 document requests per minute (in memory, one instance). The browser tests (`npm run test:e2e -- --project=web` at the repo root) start `e2e/server.ts` on port 4175 with its own schema (`e2e_web`, recreated at every start) in the Postgres at `DATABASE_URL` (default `postgres://postgres:test@localhost:5432/postgres`); modules run with their scripted stand-ins, so no key is needed, and the server refuses to run with `NODE_ENV=production`.
