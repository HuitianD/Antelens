import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AgentError, publicIPv4, validateTarget } from './policy.js';
import { fixtureRequestHeaders, ObservationSchema, type InvestigationBrowser, type Observation } from './observation.js';
import type { AgentConfig } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(here, '../../..');
/** The same reviewed browser program the Daytona image runs; nothing model-generated is executed. */
export const BROWSER_PROGRAM = resolve(REPOSITORY_ROOT, 'deployment/daytona/browser.mjs');
const FIXTURE_PATH = /^\/fixtures\/[A-Z0-9-]+$/;

/** Local browsing is limited to pages of the configured controlled fixture origin. */
export function assertControlledFixtureUrl(raw: string, fixtureOrigin: string | undefined, allowedDomains: readonly string[]): URL {
  const url = validateTarget(raw, allowedDomains);
  let origin: URL;
  try { origin = new URL(fixtureOrigin ?? ''); } catch { throw new AgentError('CONFIG_MISSING', 'The controlled fixture origin is not configured for local browsing.'); }
  if (url.origin !== origin.origin || !FIXTURE_PATH.test(url.pathname)) throw new AgentError('TARGET_BLOCKED', 'The local browser opens only controlled fixture pages.');
  return url;
}

export class LocalControlledBrowser implements InvestigationBrowser {
  private addresses: Promise<string[]> | undefined;
  private closing = false;
  constructor(private config: AgentConfig) {}
  async observe(raw: string): Promise<Observation> {
    const url = assertControlledFixtureUrl(raw, this.config.controlledFixtureOrigin, this.config.allowedDomains);
    if (this.closing) throw new AgentError('INVESTIGATION_LIMITED', 'This browser session has ended.');
    this.addresses ??= Promise.all(this.config.allowedDomains.map(publicIPv4)).then(lists => [...new Set(lists.flat())]);
    const addresses = await this.addresses;
    const argument = Buffer.from(JSON.stringify({ url: url.href, domains: this.config.allowedDomains, addresses, headers: fixtureRequestHeaders(url.hostname) })).toString('base64url');
    const playwrightModule = pathToFileURL(createRequire(import.meta.url).resolve('playwright')).href;
    // Prefer the repository's installed browsers; an inherited PLAYWRIGHT_BROWSERS_PATH may point at an empty cache.
    const repositoryBrowsers = resolve(REPOSITORY_ROOT, '.local/browsers');
    const browsersPath = existsSync(repositoryBrowsers) ? repositoryBrowsers : process.env.PLAYWRIGHT_BROWSERS_PATH || undefined;
    // The child receives no provider, database, or mailbox credentials.
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', LANG: 'en_US.UTF-8', BEFOREYOU_PLAYWRIGHT_MODULE: playwrightModule, ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {}) };
    const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>(done => {
      execFile(process.execPath, [BROWSER_PROGRAM, argument], { env, cwd: dirname(BROWSER_PROGRAM), timeout: 40000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        done({ code: error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    });
    if (output.code !== 0) {
      // The child holds no credentials, so its diagnostic output is safe to log for operators.
      console.error('Local controlled browser failed:', output.stderr.trim().slice(0, 400) || output.stdout.trim().slice(0, 200) || `exit ${output.code}`);
      throw new AgentError('SANDBOX_NETWORK_BLOCKED', 'The local browser could not access this controlled fixture page.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(output.stdout.trim()); } catch { throw new AgentError('OUTPUT_INVALID', 'The browser returned an invalid observation.'); }
    const observation = ObservationSchema.parse(parsed);
    assertControlledFixtureUrl(observation.url, this.config.controlledFixtureOrigin, this.config.allowedDomains);
    return observation;
  }
  async close(): Promise<void> { this.closing = true; }
}
