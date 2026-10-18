import { randomUUID } from 'node:crypto';
import { SourceEventSchema } from '@beforeyou/contracts';
import { PostgresRepository, ensureSyntheticConnection } from '@beforeyou/db';
import { DomainError, scenarios } from '@beforeyou/fixtures';

const LABEL = 'Synthetic test record';
export const SYNTHETIC_TEST_EXTERNAL_ID = 'beforeyou-synthetic-test-record';
export const SYNTHETIC_INVESTIGATION_EXTERNAL_ID = 'beforeyou-synthetic-investigation-sc01';

export function controlledFixtureUrl(scenarioId: string): string {
  const origin = process.env.CONTROLLED_FIXTURE_ORIGIN?.replace(/\/$/, '');
  if (!origin) throw new DomainError('CONFIG_MISSING', 'Controlled fixture hosting is not configured.', 503);
  return `${origin}/fixtures/${scenarioId}`;
}

/** Mirrors the worker's BROWSER_RUNTIME selection without loading the agent runtime into the API process. */
export function requiredInvestigationVariables(runtime = process.env.BROWSER_RUNTIME?.trim() || 'daytona'): string[] {
  if (runtime !== 'daytona' && runtime !== 'local_controlled') throw new DomainError('CONFIG_MISSING', 'BROWSER_RUNTIME must be daytona or local_controlled.', 503);
  return ['FACTORY_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ID', 'CONTROLLED_FIXTURE_ORIGIN', 'INVESTIGATION_ALLOWED_DOMAINS', ...(runtime === 'daytona' ? ['DAYTONA_API_KEY', 'DAYTONA_SNAPSHOT'] : [])];
}

export function assertLiveInvestigationConfiguration() {
  const missing = requiredInvestigationVariables().filter(name => !process.env[name]?.trim());
  if (missing.length) throw new DomainError('CONFIG_MISSING', `Live investigation is missing ${missing.join(', ')}.`, 503);
}

export async function ingestSyntheticTestRecord(repo: PostgresRepository, ownerId: string, externalId = SYNTHETIC_TEST_EXTERNAL_ID) {
  const scenario = scenarios['SC-07'];
  if (!scenario) throw new Error('Synthetic scenario is unavailable.');
  const connection = await repo.transaction(ownerId, async (client) => ensureSyntheticConnection(client, ownerId));
  const source = SourceEventSchema.parse({
    id: randomUUID(),
    connectionId: connection.id,
    kind: 'gmail',
    externalId,
    externalThreadId: `thread-${externalId}`,
    receivedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    title: `${LABEL} · ${scenario.title}`,
    senderLabel: `${LABEL} · ${scenario.sender}`,
    previewText: scenario.content,
    contentRef: `synthetic:${randomUUID()}`,
    disposition: 'pending',
    processingStatus: 'queued',
    lastErrorCode: null,
    dataOrigin: 'synthetic',
  });
  const accepted = await repo.ingestSource(ownerId, source, scenario.content, [], null, { route: 'synthetic-test-record', key: externalId, requestHash: externalId });
  await repo.acceptTriage(ownerId, accepted.source.id, { outcome: 'no_action', requestSummary: null, impacts: [], candidateCaseId: null, relevantLinkIndexes: [] }, {
    modelId: 'synthetic-fixture',
    promptVersion: 'synthetic-1.0.0',
    policyVersion: 'synthetic-1.0.0',
    toolVersion: 'synthetic-1.0.0',
    execution: 'live',
  });
  return accepted.source;
}

/** Queues real triage and investigation through the persistent worker; no canned assessment is published here. */
export async function ingestSyntheticInvestigation(repo: PostgresRepository, ownerId: string, scenarioId: 'SC-01' = 'SC-01', externalId = SYNTHETIC_INVESTIGATION_EXTERNAL_ID) {
  assertLiveInvestigationConfiguration();
  const scenario = scenarios[scenarioId];
  if (!scenario) throw new DomainError('VALIDATION_ERROR', 'Unknown controlled fixture scenario.', 400);
  const fixtureUrl = controlledFixtureUrl(scenarioId);
  const connection = await repo.transaction(ownerId, async (client) => ensureSyntheticConnection(client, ownerId));
  const source = SourceEventSchema.parse({
    id: randomUUID(),
    connectionId: connection.id,
    kind: 'gmail',
    externalId,
    externalThreadId: `thread-${scenarioId}-${externalId}`,
    receivedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    title: `${LABEL} · ${scenario.title}`,
    senderLabel: `${LABEL} · ${scenario.sender}`,
    previewText: scenario.content,
    contentRef: `synthetic:${randomUUID()}`,
    disposition: 'pending',
    processingStatus: 'queued',
    lastErrorCode: null,
    dataOrigin: 'synthetic',
  });
  const accepted = await repo.ingestSource(ownerId, source, scenario.content, [fixtureUrl], null, { route: 'synthetic-investigation', key: externalId, requestHash: `${scenarioId}:${fixtureUrl}` });
  return { source: accepted.source, fixtureUrl };
}
