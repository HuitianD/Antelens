import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { credentialKey, decryptCredentials, encryptCredentials, supabaseBackendKey, supabaseServiceHeaders } from '../src/credentials.js';

test('refresh credentials use authenticated randomized encryption and detect tampering', () => {
  const key = randomBytes(32); const value = { refreshToken: 'synthetic-test-token', scope: 'gmail.readonly' };
  const first = encryptCredentials(value, key); const second = encryptCredentials(value, key);
  assert.notEqual(first, second); assert.ok(!first.includes(value.refreshToken));
  assert.deepEqual(decryptCredentials(first, key), value);
  assert.throws(() => decryptCredentials(first, randomBytes(32)));
  const parts = first.split('.'); parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptCredentials(parts.join('.'), key));
  assert.throws(() => decryptCredentials(`${first}.extra`, key), /invalid/);
});
test('invalid credential key material fails before encryption', () => {
  assert.throws(() => credentialKey(''), /missing/);
  assert.throws(() => credentialKey(Buffer.from('short').toString('base64')), /32 bytes/);
});

test('Supabase opaque backend keys never become bearer tokens and legacy JWTs remain supported', () => {
  assert.equal(supabaseBackendKey({ SUPABASE_SECRET_KEY: 'sb_secret_synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy-jwt' }), 'sb_secret_synthetic');
  assert.equal(supabaseBackendKey({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy-jwt' }), 'synthetic-legacy-jwt');
  assert.equal(supabaseBackendKey({}), undefined);
  assert.deepEqual(supabaseServiceHeaders('sb_secret_synthetic'), { apikey: 'sb_secret_synthetic' });
  assert.deepEqual(supabaseServiceHeaders('synthetic-legacy-jwt'), { apikey: 'synthetic-legacy-jwt', Authorization: 'Bearer synthetic-legacy-jwt' });
});
