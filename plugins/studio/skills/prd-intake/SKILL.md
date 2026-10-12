---
name: prd-intake
description: Turn what Ale (the PM) describes into PRD changes and backlog items with acceptance criteria. Use whenever Ale asks for a feature, a change, or reports an idea or complaint about the app.
---

# PRD intake

Ale describes outcomes in plain words. Your job is to turn them into precise, testable work without making Ale write a spec. App-specific facts come from the **App profile** in `CLAUDE.md`; `<XX>` below is its id prefix.

## Steps

1. **Read the current state.** Open `docs/PRD.md` and `docs/BACKLOG.md`. Note the next free item id (`<XX>-0NN`; check `docs/BACKLOG-DONE.md` too so ids never repeat).
2. **Restate the request** to yourself as: who (the App profile's User), what they want to do, why it matters. Find the PRD section it belongs to, or decide it needs a new one.
3. **Check for ambiguity.** List the open product questions (behavior, scope, priority), not technical ones. Technical choices are yours.
   - If a question would change what gets built, ask Ale. Ask at most 3 questions at once, each with a recommended default.
   - Otherwise pick the sensible default and record it under PRD "Decisions".
4. **Check against the rules.** Check the request against the App profile's domain rules and the runtime rules in `CLAUDE.md` (capabilities, the App profile's AI plan and its costs). If the request breaks one, say so and propose an alternative.
5. **Update `docs/PRD.md`.** Edit the relevant section, keep it short, add the request to "Change log" with today's date.
6. **Write backlog items** in `docs/BACKLOG.md`, one per independently testable slice, using this template:

   ```md
   ### <XX>-0NN Title in plain words
   - Why: one sentence of user value
   - Acceptance criteria:
     - [ ] Given …, when …, then … (observable in the app)
   - Notes: technical hints, dependencies (<XX>-0xx), capability changes
   ```

   Keep each item small enough to build in one session. Every criterion must be something Ale can see and check.
7. **Place the items.** New work goes into **Backlog**. Move it to **Ready** only when it has no open questions. Keep Ale's existing order; put urgent bugs at the top of Ready and say so.
8. **Commit** on a `docs/<slug>` branch (the session branch in a cloud session) with `docs(prd): …`, open a PR, merge when CI passes (Markdown-only changes start no CI run).
9. **Reply to Ale** with: the items created (id + title), any decision you made on their behalf, and any question that still needs an answer.
