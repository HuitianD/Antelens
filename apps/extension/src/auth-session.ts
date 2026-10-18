/** Prefix for the Supabase session in extension local storage. The password is never written here. */
export const AUTH_STORAGE_PREFIX = 'beforeyou.auth.';

export function authStorageKey(key: string): string {
  return AUTH_STORAGE_PREFIX + key;
}

export function isAuthStorageKey(key: string): boolean {
  return key.startsWith(AUTH_STORAGE_PREFIX) || key.startsWith('sb-');
}

/** Refresh shortly before expiry, and whenever the stored session has no expiry. */
export function sessionNeedsRefresh(expiresAtSeconds: number | undefined, nowMs: number, skewMs = 60_000): boolean {
  if (!expiresAtSeconds) return true;
  return expiresAtSeconds * 1000 - nowMs < skewMs;
}
