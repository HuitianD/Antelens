import { randomUUID } from 'node:crypto';
import { loadEnvLocal } from './load-env-local.js';
loadEnvLocal();
process.env.APP_MODE = 'live';
import { createLiveAgent } from '../packages/agent/src/index.js';

const required = ['FACTORY_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ID', 'DAYTONA_API_KEY', 'DAYTONA_SNAPSHOT', 'INVESTIGATION_ALLOWED_DOMAINS', 'CONTROLLED_FIXTURE_ORIGIN'] as const;
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`BLOCKED: missing ${missing.join(', ')}`);
  process.exit(2);
}

const origin = process.env.CONTROLLED_FIXTURE_ORIGIN!.replace(/\/$/, '');
const agent = createLiveAgent({
  factoryApiKey: process.env.FACTORY_API_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined,
  claudeModelId: process.env.CLAUDE_MODEL_ID!,
  daytonaApiKey: process.env.DAYTONA_API_KEY!,
  daytonaSnapshot: process.env.DAYTONA_SNAPSHOT!,
  allowedDomains: process.env.INVESTIGATION_ALLOWED_DOMAINS!.split(',').map(v => v.trim()).filter(Boolean),
  timeoutMs: Number(process.env.INVESTIGATION_TIMEOUT_MS ?? 180000),
  maxSteps: Number(process.env.MAX_INVESTIGATION_STEPS ?? 12),
});

const sourceId = randomUUID();
const claim = 'Your rental application fee is $40. No recurring charges apply.';
console.log('Stage: triage…');
let triage;
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    triage = await agent.triage({ source: { id: sourceId, title: 'SC-01 rental fee', content: claim, links: [`${origin}/fixtures/SC-01`] }, candidateCases: [] });
    break;
  } catch (error) {
    if (attempt === 1) throw error;
    console.log('Triage attempt failed, retrying once…');
  }
}
if (!triage) throw new Error('Triage did not complete.');
console.log('Triage result:', triage.outcome);
if (triage.outcome === 'no_action') {
  console.log('BLOCKED: triage classified SC-01 as no_action');
  process.exit(1);
}

const caseId = randomUUID();
const runId = randomUUID();
console.log('Stage: investigate…');
const result = await agent.investigate({
  ownerId: randomUUID(),
  caseId,
  runId,
  sourceRevision: 1,
  dataOrigin: 'synthetic',
  sources: [{ id: sourceId, title: 'SC-01 rental fee', content: claim, links: [`${origin}/fixtures/SC-01`] }],
  existingEvidence: [],
  saveEvidence: async capture => ({
    id: randomUUID(),
    caseId,
    runId,
    sourceEventId: capture.sourceEventId,
    stepId: capture.stepId,
    kind: capture.kind,
    observedAt: new Date().toISOString(),
    sourceLabel: capture.sourceLabel,
    displayUrl: capture.displayUrl,
    excerpt: capture.excerpt,
    artifactId: null,
    contentHash: capture.contentHash,
    provenance: capture.provenance,
  }),
  onStep: async () => {},
});

console.log('Investigation verdict:', result.proposal.verdict);
console.log('Headline:', result.proposal.finding?.headline ?? '(none)');
console.log('Limitations:', result.limitations.map(l => l.code).join(', ') || '(none)');
