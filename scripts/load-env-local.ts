import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Node's built-in env-file loader skips CLAUDE_* keys; read .env.local manually for local development.
 * Matches Node precedence: variables already present in the process environment (CLI overrides such as
 * APP_MODE=live) are never replaced by file values.
 */
export function loadEnvLocal(path = resolve('.env.local')): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // An empty inherited value must not hide the file. A non-empty process value, such as APP_MODE=live, still wins.
    if (!process.env[key]) process.env[key] = value;
  }
}
