import type { AgentConfig } from './types.js';

/**
 * `BROWSER_RUNTIME` selects the page-observation runtime. Daytona is the default and the only
 * runtime for real user destinations. `local_controlled` is an explicitly labeled fallback that
 * opens controlled fixture pages on the worker host while sandbox egress is unavailable.
 */
export function browserRuntimeFromEnv(value: string | undefined): NonNullable<AgentConfig['browserRuntime']> {
  const normalized = (value ?? '').trim();
  if (!normalized || normalized === 'daytona') return 'daytona';
  if (normalized === 'local_controlled') return 'local_controlled';
  throw new Error('BROWSER_RUNTIME must be daytona or local_controlled.');
}
