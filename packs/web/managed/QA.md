# Web pack: QA checklist

For the `qa` agent. Browser tests are in `e2e/web/` and run against the real server and Postgres (`npm run test:e2e`), with modules' outside services scripted.

- **Sign-in.** Invite → account → session survives reload → sign out → sign in. Wrong password and a used or made-up invite are refused with a readable message. Change password signs out other devices.
- **Closed by default.** Every `/api/*` route except health, auth and invite redemption answers 401 without a session.
- **Other people's data.** One person cannot read or write another's `data/users/<id>/…` (403).
- **CSP.** No Content-Security-Policy violation or uncaught page error during the flows (`watchCsp`).
- **Build output.** `dist-web/` has no `sk-ant-` key; server image builds and starts, `/api/health` answers, the site loads.
- **Phone width.** No horizontal scroll at 375 px on the sign-in screen and the main screen; light and dark.
- **Server tests** pass with Postgres (`cd server && TEST_DATABASE_URL=… npm test`) when `server/` changed.
