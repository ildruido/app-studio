# Stack packs

A pack holds what depends on how an app is built and shipped: build and test configs, the CI workflow, release steps, a QA checklist and a review checklist. The core skills and agents stay generic and read the packs an app has.

| Pack | For | Adds |
| --- | --- | --- |
| `base` | every app (required by the others) | TypeScript, Vite, Vitest, Playwright, ESLint, Prettier configs; the platform layer (`src/platform/`) with a fake for tests; a seed page |
| `artifact` | the app as one page inside the Claude app | the artifact adapter, a fake `window.claude` for browser tests, smoke and layout specs, the artifact CI workflow, release steps for publishing the private artifact |
| `web` | the app as a website | a Node server (invite-only sign-in, Postgres documents, AI endpoint, admin command, Dockerfile), the web adapter and sign-in screen, the web CI workflow (server job, Postgres, container build, sharded browser tests), a Render preview and its notes, browser tests for sign-in |

Web first, artifact as a prototype: `pack add web artifact`. The first pack named decides what `npm run build` builds. The web CI workflow also builds and size-checks the artifact prototype when the app has a `build:artifact` script, so a hybrid app gets one workflow (the artifact pack's `supersededBy` does that).

## Using a pack

```sh
node ../app-studio/scripts/studio-sync.mjs install --app .        # the core, once
node .claude/studio/studio-sync.mjs pack add web artifact --slug my-app --title "My App"
npm install && npm install --prefix server                         # server only for web
```

Adding `web` to an app that started as an artifact: its CI workflow differs from the web one, so it is kept and listed; replace it by hand, and set the `build` script to `build:web`.

## Layout of a pack

```
packs/<name>/
  pack.json    name, version, requires, packageJson (scripts and dependencies added if absent), supersededBy
  managed/     docs kept in step like the skills; land in .claude/packs/<name>/ (STACK, RELEASE, QA, REVIEW)
  starter/     files copied once into the app's root; {{slug}} and {{title}} are filled in; the app owns them afterwards
```

- **Managed files** are read by the skills and agents (`release` reads `RELEASE.md`, `qa` reads `QA.md`, `reviewer` reads `REVIEW.md`). `pull` updates them; the session-start check warns when they are behind.
- **Starter files** are real app code. Changing one here does not touch apps. A session-start note tells an app that a starter changed upstream; `pull` refreshes the ones it never edited, and the app merges the rest by hand and runs `ack`.
- A pack never ships the same file as another unless it names it in `supersededBy`. Placeholders are only `{{slug}}` and `{{title}}`, and no pack may name an app (`scripts/core-lint.mjs`).

## Changing a pack

Edit the files, bump the pack's `version` in `pack.json`, add a `CHANGELOG.md` entry (mark manual steps for apps as **App action**), and run:

```sh
node --test scripts/studio-sync.test.mjs
node scripts/core-lint.mjs
node scripts/packs-smoke.mjs web artifact    # a scratch app: install, format, lint, typecheck, unit tests, both builds
```

CI runs the smoke build when `packs/**` changes. Browser tests (Chromium, Postgres) run in the trial app and in each app's own CI.

Pack starters began as copies of a working app's files with the app's subject removed. When an app improves one of them, port the improvement here.
