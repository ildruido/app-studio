export const meta = {
  name: 'harness-audit',
  description: 'Deterministic-code audit of app-studio: 8 slice agents (sonnet, low effort) + 1 synthesis agent (medium). About 9 agents, roughly 150-250K tokens. Run only on the App-Studio Owner\'s yes. Args: the JSON of docs/audits/harness-audit.json.',
  whenToUse: 'When the App-Studio Owner asks for a re-audit of what could move from prose to code (after harness changes or a model upgrade).',
  phases: [
    { title: 'Slices', detail: 'one agent per slice, structured findings' },
    { title: 'Synthesis', detail: 'rank findings, group into proposed issues' },
  ],
}

// args = parsed docs/audits/harness-audit.json (a workflow cannot read files; pass the data file as args).
if (!args || !Array.isArray(args.slices) || !args.slices.length) throw new Error('args must be the JSON of docs/audits/harness-audit.json')

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          where: { type: 'string' },
          what: { type: 'string' },
          script: { type: 'string' },
          kind: { type: 'string', enum: ['safe', 'needs-judgement'] },
          saving_tokens: { type: 'number' },
          frequency: { type: 'string', enum: ['every-session', 'every-feature', 'every-release', 'rare'] },
        },
        required: ['id', 'where', 'what', 'script', 'kind', 'saving_tokens', 'frequency'],
      },
    },
  },
  required: ['findings'],
}

const rules = args.rules.map((r) => `- ${r}`).join('\n')

phase('Slices')
const perSlice = await pipeline(
  args.slices,
  (s) => agent(
    `Objective: ${args.objective}\nRules:\n${rules}\n\nYour slice "${s.id}": ${s.files.join(', ')}.\nReturn findings with ids prefixed "${s.id}·".`,
    { label: `slice:${s.id}`, phase: 'Slices', model: 'sonnet', effort: 'low', schema: FINDINGS },
  ),
)
const all = perSlice.map((r, i) => (r ? r.findings : null))
const failed = args.slices.filter((_, i) => !all[i]).map((s) => s.id)
if (failed.length) log(`Slices that returned nothing (not covered): ${failed.join(', ')}`)
const findings = all.filter(Boolean).flat()

phase('Synthesis')
const synthesis = await agent(
  `${args.synthesis}\n\nFindings (JSON):\n${JSON.stringify(findings)}`,
  { label: 'synthesis', phase: 'Synthesis', model: 'sonnet', effort: 'medium' },
)

return { slices: args.slices.length, uncovered: failed, findings: findings.length, synthesis, raw: findings }
