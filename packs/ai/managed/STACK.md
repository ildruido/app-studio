# AI module: the app uses AI

A feature module (`"kind": "module"` in `pack.json`): added only when the App profile says the app uses AI (`pack add ai`). It needs `base`.

## What it adds

| File | What |
| --- | --- |
| `src/modules/ai.ts` | The seed's AI status line ("The AI is ready." or "not available here"), mounted by the seed page |
| `tests/unit/ai.test.ts` | Its unit tests, against `fakePlatform()` and `nullPlatform` |

The seed page (`src/main.ts`) mounts every `src/modules/*.ts` that exports `mount(root)`. If the app's page no longer does, import the module where it is needed, or delete the demo once the first AI feature replaces it.

## Rules

- Every AI call goes through `getPlatform().sample()`, which resolves `null` where the host offers no AI; the feature must say so and keep working.
- Unit tests fake the AI (`fakePlatform()`); no test calls a real model.
- On the web, the server side (endpoint, allowance, usage) is the `ai-web` module, which requires this one and `web` (`pack add ai-web`).
