# app-studio

The master copy of the harness Ale and Claude use to build apps: skills, agents, hooks and a CLAUDE.md template. Nothing here is about one app; each app describes itself in an **App profile** at the top of its own `CLAUDE.md`.

## How apps use it

Cloud sessions don't load plugins from a repo's settings, so each app carries a pinned copy:

- `node scripts/studio-sync.mjs install --app ../<app>` copies the core into the app's `.claude/` and writes `.claude/studio/lock.json` (studio version plus a hash per file). It also adds `CLAUDE.md` and `.claude/settings.json` from `plugins/studio/templates/` if the app has none.
- In the app, `node .claude/studio/studio-sync.mjs check` reports files that are behind app-studio, edited locally or missing. The template's SessionStart hook runs it with `--warn`, so a session sees a warning when its copy is out of step. It finds app-studio through `--studio`, `$STUDIO_DIR` or a sibling `../app-studio` checkout; without one it checks local edits only.
- `node .claude/studio/studio-sync.mjs pull` brings the copy up to date. The `harness-sync` skill walks through it.
- `node .claude/studio/studio-sync.mjs pack add <name…>` adds stack packs (docs kept in step, plus starter files the app owns from then on).

The same files also work as a Claude Code plugin (`studio@app-studio`) for sessions outside an app repo, such as starting a new app. Don't enable the plugin in an app repo that carries the copy: the skills would show up twice.

## Layout

| Path | What |
| --- | --- |
| `plugins/studio/skills/` | `prd-intake`, `build-feature`, `test-handoff`, `release`, `new-app`, `harness-sync` |
| `plugins/studio/agents/` | `planner`, `reviewer`, `qa` |
| `plugins/studio/hooks/check.mjs` | Lint on edit, unit tests when a turn ends |
| `plugins/studio/templates/` | `CLAUDE.md` (shared rules plus an App profile to fill in) and `settings.json` |
| `plugins/session-usage/` | Daily token snapshots and a usage dashboard for a Claude project |
| `packs/` | Stack packs: `base`, `artifact`, `web` (build and CI configs, release steps, QA and review checklists) |
| `scripts/studio-sync.mjs` | Install, check and pull an app's copy; add stack packs |
| `scripts/packs-smoke.mjs` | Builds a scratch app from the packs |
| `scripts/core-lint.mjs` | Fails if the core names an app or a stack detail, or a pack names an app |

Stack packs (`base`, `artifact`, `web`) are in `packs/`; see `packs/README.md`.

## Changing the harness

Change it here, never in an app's copy: bump `version` in `plugins/studio/.claude-plugin/plugin.json`, add a `CHANGELOG.md` entry (mark manual steps for apps as **App action**), and run the checks:

```sh
node --test scripts/studio-sync.test.mjs
node scripts/core-lint.mjs
python3 -I plugins/session-usage/scripts/test_aggregate.py
node scripts/packs-smoke.mjs   # after changing a pack
```

Versions live in `plugin.json` and the changelog; no git tags are needed, because apps pin file hashes.
