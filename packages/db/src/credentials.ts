import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Prefer current Supabase backend keys while supporting existing service-role JWT deployments. */
export function supabaseBackendKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Opaque sb_secret keys are API keys, not bearer JWTs. */
export function supabaseServiceHeaders(key: string): Record<string, string> {
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) };
}

/** Encryption key stays outside PostgreSQL. Envelopes use random nonces and authenticated AES-GCM. */
export function credentialKey(value = process.env.CREDENTIAL_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error('CREDENTIAL_ENCRYPTION_KEY is missing.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return key;
}
export function encryptCredentials(value: unknown, key = credentialKey()): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decryptCredentials<T>(value: string, key = credentialKey()): T {
  const parts = value.split('.'); const [version, iv, tag, data] = parts;
  if (parts.length !== 4 || version !== 'v1' || !iv || !tag || !data || Buffer.from(iv, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16) throw new Error('Credential envelope is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString()) as T;
}
