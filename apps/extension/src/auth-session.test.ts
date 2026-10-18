import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTH_STORAGE_PREFIX, authStorageKey, isAuthStorageKey, sessionNeedsRefresh } from './auth-session.ts';
import { captureStatus, captureTitle } from './capture-status.ts';

test('auth keys stay namespaced and a password-like value is not an auth key by itself', () => {
  assert.equal(authStorageKey('sb-project-auth-token'), `${AUTH_STORAGE_PREFIX}sb-project-auth-token`);
  assert.equal(isAuthStorageKey(authStorageKey('sb-project-auth-token')), true);
  assert.equal(isAuthStorageKey('sb-project-auth-token'), true);
  assert.equal(isAuthStorageKey('clientInstallationId'), false);
  assert.equal(isAuthStorageKey('allowedSiteOrigins'), false);
});

test('a session is refreshed before it expires and kept while it is still valid', () => {
  const now = Date.parse('2026-10-18T08:40:00.000Z');
  assert.equal(sessionNeedsRefresh(undefined, now), true);
  assert.equal(sessionNeedsRefresh(Math.floor(now / 1000) + 30, now), true);
  assert.equal(sessionNeedsRefresh(Math.floor(now / 1000) + 3600, now), false);
});

test('a finished captured-page run is not left on Checking', () => {
  const finished = captureStatus({ run: 'limited', current: true, inspected: true, hasCapture: true });
  assert.equal(finished.phase, 'limited');
  assert.equal(finished.message, 'Captured page inspected in Daytona');
  assert.equal(captureTitle(finished.phase, 'confirm_first'), 'Confirm first');
  assert.equal(captureTitle('checking'), 'Checking captured content');
  assert.equal(captureStatus({ run: 'failed', current: false, inspected: false, hasCapture: true }).phase, 'failed');
  assert.equal(captureStatus({ run: 'checking', current: false, inspected: false, hasCapture: true }).phase, 'checking');
});
