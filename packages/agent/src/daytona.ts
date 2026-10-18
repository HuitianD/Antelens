import { Daytona, type Sandbox } from '@daytona/sdk';
import { AgentError, publicIPv4, validateTarget } from './policy.js';
import { fixtureRequestHeaders, ObservationSchema, type InvestigationBrowser, type Observation } from './observation.js';
import type { AgentConfig } from './types.js';
export type { Observation } from './observation.js';
const DNS_RESOLVERS = ['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4'];
export class DaytonaBrowser implements InvestigationBrowser {
  private sandbox: Sandbox | undefined;
  private readonly daytona: Daytona;
  private addresses: string[] = [];
  private creation: Promise<Sandbox> | undefined;
  private deletion: Promise<void> | undefined;
  private closing = false;
  constructor(private config: AgentConfig, private runId: string) { this.daytona = new Daytona({ apiKey: config.daytonaApiKey, requestTimeoutMs: 30000 }); }
  async observe(raw: string): Promise<Observation> {
    const url = validateTarget(raw, this.config.allowedDomains);
    if (this.closing) throw new AgentError('INVESTIGATION_LIMITED', 'This browser session has ended.');
    if (!this.creation) {
      this.creation = (async () => {
        this.addresses = [...new Set((await Promise.all(this.config.allowedDomains.map(publicIPv4))).flat())];
        return this.daytona.create({ snapshot: this.config.daytonaSnapshot, labels: { application: 'beforeyou', runId: this.runId }, networkAllowList: [...this.addresses, ...DNS_RESOLVERS].map(ip => `${ip}/32`).join(','), autoStopInterval: 5, autoDeleteInterval: 10 });
      })();
    }
    this.sandbox = await this.creation;
    if (this.closing) throw new AgentError('INVESTIGATION_LIMITED', 'This browser session has ended.');
    const argument = Buffer.from(JSON.stringify({ url: url.href, domains: this.config.allowedDomains, addresses: this.addresses, headers: fixtureRequestHeaders(url.hostname) })).toString('base64url');
    // The command and executable are fixed. The only argument is encoded JSON.
    const result = await this.sandbox.process.executeCommand(`node /opt/beforeyou/browser.mjs ${argument}`, '/opt/beforeyou', undefined, 40);
    if (result.exitCode !== 0) throw new AgentError('SANDBOX_NETWORK_BLOCKED', 'The isolated browser could not access this supported page.');
    let parsed: unknown;
    try { parsed = JSON.parse(result.result.trim()); } catch { throw new AgentError('OUTPUT_INVALID', 'The browser returned an invalid observation.'); }
    const observation = ObservationSchema.parse(parsed);
    validateTarget(observation.url, this.config.allowedDomains);
    return observation;
  }
  async close(): Promise<void> {
    this.closing = true;
    const sandbox = this.sandbox ?? await this.creation?.catch(() => undefined);
    if (sandbox) { this.deletion ??= this.daytona.delete(sandbox); await this.deletion; this.sandbox = undefined; }
  }
}
