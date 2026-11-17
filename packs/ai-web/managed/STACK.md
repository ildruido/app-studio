# AI module for the web app (`ai-web`)

A feature module (`"kind": "module"` in `pack.json`): added when the App profile says the web app uses AI (`pack add ai-web`, which also adds `web` and `ai`). Without it the web app has no AI code, table, key, test or QA item, and every `/api/ai/*` route answers like any unknown route.

## What it adds

| File | What |
| --- | --- |
| `src/platform/web-providers/ai.ts`, `src/platform/ai-sse.ts` | The page's side: `getPlatform().sample()` over `/api/ai` (streaming, page tools) and `permissionState("sample")` from `/api/ai/usage`; `tests/unit/ai-web-platform.test.ts` tests them |
| `server/src/modules/ai.ts` | The module the web server loads: mounts `/api/ai`, adds the `set-allowance` admin command, shows the allowance in `list-users`, removes a person's usage on `delete-user` |
| `server/src/ai/` | The endpoint (`routes.ts`), request and event mapping incl. page tools (`mapping.ts`), the Anthropic call (`upstream.ts`), the usage ledger and allowance lookup (`ledger.ts`) |
| `server/migrations/ai_001_usage.sql`, `ai_002_site_usage.sql` | The `ai_usage` table and `users.monthly_allowance` (safe to run on a database that already has them); the `ai_site_usage` table for the site-wide cap |
| `server/e2e/modules/ai.ts` | The scripted AI the browser-test server uses instead of Anthropic |
| `server/tests/ai*.test.ts` (incl. `ai-site-cap.test.ts`), `e2e/web/ai.spec.ts` | Endpoint, mapping, settings, admin and migration tests; the browser test that the endpoint needs sign-in |

## Settings

`ANTHROPIC_API_KEY` on the server only (in Render: Environment > Add, as a secret; it is not in `render.yaml`). Without it `/api/ai` answers `503 capability_removed`. `AI_MODEL_QUICK` (default `claude-haiku-5-5`) and `AI_MODEL_DEFAULT` (default `claude-sonnet-5-5`) pick the models; `AI_DEFAULT_ALLOWANCE` (default 200000) is the monthly token allowance for anyone the admin has not set one for.

**Site-wide cap (opt-in, off unless set).** `AI_SITE_CAP_TOKENS` is the most AI tokens everyone together may use per period; `AI_SITE_CAP_PERIOD` is `day` (default) or `month` (UTC); `AI_PER_ADDRESS_TOKENS` optionally limits one visitor address per period and needs the site cap. With `SIGN_IN_MODE=none` the cap is what lets visitors who are not signed in use the AI; without it they still get `401 not_granted`. With open sign-up (or invite) the cap counts everyone's calls on top of each person's allowance, because one person can make many accounts. Past the cap the answer is `429 rate_limited` (`the site's ai limit is used up today`), before any AI call, and `GET /api/ai/usage` carries `capReached: true`, which the page's `permissionState("sample")` reads as `denied`. Usage is counted in `ai_site_usage`; per-address tokens and the 10-calls-at-once site limit are kept in this process (one server instance), so they reset on a restart. Set `TRUST_PROXY=1` behind Render's proxy so addresses are real. A call already running when the cap is reached still finishes, so the cap can be overshot by a few calls. Admin: `set-allowance <email> <tokens|default>`. Tokens are counted per person per UTC month in `ai_usage`; prompts and answers are never logged. The allowance and the two-calls-at-once cap are checked in this process, so run one server instance.

## Rules

- **AI key.** The web app's AI calls use an Anthropic API key (pay as you go), not the owner's Claude plan. Say so when the owner first asks for the AI to be switched on. The App profile's AI plan reads "API key on the server; quick tier by default".
- **Cost.** AI calls use the cheapest model tier that does the job; the allowance check stays in place.
- **No prompt or answer text in server logs.**
- **Contract.** A change to the endpoint updates the section below in the same PR as the code and the web adapter (`src/platform/web.ts`).
- **Tests** fake the AI (`server/e2e/modules/ai.ts`, `upstream` in `tests/ai.test.ts`); none calls a real model.

## The AI endpoint (`Platform.sample`)

`POST /api/ai` streams the answer. One request per click; the page never retries by itself.

Request: `{messages:[{role,content}], modelTier:"quick"|"default", maxOutputTokens?, tools?:[{name,description,inputSchema}], toolResults?:[{id,name,input,output}]}`. `modelTier` maps on the server: `quick` to Haiku, `default` to Sonnet (`complex` is treated as `default`). `messages` may be a single prompt string wrapped as one user message.

Response: server-sent events.

- `{"type":"text","delta":"…"}` repeated; the page builds `text` and calls `onText`.
- `{"type":"tool_call","id","name","input"}` ends the turn when Claude wants a page tool. The page runs it (tools live in the page) and sends the next request with `toolResults`, each echoing the call's `id`, `name` and `input` beside its `output` (the server holds no state, so it rebuilds the tool turn from that echo). One tool call per turn. The server holds no state between requests.
- `{"type":"done","truncated":bool,"modelTierApplied":"…"}`.
- `{"type":"error","code","message"}` ends the stream.

Limits: `GET /api/ai/limits` returns `{maxPromptBytes: 32768, tools:{maxCount: 8}}` (feeds `sample.limits()`).

Errors reuse the page's codes: `rate_limited` (also when the monthly allowance is used up, with `message` saying so), `prompt_too_large`, `refused`, `empty_completion`, `capability_disabled` (AI switched off for the user), `not_granted` (not signed in), `invalid_request` (malformed request), `capability_removed` (no AI key on the server), `resource_exhausted` (the AI service is busy or the answer stopped early), `tools_unavailable` (the server cannot run page tools; the page then falls back to putting the facts in the prompt, so send it whenever `tools` is not supported). The web adapter returns `granted` (signed in and under allowance), `null` (not signed in and no site cap lets the visitor in) or `denied` (allowance or site cap used up) for `permissionState("sample")`; the page also copes with `prompt` and `unavailable`.

Allowance (signed-in people; anonymous visitors have none, only the site-wide cap): an allowance of 0 switches the ai off for that person (`capability_disabled`). The last call of a month may overshoot a little, and each person can have 2 calls running at once. The server records tokens per user per month and checks before every call. `GET /api/ai/usage` returns `{usedTokens, allowanceTokens, resetsAt}`.

Request bodies are limited to 256 KB and prompts to 32 KB; each person may make 30 AI requests per minute (over which the answer is `429 rate_limited`).
