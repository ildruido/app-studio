# Known limits

Check these before picking the harness for an app. Each is a choice for now, not a bug. If your app needs more than one of these allows, send a [harness idea](Send-a-harness-idea) before building around the gap.

- **Few roles.** Built around one product owner per app and one for the harness, with the Admin for manual steps. There are no teams, reviewers or per-person permissions inside the harness, and in app-studio itself the owner tier is guarded by a label, which stops mistakes but not a deliberate bypass.
- **Web hosting.** A website runs on one provider (Render, a paid plan), as one server instance, with Postgres. Sign-in limits and AI allowances are counted in that instance's memory, so a second instance or a restart resets them.
- **Storage shape.** Data is JSON documents by path, private to each person or shared by everyone. No relational data, no file uploads, no teams or groups yet. A module will be added only when an app needs one.
- **AI in a no-login app.** Visitors without login get no AI of their own; an AI allowance counts per signed-in person. A site-wide cap is the planned answer (tracked as issue #98).
- **Deploy not proven end to end.** As of 0.24.4 the deploy path is tested only up to the release gate, with no real host or secrets.
- **Updates are by choice.** An app only changes when it runs `harness-sync`; a release still marked `Live check: pending` can't be pulled.
