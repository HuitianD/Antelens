import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Assessment, CaseSummary, MessageSummary, Verdict } from '@beforeyou/contracts';
import { ordinaryNoActionMessages, overviewCases, overviewCounts, overviewMessages } from './overview.js';

const timestamp = '2026-10-18T12:00:00.000Z';
function message(title: string, disposition: MessageSummary['disposition'], processing: MessageSummary['processingStatus'], caseIds: string[] = []): MessageSummary {
  return { id: randomUUID(), connectionId: randomUUID(), kind: 'gmail', externalId: title, externalThreadId: null, receivedAt: timestamp, occurredAt: timestamp, title, senderLabel: 'Mailbox', previewText: title, contentRef: 'private:test', disposition, processingStatus: processing, lastErrorCode: null, dataOrigin: 'user', caseIds };
}
function assessment(caseId: string, verdict: Verdict): Assessment {
  return { id: randomUUID(), caseId, runId: randomUUID(), version: 1, sourceRevision: 1, verdict, impacts: ['money'], finding: { headline: 'Checked request', consequence: null, evidenceIds: [randomUUID()] }, nextAction: { kind: 'review_evidence', label: 'Review', evidenceId: randomUUID() }, checkedScope: ['Visible terms'], limitations: [], changeSummary: null, supersedesAssessmentId: null, createdAt: timestamp, provenance: { dataOrigin: 'user', execution: 'live' } };
}
function item(title: string, verdict: Verdict | null, freshness: CaseSummary['freshness'] = 'current', status: CaseSummary['latestRunStatus'] = verdict ? 'complete' : 'failed'): CaseSummary {
  const id = randomUUID();
  return { id, recordVersion: 1, title, sourceKinds: ['gmail'], sourceRevision: 1, currentAssessment: verdict ? assessment(id, verdict) : null, activeRunId: null, latestRunStatus: status, freshness, reviewStatus: 'unreviewed', updatedAt: timestamp };
}

test('No action needed contains completed no_action messages and active clear cases, without represented, pending, or failed mail', () => {
  const pause = item('Email 07', 'pause_here', 'current', 'limited');
  const clear = item('Consistent application', 'no_issues_found');
  const rechecking = item('Earlier clear result', 'no_issues_found', 'stale', 'checking');
  const failed = item('Unchecked request', null, 'current', 'failed');
  const pending = item('Still checking', null, 'current', 'checking');
  const messages = [
    message('Email 21', 'no_action', 'complete'),
    message('Email 22', 'no_action', 'complete'),
    message('Email 23', 'no_action', 'complete'),
    message('Email 07', 'action_required', 'complete', [pause.id]),
    message('Awaiting triage', 'pending', 'queued'),
    message('Triage failed', 'no_action', 'failed'),
  ];
  const cases = [pause, clear, rechecking, failed, pending];
  const third = [...overviewCases(cases, 'no_issues_found').map(item => item.title), ...overviewMessages(messages, 'no_issues_found', false).map(item => item.title)];
  assert.deepEqual(third, ['Consistent application', 'Earlier clear result', 'Email 21', 'Email 22', 'Email 23']);
  assert.deepEqual(overviewCases(cases, 'pause_here').map(item => item.title), ['Email 07']);
  assert.deepEqual(overviewMessages(messages, 'pause_here', false), []);
  assert.deepEqual(overviewCases(cases, 'all').map(item => item.title), ['Email 07', 'Consistent application', 'Earlier clear result']);
  const counts = overviewCounts(cases, messages);
  assert.equal(counts.pause_here, 1);
  assert.equal(counts.confirm_first, 0);
  assert.equal(counts.no_action_needed, 5);
  assert.equal(counts.all, 3 + 3 + 2);
  assert.equal(ordinaryNoActionMessages(messages).some(item => item.caseIds.includes(pause.id)), false);
});

test('an impact filter hides ordinary messages so their rows are not counted twice or out of scope', () => {
  const clear = item('Consistent application', 'no_issues_found');
  const messages = [message('Email 21', 'no_action', 'complete')];
  assert.equal(overviewCounts([clear], messages, true).no_action_needed, 1);
  assert.deepEqual(overviewMessages(messages, 'all', true), []);
});
