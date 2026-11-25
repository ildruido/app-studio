# New app: discovery path and start building

_Branch file of the `new-app` skill. Read it only when the app has no stack yet, or the App Creator says "start building". The numbered steps are in `SKILL.md`._

## Discovery path (no stack chosen yet)

For an app that has no stack, starter code or CI yet. It records "not decided yet" as `TBD` instead of made-up values.

- Steps 1 and 3 as usual. Step 4: only `install` (no `pack add`, no `npm install`); then copy `app-studio/packs/base/starter/.github/workflows/harness.yml` and `.nvmrc` into the repo unchanged, so the `health` check runs on PRs (a later `pack add base` accepts them as they are).
- Step 5: `node .claude/hooks/app-setup.mjs profile init --discovery --name "<App name>" --prefix <XX> --repo <owner/repo> ["Field=value" ...]` writes **Phase `discovery`**, the real App name, Id prefix and Repo, and `TBD (decided at build start)` for Stack, Release target, Preview target, Capabilities, AI, AI plan, Access model and Storage shape; a real answer already given goes in as a `Field=value` argument. You still set AI public use and the Domain rules and Stack notes lines by hand. Never invent a value to satisfy the check. A real answer the App Creator already gave (a domain rule, "AI off") is recorded as such.
- Step 8 as usual (`prd-intake`: `docs/PRD.md` and `docs/BACKLOG.md`; the AI, access and storage questions may be answered "not decided yet" and recorded as `TBD` in the decision log).
- Step 9: `node .claude/studio/studio-sync.mjs check` and `health` only. Step 10: the ruleset requires only `health`; skip `CI gate`. In discovery `build-feature`, `test-handoff` and `release` stop on their own (`studio-sync.mjs phase --build-only`).
- End with step 12's report and say the app is in discovery.

## Start building (discovery to build)

Run only when the App Creator says "start building" (never because a stack was merely mentioned):

1. Ask the App Creator the step 2 product question (artifact prototype, web app or static site), and decide the stack packs from it.
2. `pack add <packs> --slug <repo> --title "<App name>"`, `npm install`, and steps 6, 7 and 9 as written.
3. Replace every `TBD` in the App profile with a real answer (the AI, Access model and Storage shape questions are asked now, per `prd-intake` "Features"), set **Phase** to `build`, and run `health`: it fails while any `TBD` is left.
3a. For a static site, the profile rows are the ones in `static-site.md`.
4. Add `CI gate` to the ruleset's required checks (step 10's clicks), then step 11, and step 14.
5. Give the coordinator step 12's report again (Project instructions, settings, Admin's checklist), since the app now has a stack, so the instructions and the checklist change.
