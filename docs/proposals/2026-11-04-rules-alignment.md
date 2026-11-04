# Proposal: align the shared rules with how Ale actually works

- **Status:** proposal, for holistic review. Nothing here is applied yet.
- **Date:** 2026-11-04
- **Origin:** a consistency check between app-studio v0.4.0, band-studio-os (the first app in an inception phase) and Ale's standing project rules.
- **Affects:** the CLAUDE.md template (`plugins/studio/templates/CLAUDE.md`), `new-app`, possibly `studio-sync.mjs health`. Every app that carries the harness: chess-coach, bake-off, band-studio-os.

## Why this document

Ale's rules live in three places: the app-studio template, each app's `CLAUDE.md`, and the per-project Claude instructions. The check found that the template is silent or stricter than Ale on a few points. So each app re-states or overrides them in its own words, and the copies drift. Every proposal below moves a rule that already holds in practice into the template, so apps stop carrying their own versions.

Each proposal says what's wrong today, what to change, what it costs the existing apps, and the alternative. They are independent: any subset can be accepted. Proposals 1 to 3 and 5 are template text only, and proposal 4 touches the health check.

## Summary

| # | Proposal | Change | App action | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Say when a commit may skip the PR | Template, Git workflow | Delete local exceptions that become redundant | Accept: "never" stays the rule, with one named exception |
| 2 | One question at a time, with a recommendation | Template, Roles | None | Accept |
| 3 | A home for product decisions | Template, Roles + `new-app` | Optional: point the profile at an existing log | Accept |
| 4 | Install the core before a stack exists | Template, `health`, `new-app` | band-studio-os: rename its "Inception:" values | Accept, but design with the inception-layer upstreaming |
| 5 | Say what wasn't verified | Template, Writing for Ale | None | Accept |
| 6 | Harness workflow didn't start on a PR | Investigate only | None yet | Watch one or two more PRs before changing anything |

## 1. Say when a commit may skip the PR

**Today.** The template says "Never commit straight to `main`." band-studio-os allows typos and decision-log entries straight to `main` during inception, and Ale's project rules used to say "small fixes can go straight to main" for every project. Meanwhile a cloud session can only push its own `claude/…` branch, so the exception is impossible there anyway.

**Why it matters.** Two rules disagree, and the one an agent sees first wins. The exception also skips the pre-commit health hook's partner in CI (the `Harness` workflow), so a broken doc link could land unchecked.

**Proposal.** Keep "never" as the rule, and add one sentence to Git workflow: *"An app may allow docs-only commits (typos, decision-log entries) straight to `main` from a local session, by saying so in its own CLAUDE.md. A cloud session can push only its own branch, so it always opens a PR."* That makes the exception explicit, opt-in and visible in one place.

**Alternative.** Ban it outright and have band-studio-os drop its exception. This is simpler, but every typo then costs a PR.

**App impact.** None for chess-coach and bake-off (they don't use the exception). band-studio-os already words it this way.

## 2. One question at a time, with a recommendation

**Today.** Roles says "Ask Ale only when a requirement is genuinely ambiguous or a decision is product-level." It doesn't say how to ask. Ale's standing preference, which every project re-states in its own instructions, is one question at a time, each with a recommended answer.

**Why it matters.** It's Ale's most-repeated working rule, and it holds in every app and every phase. Keeping it per project means one copy will eventually be missing or worded differently.

**Proposal.** Extend that Roles bullet: *"…or a decision is product-level. Ask one question at a time, each with a recommended answer and one line on why. Everything technical is ours to decide…"*

**App impact.** None. It matches what the apps already do.

## 3. A home for product decisions

**Today.** Roles says to record a decision "in the PR description or `docs/PRD.md` 'Decisions'". band-studio-os keeps `docs/inception/decision-log.md`, and `new-app` already tells an app to keep its decision log after install. `prd-intake` maps a source document's decisions into PRD "Decisions". So there are two homes, and the template doesn't say which wins.

**Why it matters.** Product decisions get split between the PRD and a log, and a later thread can't find the "why" behind a feature. Technical decisions in PR descriptions are fine. They're per change and rarely revisited.

**Proposal.**
- Roles: *"Product decisions go to the app's decision log (App profile, Decision log), or to `docs/PRD.md` 'Decisions' if it has none. Technical decisions go in the PR description."*
- An optional **Decision log** row in the App profile (default: `docs/PRD.md` "Decisions").
- `prd-intake` writes decisions there instead of always into the PRD.

**Alternative.** Make every app use a `docs/decision-log.md`. That's cleaner, but it forces a migration on chess-coach and bake-off for little gain.

**App impact.** None by default: the row falls back to today's behaviour. band-studio-os would fill it in at `new-app`.

## 4. Install the core before a stack exists

**Today.** band-studio-os installed the core early (its D-004), so the health check and the `Harness` workflow guard its docs during inception. The health check fails on template placeholders (`<…>`), so the App profile was filled with "Inception: none yet" values. That works, but only by accident: the check can't tell "not decided yet" from a real value. The `release`, `build-feature` and planner skills would take "Inception: none" literally if run.

**Why it matters.** Every new app goes through a discovery phase first. A core-only install gives it a health check from day one, which closes the "no CI during inception" risk for every future project, not just this one. It is also the natural hook for upstreaming band-studio-os's inception layer later.

**Proposal.**
- The template gains a **Phase** line at the top of the App profile (`discovery` | `build`) and a defined "not decided" value, for example `TBD (decided in <step>)`.
- `health` accepts `TBD` values while Phase is `discovery`, and fails on them once it is `build`.
- Build-phase skills (`build-feature`, `release`, `test-handoff`) stop and say why when Phase is `discovery`.
- `new-app` gets a "core only" path, and its later run switches Phase to `build` and fills the TBDs.

**Alternative.** Leave it as a convention ("write 'Inception: …'"). This costs nothing now, but there's no guard against a build skill running too early.

**App impact.** chess-coach and bake-off: a missing Phase line means `build`, so nothing changes. band-studio-os: replace "Inception: …" with `TBD (…)` and add `Phase: discovery`. Review this together with the inception-layer upstreaming, so the Phase field and the discovery skills come in as one design.

## 5. Say what wasn't verified

**Today.** Writing for Ale says "Plain English, no jargon. Lead with what changed for the user, then how to check it." Ale's standing preference adds: verify before saying "done", and say plainly what you did not verify.

**Why it matters.** "Done" without a caveat is the most common way a report misleads. Example: during inception, a merge passes on a docs-only check with no code tests.

**Proposal.** Append: *"Before saying something is done, check it, and say plainly what you didn't check (for example, no code tests ran)."*

**App impact.** None.

## 6. Observation: the Harness workflow didn't start on a PR

On band-studio-os PR #5 (docs only, opened as a draft and then marked ready), no `Harness` run started for `opened` or `ready_for_review`. It passed when started by hand (`workflow_dispatch`). Earlier, PR #4 triggered it normally, and a GitHub API 502 happened around the same time, so this may have been a GitHub incident.

**Proposal.** No change yet. If it happens again, check whether draft PRs created through the API skip `pull_request` events here. If so, `build-feature` and the cloud-session notes should say to open docs PRs as ready instead of as drafts.

## Review checklist

- [ ] Accept, change or reject each proposal (1 to 6).
- [ ] For accepted ones: one harness PR with a version bump and a CHANGELOG entry, with any **App action** marked.
- [ ] Roll out to chess-coach, bake-off and band-studio-os with `harness-sync`.
- [ ] Remove the wording that each app's CLAUDE.md and project instructions duplicate once the template covers it.
