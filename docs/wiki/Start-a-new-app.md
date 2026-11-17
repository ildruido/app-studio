# Start a new app

For the **App Creator**. About an hour of answering questions; Claude does the rest.

## 1. Open a Project

In a new Claude Code Project, attach `app-studio` (and the app's empty repository if you made one) and select the **app-studio apps** environment ([Set up once](Set-up-once)).

## 2. Tell the coordinator

> Start a new app with app-studio. Start a thread (Sonnet) that runs the `new-app` skill; if the skill isn't in its list, it reads `app-studio/plugins/studio/skills/new-app/SKILL.md` and follows it. Relay its questions to me. When it reports the Project setup, apply the Project instructions and model settings it gives, then give me its checklist of what only I can do.

## 3. Answer the product questions

One at a time, each with a recommendation:

- **Is the tech stack decided?** If not, the app starts in **discovery**: it records `TBD` instead of made-up values, and building, testing and releasing stop until you say "start building".
- **Artifact prototype or web app?** An artifact is a private page in the Claude app, the fastest to try. A web app has its own sign-in and hosting. Either way the app can grow into the other later.
- **Features, with no default answer:** does the app use AI? Who can get in (only invited people, anyone who signs up, anyone with no login, or whoever you share the artifact with)? How is data stored (per person, shared, something else)? If AI is on and anyone can get in, you decide on a usage cap before launch.
- **A prioritised Roadmap list** (Now, Next, Later)? Recommended.

Your answers pick the stack packs and modules ([Packs and modules](Packs-and-modules)).

## 4. What Claude produces

A bootstrap PR with the harness installed, the App profile filled in, `docs/PRD.md` and `docs/BACKLOG.md` written from your description (or from a spec you point to), a seeded page with tests, and a first release v0.1.0 (not in discovery).

## 5. The Admin's checklist

If auto-merge can't be verified, the Admin does the one-time repository settings ([Set up once](Set-up-once)). From then on PRs merge themselves.

## 6. From discovery to build

When you say "start building", Claude asks the artifact-or-web question, installs the packs, replaces every `TBD` with a real answer and switches the phase to `build`. The health check fails while any `TBD` is left.
