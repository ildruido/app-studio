---
name: coherence-review
description: Review whether app-studio's shipped skills still fit GOVERNANCE, the app template and each other - only when the App-Studio Owner asks for a coherence review or a routing test, or to PROPOSE one after GOVERNANCE, skill or routing changes. Studio Project only, never for apps.
---

# Coherence review

For threads in the app-studio Project. Follow `docs/COHERENCE-REVIEW.md`; it holds the steps, lenses and report format.

- **After a change to GOVERNANCE, a skill, the app template or routing:** do not run anything. Tell the App-Studio Owner in one line that a review is worth running and its rough cost, and wait for a yes.
- **When the App-Studio Owner asks for one:** run `node scripts/coherence-lint.mjs` first, then the review steps. The routing test (`scripts/routing-test/run.py`) costs usage: ask again before running it.
- Wording, pointer and lint fixes go in the review's own PR; anything that changes behaviour or needs a decision becomes a `studio-backlog` issue.
