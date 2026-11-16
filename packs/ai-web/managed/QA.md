# AI module for the web app: QA checklist

For the `qa` agent, in addition to the web pack's checklist.

- **AI failures.** AI unavailable, slow, over allowance, and a dropped connection each produce a readable message and never retry on their own.
- **Closed by default.** `/api/ai/*` answers 401 without a session (browser test `e2e/web/ai.spec.ts`).
- **Key.** The built site and the server logs hold no `sk-ant-` key; the key is set only in the host's settings.
