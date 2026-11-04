# app-studio

The master copy of the harness Ale and Claude use to build apps: skills, agents, hooks and a CLAUDE.md template. Nothing here is about one app; each app describes itself in an **App profile** at the top of its own `CLAUDE.md`.

## How apps use it

Cloud sessions don't load plugins from a repo's settings, so each app carries a pinned copy:

- `node scripts/studio-sync.mjs install --app ../<app>` copies the core into the app's `.claude/` and writes `.claude/studio/lock.json` (studio version plus a hash per file). It also adds `CLAUDE.md` and `.claude/settings.json` from `plugins/studio/templates/` if the app has none.
- In the app, `node .claude/studio/studio-sync.mjs check` reports files that are behind app-studio, edited locally or missing. The template's SessionStart hook runs it with `--warn`, so a session sees a warning when its copy is out of step. It finds app-studio through `--studio`, `$STUDIO_DIR`, a sibling `../app-studio` checkout, or any sibling folder that is an app-studio checkout (cloud sessions clone attached repos side by side); without one it checks local edits only.
- `node .claude/studio/studio-sync.mjs health` checks that the harness is sound before any code: shared files unedited and present, App profile filled in, hooks wired in `settings.json`, the app's own skills and agents well formed, doc links working. Being behind app-studio is only a note. It runs before every `git commit` Claude makes (a PreToolUse hook in the template's `settings.json`) and in the base pack's `Harness` workflow, on PRs that touch `.claude/`, Markdown or workflows.
- Every `studio-sync.mjs` command run in an app also turns on the hooks that don't depend on where a session starts: the git pre-commit hook, and in a cloud session with several repos attached (whose top folder is the parent, so the app's `settings.json` never loads) the app's Claude Code hooks forwarded to the parent folder's settings. `hooks` does only that.
- `node .claude/studio/studio-sync.mjs pull` brings the copy up to date. The `harness-sync` skill walks through it.
- `node .claude/studio/studio-sync.mjs pack add <name…>` adds stack packs (docs kept in step, plus starter files the app owns from then on).

The same files also work as a Claude Code plugin (`studio@app-studio`) for sessions outside an app repo, such as starting a new app. Don't enable the plugin in an app repo that carries the copy: the skills would show up twice.

## Layout

| Path | What |
| --- | --- |
| `plugins/studio/skills/` | `prd-intake`, `build-feature`, `test-handoff`, `release`, `new-app`, `harness-sync` |
| `plugins/studio/agents/` | `planner`, `reviewer`, `qa` |
| `plugins/studio/hooks/check.mjs` | Lint on edit, unit tests when a turn ends, harness health before a commit, a merge gate (checks read and green), a block on GitHub API file writes |
| `plugins/studio/hooks/pre-commit` | Git pre-commit hook: the health check for every commit, wherever the session started (`studio-sync.mjs hooks` turns it on) |
| `plugins/studio/hooks/cloud-setup.mjs` | Cloud sessions only: installs dependencies and sets up the browser when a session starts |
| `plugins/studio/templates/` | `CLAUDE.md` (shared rules plus an App profile to fill in) and `settings.json` |
| `packs/` | Stack packs: `base`, `artifact`, `web`, and the optional `mirror` (build and CI configs, release steps, QA and review checklists) |
| `scripts/studio-sync.mjs` | Install, check, health-check and pull an app's copy; add stack packs |
| `scripts/packs-smoke.mjs` | Builds a scratch app from the packs |
| `scripts/core-lint.mjs` | Fails if the core names an app or a stack detail, or a pack names an app |

Stack packs (`base`, `artifact`, `web`, optional `mirror`) are in `packs/`; see `packs/README.md`.

## Changing the harness

Change it here, never in an app's copy: bump `version` in `plugins/studio/.claude-plugin/plugin.json`, add a `CHANGELOG.md` entry (mark manual steps for apps as **App action**), and run the checks:

```sh
node --test scripts/studio-sync.test.mjs
node scripts/core-lint.mjs
node scripts/packs-smoke.mjs   # after changing a pack
```

Versions live in `plugin.json` and the changelog; no git tags are needed, because apps pin file hashes.
