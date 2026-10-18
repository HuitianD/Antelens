import { describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ resolve: undefined as ((sandbox: unknown) => void) | undefined, deletes: 0, executions: 0 }));
vi.mock('@daytona/sdk', () => ({ Daytona: class {
  create() { return new Promise(resolve => { mocked.resolve = resolve; }); }
  async delete() { mocked.deletes++; }
} }));
vi.mock('../src/policy.js', async importOriginal => ({ ...await importOriginal<typeof import('../src/policy.js')>(), publicIPv4: async () => ['93.184.215.14'] }));
import { DaytonaBrowser } from '../src/daytona.js';
describe('sandbox lifecycle with mocked Daytona transport', () => {
  it('deletes a sandbox that finishes provisioning after cancellation', async () => {
    mocked.deletes = 0; mocked.executions = 0;
    const browser = new DaytonaBrowser({ factoryApiKey: 'fixture', anthropicApiKey: 'fixture', claudeModelId: 'claude-fixture', daytonaApiKey: 'fixture', daytonaSnapshot: 'fixture', allowedDomains: ['example.com'] }, 'fixture-run');
    const observation = browser.observe('https://example.com/terms');
    const rejected = expect(observation).rejects.toThrow('session has ended');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const closed = browser.close();
    mocked.resolve!({ process: { executeCommand: async () => { mocked.executions++; return {}; } } });
    await closed; await rejected; await browser.close();
    expect(mocked.deletes).toBe(1); expect(mocked.executions).toBe(0);
  });
});
