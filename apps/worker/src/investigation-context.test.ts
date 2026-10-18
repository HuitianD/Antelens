import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EvidenceSchema, type Evidence } from '@beforeyou/contracts';
import { caseDetail, createDemoState, DEMO_OWNER, recheckDemo } from '@beforeyou/fixtures';
import { investigationContext } from './investigation-context.js';

test('verification rechecks retain the statement and previous assessment, recapturing source evidence for the leased run', async () => {
  const state = createDemoState();
  const item = state.cases.find(c => c.currentAssessment)!;
  const previous = item.currentAssessment!;
  const note = 'The sender told me by phone that membership is optional.';
  const accepted = recheckDemo(state, item.id, 'verification_requested', note);
  const run = state.runs.find(r => r.id === accepted.runId)!;
  const prior = caseDetail(state, item.id);
  const oldObservations = prior.evidence.filter(e => e.runId !== null).map(e => e.id);
  const saved: Evidence[] = [];
  const result = await investigationContext({
    caseDetail: async (ownerId, caseId) => {
      assert.equal(ownerId, DEMO_OWNER); assert.equal(caseId, item.id); return prior;
    },
    saveEvidence: async (ownerId, runId, generation, evidence) => {
      assert.equal(ownerId, DEMO_OWNER); assert.equal(runId, run.id); assert.equal(generation, 7);
      assert.equal(evidence.runId, run.id); saved.push(EvidenceSchema.parse(evidence)); return evidence;
    },
  }, DEMO_OWNER, run, 7, [{ id: prior.sources[0]!.id, title: 'Original fee request', content: 'The application fee is $40.', links: [] }]);
  assert.equal(result.priorAssessment?.id, previous.id);
  assert.equal(result.existingEvidence.length, 2);
  const statement = result.existingEvidence.find(e => e.kind === 'user_statement')!;
  assert.equal(statement.excerpt, note); assert.equal(statement.runId, null);
  assert(!result.existingEvidence.some(e => oldObservations.includes(e.id)));
  assert.equal(saved.length, 1); assert.equal(saved[0]!.kind, 'message_excerpt');
  assert.equal(saved[0]!.sourceEventId, prior.sources[0]!.id);
  assert.equal(saved[0]!.contentHash, createHash('sha256').update('The application fee is $40.').digest('hex'));
});
