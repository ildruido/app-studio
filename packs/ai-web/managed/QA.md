# AI module for the web app: QA checklist

For the `qa` agent, in addition to the web pack's checklist.

- **AI failures.** AI unavailable, slow, over allowance, and a dropped connection each produce a readable message and never retry on their own.
- **Site-wide cap (only when `AI_SITE_CAP_TOKENS` is set).** Past the cap the page shows its "allowance used up" message and does not retry; the cap resets at the next UTC day or month. Without the setting, a no-login app still refuses the AI.
- **Closed by default.** `/api/ai/*` answers 401 without a session (browser test `e2e/web/ai.spec.ts`).
- **Key.** The built site and the server logs hold no `sk-ant-` key; the key is set only in the host's settings.
