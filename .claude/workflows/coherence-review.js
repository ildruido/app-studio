export const meta = {
  name: 'coherence-review',
  description: 'Judgement part of the coherence review (docs/COHERENCE-REVIEW.md step 2-3): one agent per independent check (sonnet, low effort), then one to merge the verdicts. About 6 agents; each check reads most of the shipped text (about 65K tokens), so roughly 300K tokens (an estimate, not measured). One thread reading by hand costs less while the text fits in one context (docs/COHERENCE-REVIEW.md). Run only on the App-Studio Owner\'s yes. Args: the JSON of docs/audits/harness-audit.json.',
  whenToUse: 'When the App-Studio Owner asks for a coherence review after changes to GOVERNANCE, a skill, the app template or the routing. Run scripts/coherence-lint.mjs first.',
  phases: [
    { title: 'Checks', detail: 'one agent per check' },
    { title: 'Report', detail: 'rank findings by product impact' },
  ],
}

if (!args || !args.coherence || !args.coherence.checks.length) throw new Error('args must be the JSON of docs/audits/harness-audit.json')

const SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          where: { type: 'string' },
          what: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refined', 'downgraded', 'wrong-scope'] },
          fix: { type: 'string' },
        },
        required: ['where', 'what', 'verdict', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const LENS = 'Keep app-studio (harness, rulebook GOVERNANCE) and apps (rulebook: app template) apart. For each finding ask: whose rulebook applies, who reads the text, is it shipped to apps, does the "contradiction" compare rules of the same scope. Read-only; no issues, no edits.'

phase('Checks')
const results = await pipeline(
  args.coherence.checks,
  (c) => agent(`${LENS}\n\nCheck "${c.id}": ${c.prompt}\nFiles: ${c.files.join(', ')}`,
    { label: `check:${c.id}`, phase: 'Checks', model: 'sonnet', effort: 'low', schema: SCHEMA }),
)
const failed = args.coherence.checks.filter((_, i) => !results[i]).map((c) => c.id)
if (failed.length) log(`Checks that returned nothing (not covered): ${failed.join(', ')}`)
const findings = results.filter(Boolean).flatMap((r) => r.findings)

phase('Report')
const report = await agent(
  `Drop duplicates and "wrong-scope" findings, rank the rest by product impact. For each: verdict, fix, tier (owner or not), whether it needs a live check. End with what was not verified.\n\n${JSON.stringify(findings)}`,
  { label: 'report', phase: 'Report', model: 'sonnet', effort: 'medium' },
)
return { uncovered: failed, findings: findings.length, report }
