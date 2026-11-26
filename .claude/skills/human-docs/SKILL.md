---
name: human-docs
description: Studio Project only. Write, edit, review or optimize human-facing pages of app-studio (docs/wiki/ and READMEs) for App-Studio Owners, App Creators and Admins. Use only when the App-Studio Owner asks for it. Not for GOVERNANCE, rule files, the changelog or code comments.
model: inherit
effort: low
---

# Human docs (studio configuration)

The rules and the four modes (write, edit, review, optimize) are the shared skill's: read `packs/human-docs/skills/human-docs/SKILL.md` first and follow it. This file only sets the configuration for app-studio itself.

- **Readers:** App-Studio Owners, App Creators, Admins and new collaborators. They don't read code.
- **Content:** how the harness works. Pages must stay in step with it: check each claim against `docs/GOVERNANCE.md`, `docs/governance/`, the skills and `README.md` (the fact sources).
- **Where pages live:** `docs/wiki/` (auto-published to the GitHub wiki). Never touch the wiki, or `docs/wiki/`, unless the App-Studio Owner asks. GOVERNANCE, rule files and the changelog stay machine-friendly: out of scope.
- **Words:** say App-Studio Owner, App Creator, Admin; explain "tier", "live check" and "pack" where they first appear; don't show issue numbers or script names unless the reader must run them.
- **Publishing** is unchanged: the skill writes content only.
