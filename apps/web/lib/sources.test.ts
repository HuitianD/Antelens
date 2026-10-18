import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { MessageSummary } from '@beforeyou/contracts';
import { originalSources, shortTime } from './sources.js';

function message(title: string, occurredAt: string, caseIds: string[]): MessageSummary {
  return { id: randomUUID(), connectionId: randomUUID(), kind: 'gmail', externalId: title, externalThreadId: null, receivedAt: occurredAt, occurredAt, title, senderLabel: `${title} sender`, previewText: title, contentRef: 'private:test', disposition: 'action_required', processingStatus: 'complete', lastErrorCode: null, dataOrigin: 'user', caseIds };
}

test('a later reply does not replace the original request named in the list', () => {
  const caseId = randomUUID();
  const reply = message('Reply', '2026-10-18T12:00:00.000Z', [caseId]);
  const original = message('Original', '2026-10-17T09:00:00.000Z', [caseId]);
  const unrelated = message('Newsletter', '2026-10-16T09:00:00.000Z', []);
  const sources = originalSources([reply, unrelated, original]);
  assert.equal(sources.get(caseId)?.title, 'Original');
  assert.equal(sources.size, 1);
});

test('list time shows the clock today and the date otherwise', () => {
  const now = new Date(2026, 9, 18, 15, 0);
  assert.match(shortTime(new Date(2026, 9, 18, 9, 5).toISOString(), now), /^9:05\sAM$/);
  assert.equal(shortTime(new Date(2026, 9, 12, 9, 5).toISOString(), now), 'Oct 12');
  assert.equal(shortTime(new Date(2025, 9, 12, 9, 5).toISOString(), now), 'Oct 12, 2025');
});
