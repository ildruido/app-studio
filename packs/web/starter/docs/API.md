# Web app API contract

The fixed contract between the server (`server/`), the web build and the page. Changing it means updating this file in the same PR.

The page never calls these routes directly. It goes through the interfaces in `src/platform/` (`Platform`: `db`, `user`, `downloads`, plus what modules add, e.g. `sample` from `ai`). The artifact adapter wraps `window.claude`; the web adapter (`src/platform/web.ts`, with module providers in `src/platform/web-providers/`) wraps `/api/*` and returns the same shapes, so stores and error branches do not change.

## Conventions

- Same origin: the server serves the site and `/api/*` together, so no CORS.
- JSON bodies, UTF-8. Request size limit 64 KB (documents).
- Auth is a secure HttpOnly session cookie. Every route except `/api/health`, `/api/auth/*` and invite redemption needs it; without it: `401 {"error":{"code":"unauthenticated"}}`.
- Errors: `{"error":{"code":"<code>","message":"<text>"}}`. The codes are the ones the page already branches on (`DbError.code`, `SampleError.code`), so the existing messages keep working.
- No prompt or answer text in server logs.

## Auth

| Route                                               | Does                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/signup` `{invite, email, password}` | Redeems an invite, creates the account, signs in.                            |
| `POST /api/auth/login` `{email, password}`          | Signs in. Rate limited.                                                      |
| `POST /api/auth/logout`                             | Ends the session.                                                            |
| `POST /api/auth/change-password` `{current, password}` | Signed-in only. Checks `current`, sets the new password, ends every other session of the account (this one stays). `204`; wrong current is `403 not_granted`; 5 wrong tries per account per 15 minutes, then `429`. |
| `GET /api/auth/me`                                  | `{userId, email}` or 401. Feeds `Platform.user()` (`id()` returns `userId`). |

Details: invite links look like `<site>/#/invite/<token>` (one use, 7 days); the page reads the token and posts it as `invite`. Passwords are 10 to 200 characters. The session cookie is `{{slug}}-session` (HttpOnly, Secure, SameSite=Lax); `signup` and `login` answer `{userId, email}` and set it, `logout` answers `204`. A wrong email or password is `401 unauthenticated` (same answer for both); too many attempts is `429 rate_limited`; an invalid invite, bad email, short password or taken email is `400 invalid_argument`. Cross-site posts (an `Origin` that is not this host) are `403`.

Invites and password resets are an admin command on the server (`server/README.md`), not routes.

## Documents (`Platform.db`)

Same paths and shapes as the artifact `db`. A path is a slash-separated list of segments: even count = document, odd count = collection.

| Route                                                                                  | Does                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/db/doc?path=`                                                                | `{exists, data}`                                                                                                                                                                                                                                                             |
| `PUT /api/db/doc?path=` body `{data}`                                                  | Replace the document (`data` is an object, up to 64 KB). `204`.                                                                                                                                                                                                              |
| `DELETE /api/db/doc?path=`                                                             | Delete it (no error if missing). `204`.                                                                                                                                                                                                                                      |
| `POST /api/db/query` `{path, where?:[{field,op,value}], orderBy?:{field,dir}, limit?}` | `{docs:[{id, data}]}`; `limit` 1 to 1000 (default 1000). Direct children of the collection only; operators `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `array-contains`; at most 5 `where` clauses; documents missing a filtered or ordered field are left out; ties sort by id. |

Paths in use: `data/users/<userId>/...` for each person's own documents, and `shared/...` for documents every signed-in person may read and write. Add the app's own paths here as it grows.

`data/users/<userId>/...` is only reachable by that user; a mismatch is `403 not_granted`. Error codes the page handles (the web adapter maps server failures onto these; anything else gets the page's generic message): `not_granted`, `quota_exceeded`, `invalid_argument`, `resource_exhausted`, `revoked`, `transform_error`, `capability_disabled`, `capability_removed`.

## AI (`Platform.sample`)

Not part of the web pack: an app that uses AI adds the `ai-web` module (`.claude/packs/ai-web/STACK.md` has the `/api/ai` contract). Without it every `/api/ai/*` route answers like any unknown route.

## The site and its headers

The server also serves the web build (`npm run build:web`, folder `dist-web`, set with `WEB_DIR`): `index.html`, hashed files under `/assets/` (cached for a year), and any other built files (including `.wasm`, served as `application/wasm`). Any other path without a file extension gets `index.html` (so `/#/invite/<token>` and refreshes work); a missing file is `404`.

Every response carries: `Content-Security-Policy` (`default-src 'self'`; scripts `'self'`, never `unsafe-eval` (an app that compiles WebAssembly adds `'wasm-unsafe-eval'` in `server/src/web.ts`); workers `'self'`; styles from `'self'` and Google Fonts, element `style` attributes allowed; fonts from Google Fonts; `connect-src 'self'`; no framing, no `<object>`, no `<base>`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` (camera, geolocation, payment and microphone off), and `Strict-Transport-Security` when served over HTTPS. `/api/*` also sends `Cache-Control: no-store`.

Limits: request bodies 64 KB (documents); per signed-in person 600 document requests per minute, over which the answer is `429 rate_limited` (with `Retry-After`); sign-in attempts as described under Auth.

## Health

`GET /api/health` returns `{ok:true, version}` with no auth and no database detail.
