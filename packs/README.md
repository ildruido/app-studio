# Stack packs

A pack holds what depends on how an app is built and shipped: build and test configs, the CI workflow, release steps, a QA checklist and a review checklist. The core skills and agents stay generic and read the packs an app has.

| Pack | For | Adds |
| --- | --- | --- |
| `base` | every app (required by the others) | TypeScript, Vite, Vitest, Playwright, ESLint, Prettier configs; the platform layer (`src/platform/`) with a fake for tests; a seed page; the `Release tag` workflow that tags each release |
| `artifact` | the app as one page inside the Claude app | the artifact adapter, a fake `window.claude` for browser tests, smoke and layout specs, the artifact CI workflow, release steps for publishing the private artifact |
| `mirror` | optional, any app whose code must be public | a release job that copies the app's code (not the project files) to a public repo, with its rules and one-time setup |
| `web` | the app as a website | a Node server (invite-only sign-in, Postgres documents, admin command, a loader for server modules, Dockerfile), the web adapter and sign-in screen, the web CI workflow (server job, Postgres, container build, sharded browser tests), a Render service (paid plans) and its notes, a deploy-on-release workflow, browser tests for sign-in |

Feature and process modules (below) sit in the same folder: `ai`, `ai-web`, `roadmap`.

Web first, artifact as a prototype: `pack add web artifact`. The first pack named decides what `npm run build` builds. The web CI workflow also builds and size-checks the artifact prototype when the app has a `build:artifact` script, so a hybrid app gets one workflow (the artifact pack's `supersededBy` does that).

A web-only app can drop a pack it no longer uses: `pack remove artifact` deletes the pack's managed docs and updates the lock (its starter files and `package.json` entries stay the app's own).

## Modules

A **module** is a pack for a feature the app opts into, not for how it is built: `"kind": "module"` in its `pack.json` (a pack without `kind` is a stack pack). The core and the seed assume no feature; the spec phase decides which features the app has, and each one that has a module is added with `pack add <module>`. Modules install, update and remove exactly like stack packs; `pack add` lists them separately.

| Module | For | Adds |
| --- | --- | --- |
| `ai` | an app that uses AI | the seed's AI status line (`src/modules/ai.ts`) and its unit tests |
| `roadmap` | an app that wants a prioritised Roadmap list (process, not a product feature) | the Roadmap list check (`scripts/roadmap/`, `npm run roadmap:check` and `roadmap:data`) and its unit test |
| `ai-web` | a web app that uses AI (requires `web` and `ai`) | the server's AI endpoint with page tools, the monthly allowance per person, the usage ledger, the `set-allowance` admin command, the scripted AI for browser tests |

- A module requires the packs it builds on (`"requires": ["base"]`) and ships its own starter files and tests; it never ships a file another pack has, so adding it never touches the app's existing files.
- UI goes in `src/modules/<name>.ts`, exporting `mount(root)`: the seed page (`src/main.ts`) mounts every file there in name order. Once the app's page replaces the seed, it imports a module where it needs it.
- **A module that needs another pack's host** is a module of its own that requires both (`ai-web` requires `web` and `ai`): the sync tool adds files by pack, never by what else is installed, and a module never ships a file another pack ships.
- **Server modules (the web pack).** The web server loads every file in `server/src/modules/` at start-up (and the admin command does too); its default export builds the module: routes mounted at `/api/<name>`, admin commands, a note per person in `list-users`, a hook that removes a person's data on `delete-user` (`server/src/module-loader.ts`). Migrations go next to the web pack's in `server/migrations/` under the module's own prefix (`<name>_001_*.sql`; they run after the numbered ones and must be safe on a database that already has the tables). A module that calls an outside service gets a scripted stand-in for the browser tests in `server/e2e/modules/<name>.ts`. The web pack never names a module, so no module edits a file the web pack ships.
- A module's `managed/STACK.md` says what it adds and the rules that come with the feature.
- Smoke-test a module with the stacks it runs on: `node scripts/packs-smoke.mjs web artifact ai ai-web`.

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
