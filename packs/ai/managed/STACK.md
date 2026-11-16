# AI module: the app uses AI

A feature module (`"kind": "module"` in `pack.json`): added only when the App profile says the app uses AI (`pack add ai`). It needs `base`.

## What it adds

| File | What |
| --- | --- |
| `src/platform/capabilities/ai.ts` | Adds `sample()` and `permissionState()` to `getPlatform()`, how the Claude artifact runtime serves them, and the test fakes `fakeSample(answer)` and `fakeAi(answer)` |
| `src/ai.d.ts` | The AI's shapes (`SampleFn`, `SampleOptions` with `modelTier`, `cache` and `tools`, `SampleError`, `PermissionState`) |
| `src/modules/ai.ts` | The seed's AI status line ("The AI is ready." or "not available here"), mounted by the seed page |
| `tests/unit/ai.test.ts` | Its unit tests, against `fakePlatform()` and `nullPlatform` |

The seed page (`src/main.ts`) mounts every `src/modules/*.ts` that exports `mount(root)`. If the app's page no longer does, import the module where it is needed, or delete the demo once the first AI feature replaces it.

## Rules

- Every AI call goes through `getPlatform().sample()`, which resolves `null` where the host offers no AI; the feature must say so and keep working.
- Unit tests fake the AI: `fakePlatform()` has a fake AI once this module is there; `fakePlatform(fakeAi("answer"))` picks its answer. No test calls a real model.
- In an artifact build the runtime serves the AI with no further module. On the web, `sample()` resolves `null` until `ai-web` is added; `pack add` and `check` say so.
- On the web, the server side (endpoint, allowance, usage) is the `ai-web` module, which requires this one and `web` (`pack add ai-web`).
