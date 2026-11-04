# Mirror pack: public code, private project

For an app whose **code** must be public (an open-source licence such as the GPL, because the app serves GPL code to other people's browsers, or because Ale wants it open) while the **project files** stay private: PRD, backlog, plans, decisions, the harness, `CLAUDE.md`.

## How it works

- All work stays in the private repo: branches, PRs, backlog, harness, CI, releases. Nothing about the daily routine changes.
- On every release, `.github/workflows/mirror.yml` copies the app files to a public repo as one commit plus the release tag, with no older history, so nothing private from the past can leak.
- `scripts/mirror/public-tree.ts` decides what goes. Left out: `.claude/`, `.github/`, `docs/`, `scripts/mirror/`, `scripts/roadmap/`, `CLAUDE.md`, `README.md` (replaced by `scripts/mirror/PUBLIC-README.md`), `render.yaml` and the tests of those scripts. Added: `scripts/mirror/LICENSE` as `LICENSE`, if the app has one.
- The mirror starts when the `Release tag` workflow (base pack) finishes, when a `v*` tag is pushed by hand, or by hand (Actions > Mirror > Run workflow, with a tag).
- The public repo has no CI of its own; CI stays in the private repo.

## Rules

- **Private by default.** A new top-level folder or file that is about the project, not the app (plans, notes, deploy settings, secrets of any kind), goes on the private lists in `public-tree.ts` in the same PR that adds it.
- **Never mirror history.** The public repo only ever receives release snapshots.
- If the licence needs it, the app links its source: a "Source code" link to `https://github.com/<public repo>/tree/v<running version>` (for example in the footer or the About screen).
- Contributions to the public repo don't flow back by themselves; port anything worth keeping in a normal PR in the private repo.
- When CI minutes run short, or the app goes fully open, the fallback is to do the daily work in the public repo and keep only project files private. That is a separate decision for Ale.
