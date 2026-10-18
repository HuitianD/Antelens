import { createHash, randomUUID } from 'node:crypto';
import type { AgentSource } from '@beforeyou/agent';
import type { InvestigationRun } from '@beforeyou/contracts';
import type { PostgresRepository } from '@beforeyou/db';

export async function investigationContext(
  repo: Pick<PostgresRepository, 'caseDetail' | 'saveEvidence'>,
  ownerId: string,
  run: InvestigationRun,
  generation: number,
  sources: AgentSource[],
) {
  const prior = await repo.caseDetail(ownerId, run.caseId);
  // Verification notes remain source claims. Previous browser observations must
  // not acquire the current run's evidence privileges merely by being retained.
  const existingEvidence = prior.evidence.filter(evidence => evidence.runId === null);
  for (const source of sources) {
    const excerpt = source.content.slice(0, 32000);
    existingEvidence.push(await repo.saveEvidence(ownerId, run.id, generation, {
      id: randomUUID(), caseId: run.caseId, runId: run.id, sourceEventId: source.id,
      stepId: null, kind: 'message_excerpt', observedAt: new Date().toISOString(),
      sourceLabel: source.title, displayUrl: null, excerpt, artifactId: null,
      contentHash: createHash('sha256').update(excerpt).digest('hex'), provenance: run.provenance,
    }));
  }
  return { existingEvidence, priorAssessment: prior.currentAssessment };
}
