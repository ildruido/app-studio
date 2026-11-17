# Packs and modules

A **pack** holds what depends on how an app is built or what it does; the core skills and agents stay generic and read the packs an app has. The core assumes **no feature**: the spec phase picks features, and the harness forces the safety questions without choosing the answers.

## Stack packs: how the app is built

| Pack | For | Adds |
| --- | --- | --- |
| `base` | every app | TypeScript, Vite, tests, lint configs, the platform layer with a test fake, a seed page, the release tag workflow |
| `artifact` | one page inside the Claude app | the artifact adapter, browser tests, CI, release steps for a private artifact |
| `web` | a website | a Node server with sign-in, Postgres documents, an admin command, a Dockerfile, CI, a Render service and deploy-on-release workflow |
| `mirror` | optional: code that must be public | a release job that copies code to a public repository |

Web first, artifact as a prototype: `pack add web artifact`.

## Modules: features an app opts into

| Module | For |
| --- | --- |
| `ai` | an app that uses AI |
| `ai-web` | a web app that uses AI (needs `web` and `ai`): server endpoint, monthly allowance per person, usage ledger |
| `user` | a page that needs to know who is using it (any access model with sign-in) |
| `roadmap` | a prioritised Roadmap list kept honest by a check (a process module, not a product feature) |

## How they work

- `pack add <name>` installs; `pull` updates managed docs; `pack remove` drops a pack's docs. A pack's starter files are copied once and are the app's own code.
- A module never ships a file another pack ships, so adding it never overwrites the app's files.
- Code that calls a module's feature without the module doesn't compile, and a sync holds back starter files in that case and says which module to add.
- Web sign-in is one setting, `SIGN_IN_MODE`: `invite`, `open` or `none`. A release stops while the access model is blank.
- AI plus anyone-can-get-in raises a public-use decision (a usage cap is strongly recommended) that must be recorded before release.

See each pack's `managed/STACK.md` for its rules.
