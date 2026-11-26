---
name: human-docs
description: Write, edit, review or optimize pages meant for people to read - user guides, how-tos, READMEs, wiki and help pages. Use when asked to write up, tidy, proofread, shorten or "read as a newcomer" a human-facing page. Not for code comments, backlog, changelog, rule or config files.
model: inherit
effort: low
---

# Human docs

One skill, four modes, chosen by the request. Pages are written for a reader who has a job to do, not to record everything the author knows.

## Where this skill gets its facts

Audience, vocabulary, where pages live and where the facts come from are **configuration**, never assumed:
- In an app: the **Human docs** row of the App profile in `CLAUDE.md` (readers; where pages live; words to avoid or always explain; fact sources: PRD, backlog, code). If the row is missing or blank, ask the App Creator those four questions once, one at a time with a recommended answer, and write the row.
- Anywhere else (a studio or another project) the project's own copy of this skill names them. If none does, ask.

Don't assume a wiki, a docs site or any harness vocabulary exists. Use the words the configured readers use. Touch only the pages named in the request. Publishing is not this skill's job: write content only.

## The reader-first rules (all modes)

1. **Start from the reader:** who is it, what must they do after reading? Say it in one line before writing.
2. **One shape per page:** *overview* (what it is, why, where to go next), *how-to* (numbered steps, one action each, expected result), or *reference* (a table or list to look things up). Don't mix them.
3. **Plain words, short sentences.** Explain a term the first time or avoid it. Active voice; the person doing the thing is the subject.
4. **No machine-facing leaks:** rule or issue IDs, internal file paths and tool names appear only when the reader must type or open them, and then with a word on what they are.
5. **Every claim traceable** to a fact source. If it can't be found, flag it as unverified instead of guessing.
6. **Every page ends with a next step:** a link or one sentence on what to do next.

## Modes

- **Write:** turn a topic or a change into a page. State the reader and the goal, pick the shape, draft from the fact sources, then run the Review checklist on your own draft.
- **Edit:** improve an existing page without changing its meaning: plain words, short sentences, same structure and same facts. Show what changed in one line.
- **Review:** read as a newcomer who knows nothing of the project. Report, never change the page: jargon, missing steps, steps out of order, stale or unverifiable claims, machine-facing leaks, a missing next step, pages that mix shapes. Give each finding as "where, what, suggested fix", most serious first, and end with a verdict (ready, needs edits, needs rewrite).
- **Optimize:** make it shorter and easier to scan: cut repetition, lead with the answer, headings that say what the section is for, lists and tables where they help, and a next step at the end. Same facts; say what you removed.

If the request doesn't name a mode, pick the most likely one and say which. For a change that touches several pages, list them and do one at a time.

## Check before handing back

The page names its reader, uses one shape, has no unexplained jargon, steps can be followed in order, and ends with a next step. Say plainly what you could not verify.
