# Web pack: QA checklist

For the `qa` agent. Browser tests are in `e2e/web/` and run against the real server and Postgres (`npm run test:e2e`), with modules' outside services scripted.

- **Sign-in mode.** `/api/health` reports the mode the App profile's access model calls for (`SIGN_IN_MODE`).
- **Sign-in** (invite and open). Open: create an account with no invite; a sixth account from one address in an hour is refused. Invite: → account → session survives reload → sign out → sign in. Wrong password and a used or made-up invite are refused with a readable message. Change password signs out other devices.
- **Closed by default** (invite and open). Every `/api/*` route except health, auth and invite redemption answers 401 without a session. With no login (`none`): no sign-in screen, `shared/...` works, per-person paths answer 403.
- **Other people's data.** One person cannot read or write another's `data/users/<id>/…` (403).
- **CSP.** No Content-Security-Policy violation or uncaught page error during the flows (`watchCsp`).
- **Build output.** `dist-web/` has no `sk-ant-` key; server image builds and starts, `/api/health` answers, the site loads.
- **Phone width.** No horizontal scroll at 375 px on the sign-in screen and the main screen; light and dark.
- **Server tests** pass with Postgres (`cd server && TEST_DATABASE_URL=… npm test`) when `server/` changed. In a cloud thread `scripts/cloud-setup.sh` starts a local Postgres and sets the URLs; without it the database tests skip themselves and look green, so say so.
