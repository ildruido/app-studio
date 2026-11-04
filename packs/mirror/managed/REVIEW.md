# Mirror pack: review checklist

- A new file or folder that is about the project (plans, notes, decisions, deploy settings, anything with a secret) is on the private lists in `scripts/mirror/public-tree.ts`. A project file that would reach the public repo is **blocking**.
- No secret, internal link or personal data sits in a file that is mirrored (code comments included).
- `CHANGELOG.md` is public: new entries say what changed for the user, with no internal notes, plans or personal data (backlog ids are fine).
- `tests/unit/mirror.test.ts` still covers every private path that was added.
