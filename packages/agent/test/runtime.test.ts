import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Evidence, JourneyStep } from '@beforeyou/contracts';
const fixture = vi.hoisted(() => ({ mode: 'valid', disabled: [] as string[], createOptions: undefined as Record<string, unknown> | undefined, closed: 0, browserClosed: 0, calls: [] as string[], submitted: [] as unknown[] }));
interface FakeTool { name: string; handler: (input: Record<string, unknown>) => Promise<string> }
vi.mock('@factory/droid-sdk/node', () => ({
  AutonomyLevel: { Off: 'off' }, ToolConfirmationOutcome: { Cancel: 'cancel', ProceedOnce: 'once' }, ToolConfirmationType: { McpTool: 'mcp_tool' }, OutputFormatType: { JsonSchema: 'json_schema' },
  listModels: async () => [{ id: 'custom:claude-test-model', disabled: fixture.mode === 'unavailable', isCustom: true, modelProvider: 'anthropic' }],
  tool: (name: string, _description: string, _shape: unknown, handler: FakeTool['handler']) => ({ name, handler }),
  createSdkMcpServer: (server: unknown) => server,
  createSession: async (options: Record<string, unknown>) => {
    fixture.createOptions = options;
    const tools = (options.mcpServers as Array<{ tools: FakeTool[] }>)[0]?.tools ?? [];
    const ids = ['Execute', 'Read', ...tools.map(t => `mcp__beforeyou__${t.name}`)];
    return { id: 'fixture-session',
      listTools: async () => ids.map(id => ({ id, allowed: fixture.mode === 'unrestricted' && id === 'Execute' ? true : !fixture.disabled.includes(id) })),
      updateSettings: async ({ disabledToolIds }: { disabledToolIds: string[] }) => { fixture.disabled = disabledToolIds; },
      close: async () => { fixture.closed++; },
      stream: async function* () {
        fixture.calls.push('stream');
        if (fixture.mode === 'timeout') { const error = new Error('Expired'); error.name = 'TimeoutError'; throw error; }
        if (!tools.length) { yield { type: 'result', success: true, structuredOutput: { outcome: 'no_action', requestSummary: null, impacts: [], candidateCaseId: null, relevantLinkIndexes: [] } }; return; }
        const call = async (name: string, args: Record<string, unknown>) => { fixture.calls.push(name); return JSON.parse(await tools.find(t => t.name === name)!.handler(args)); };
        const context = await call('get_case_context', {});
        if (fixture.mode === 'message' || fixture.mode === 'message_favorable') {
          const refused = await call('start_browser', { sourceEventId: context.data.sources[0].id, linkIndex: 0 });
          fixture.submitted.push(refused);
          const messageId = context.data.evidence.find((e: Evidence) => e.kind === 'message_excerpt').id;
          const favorable = fixture.mode === 'message_favorable';
          fixture.submitted.push(await call('finish_investigation', { proposal: { verdict: favorable ? 'no_issues_found' : 'pause_here', impacts: ['identity'], finding: { headline: 'The message asks for a full Social Security number by reply.', consequence: null, evidenceIds: [messageId] }, nextAction: { kind: 'review_evidence', label: 'Review the request', evidenceId: messageId }, checkedScope: ['Message text only'], limitations: [], changeSummary: null } }));
          yield { type: 'result', success: true };
          return;
        }
        const observed = await call('start_browser', { sourceEventId: context.data.sources[0].id, linkIndex: 0 });
        const evidenceId = observed.data.evidenceIds[0];
        const verdict = fixture.mode === 'invented' || fixture.mode === 'concern' ? 'confirm_first' : 'no_issues_found';
        const proposal = { verdict, impacts: ['money'], finding: { headline: 'The visible fee matches the request.', consequence: null, evidenceIds: [fixture.mode === 'invented' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : evidenceId] }, nextAction: { kind: 'review_evidence', label: 'Review terms', evidenceId }, checkedScope: ['Visible payment terms'], limitations: [], changeSummary: null };
        fixture.submitted.push(await call('finish_investigation', { proposal }));
        yield { type: 'result', success: true };
      },
    };
  },
}));
vi.mock('../src/daytona.js', () => ({ DaytonaBrowser: class {
  async observe(url: string) { return { title: 'Controlled synthetic page', visibleText: 'Application fee $40. No recurring charges.', url, status: 200, anchors: [], fieldLabels: [], scriptedPage: false, loginRequired: false, captcha: false, blockedRequests: false, screenshot: '' }; }
  async close() { fixture.browserClosed++; }
} }));
vi.mock('../src/local-browser.js', () => ({ LocalControlledBrowser: class {
  async observe(url: string) { fixture.calls.push('local_observe'); return { title: 'Controlled synthetic page', visibleText: 'Application fee $40. No recurring charges.', url, status: 200, anchors: [], fieldLabels: [], scriptedPage: false, loginRequired: false, captcha: false, blockedRequests: false, screenshot: '' }; }
  async close() { fixture.browserClosed++; }
} }));
import { byokModel, createLiveAgent, isInvestigationTool } from '../src/runtime.js';
const config = { factoryApiKey: 'synthetic-factory-key', anthropicApiKey: 'synthetic-anthropic-key', claudeModelId: 'claude-test-model', daytonaApiKey: 'synthetic-daytona-key', daytonaSnapshot: 'fixture', allowedDomains: ['example.com'], maxSteps: 24 };
function investigation() {
  const ownerId = randomUUID(), caseId = randomUUID(), runId = randomUUID(), sourceId = randomUUID();
  const evidence: Evidence[] = []; const steps: JourneyStep[] = [];
  return { evidence, steps, input: { ownerId, caseId, runId, sourceRevision: 1, dataOrigin: 'synthetic' as const, sources: [{ id: sourceId, title: 'Synthetic application', content: 'Application fee $40.', links: ['https://example.com/terms'] }], existingEvidence: [],
    saveEvidence: async (capture: { kind: Evidence['kind']; sourceEventId: string | null; stepId: string; sourceLabel: string; displayUrl: string | null; excerpt: string | null; contentHash: string }) => { const saved: Evidence = { kind: capture.kind, sourceEventId: capture.sourceEventId, stepId: capture.stepId, sourceLabel: capture.sourceLabel, displayUrl: capture.displayUrl, excerpt: capture.excerpt, contentHash: capture.contentHash, id: randomUUID(), caseId, runId, observedAt: new Date().toISOString(), artifactId: null, provenance: { dataOrigin: 'synthetic', execution: 'live' } }; evidence.push(saved); return saved; },
    onStep: async (step: JourneyStep) => { steps.push(step); },
  } };
}
beforeEach(() => { fixture.mode = 'valid'; fixture.disabled = []; fixture.closed = 0; fixture.browserClosed = 0; fixture.calls = []; fixture.submitted = []; fixture.createOptions = undefined; });
describe('adapter execution with explicitly mocked providers', () => {
  it('publishes only persisted observations and emits unique ordered journey steps', async () => {
    const test = investigation();
    const result = await createLiveAgent(config).investigate(test.input);
    expect(result.proposal.finding?.evidenceIds).toEqual([test.evidence[0]!.id]);
    expect(test.steps.map(step => step.index)).toEqual([0, 1]);
    expect(new Set(test.steps.map(step => step.id)).size).toBe(2);
    expect(fixture.disabled).toContain('Execute'); expect(fixture.disabled).toContain('Read');
    expect(fixture.createOptions?.modelId).toBe('custom:claude-test-model');
    expect(fixture.closed).toBe(1); expect(fixture.browserClosed).toBe(1);
    await expect(access(fixture.createOptions!.cwd as string)).rejects.toThrow();
  });
  it('fails before reading sources if an unrelated native tool remains enabled', async () => {
    fixture.mode = 'unrestricted';
    await expect(createLiveAgent(config).investigate(investigation().input)).rejects.toThrow('restrict its tools');
    expect(fixture.calls).toEqual([]); expect(fixture.closed).toBe(1); expect(fixture.browserClosed).toBe(1);
  });
  it('rejects fabricated evidence after one bounded correction and cleans resources', async () => {
    fixture.mode = 'invented';
    await expect(createLiveAgent(config).investigate(investigation().input)).rejects.toThrow('valid evidence-backed proposal');
    expect(fixture.calls.filter(c => c === 'stream')).toHaveLength(2);
    expect(fixture.closed).toBe(1); expect(fixture.browserClosed).toBe(1);
  });
  it('keeps provider timeout limited with no favorable assessment', async () => {
    fixture.mode = 'timeout';
    const result = await createLiveAgent(config).investigate(investigation().input);
    expect(result.proposal.verdict).toBeNull(); expect(result.limitations.some(l => l.code === 'time_limit')).toBe(true);
    expect(fixture.closed).toBe(1); expect(fixture.browserClosed).toBe(1);
  });
  it('labels local controlled-fixture browsing and refuses it for real user content', async () => {
    const local = { ...config, daytonaApiKey: '', daytonaSnapshot: '', browserRuntime: 'local_controlled' as const, controlledFixtureOrigin: 'https://example.com' };
    // A favorable verdict is not accepted while the run carries the local-browser label.
    await expect(createLiveAgent(local).investigate(investigation().input)).rejects.toThrow('evidence-backed proposal');
    fixture.mode = 'concern'; fixture.calls = [];
    const test = investigation();
    const result = await createLiveAgent(local).investigate(test.input);
    expect(fixture.calls).toContain('local_observe');
    expect(result.proposal.verdict).toBe('confirm_first');
    expect(result.limitations.some(l => l.code === 'network_policy' && l.message.includes('not an isolated Daytona sandbox'))).toBe(true);
    await expect(createLiveAgent({ ...local, controlledFixtureOrigin: undefined }).investigate(investigation().input)).rejects.toThrow('controlled fixture origin');
  });
  it('assesses real messages from their text without opening links in the local runtime', async () => {
    const local = { ...config, daytonaApiKey: '', daytonaSnapshot: '', browserRuntime: 'local_controlled' as const, controlledFixtureOrigin: 'https://example.com' };
    const userCase = () => {
      const test = investigation();
      const source = test.input.sources[0]!;
      const message: Evidence = { id: randomUUID(), caseId: test.input.caseId, runId: test.input.runId, sourceEventId: source.id, stepId: null, kind: 'message_excerpt', observedAt: new Date().toISOString(), sourceLabel: source.title, displayUrl: null, excerpt: 'Reply with your full Social Security number.', artifactId: null, contentHash: 'a'.repeat(64), provenance: { dataOrigin: 'user', execution: 'live' } };
      return { ...test.input, dataOrigin: 'user' as const, existingEvidence: [message] };
    };
    fixture.mode = 'message';
    const result = await createLiveAgent(local).investigate(userCase());
    expect(fixture.calls).not.toContain('local_observe');
    expect((fixture.submitted[0] as { ok: boolean }).ok).toBe(false);
    expect(result.proposal.verdict).toBe('pause_here');
    expect(result.limitations.filter(l => l.message.startsWith('Linked pages were not opened'))).toHaveLength(1);
    expect(result.limitations.some(l => l.message.includes('local controlled-fixture browser'))).toBe(false);
    fixture.mode = 'message_favorable'; fixture.calls = []; fixture.submitted = [];
    await expect(createLiveAgent(local).investigate(userCase())).rejects.toThrow('evidence-backed proposal');
    expect(fixture.calls).not.toContain('local_observe');
  });
  it('recognizes investigation tools across Droid MCP id formats', () => {
    expect(isInvestigationTool('mcp__beforeyou__get_case_context')).toBe(true);
    expect(isInvestigationTool('beforeyou___get_case_context')).toBe(true);
    expect(isInvestigationTool('Execute')).toBe(false);
    expect(isInvestigationTool('beforeyou___Execute')).toBe(false);
  });
  it('creates the agent directory when the configured runtime path is blank', async () => {
    await createLiveAgent({ ...config, runtimeDirectory: '' }).investigate(investigation().input);
    expect(String(fixture.createOptions?.cwd ?? '').length).toBeGreaterThan(1);
    expect(fixture.closed).toBe(1);
  });
  it('sends the Anthropic workspace header only when a workspace id is configured', async () => {
    expect(byokModel({ claudeModelId: 'claude-test-model' })).not.toHaveProperty('extraHeaders');
    expect(byokModel({ claudeModelId: 'claude-test-model', anthropicWorkspaceId: 'wrkspc_test' }).extraHeaders).toEqual({ 'anthropic-workspace-id': '${ANTHROPIC_WORKSPACE_ID}' });
    expect(() => createLiveAgent({ ...config, anthropicApiKey: 'sk-ant-usr-fixture' })).not.toThrow();
    expect(() => createLiveAgent({ ...config, anthropicWorkspaceId: 'not a workspace' })).toThrow('ANTHROPIC_WORKSPACE_ID');
    const test = investigation();
    test.input.saveEvidence = async capture => {
      const settings = await readFile(join(fixture.createOptions!.cwd as string, '.factory/settings.json'), 'utf8');
      const parsed = JSON.parse(settings) as { customModels: Array<{ extraHeaders?: Record<string, string>; apiKey: string; model: string }> };
      expect(parsed.customModels[0]!.extraHeaders).toEqual({ 'anthropic-workspace-id': '${ANTHROPIC_WORKSPACE_ID}' });
      expect(parsed.customModels[0]!.model).toBe('claude-test-model');
      expect(settings).not.toContain('wrkspc_test');
      expect((fixture.createOptions!.env as Record<string, string>).ANTHROPIC_WORKSPACE_ID).toBe('wrkspc_test');
      return { kind: capture.kind, sourceEventId: capture.sourceEventId, stepId: capture.stepId, sourceLabel: capture.sourceLabel, displayUrl: capture.displayUrl, excerpt: capture.excerpt, contentHash: capture.contentHash, id: randomUUID(), caseId: test.input.caseId, runId: test.input.runId, observedAt: new Date().toISOString(), artifactId: null, provenance: { dataOrigin: 'synthetic', execution: 'live' } };
    };
    await createLiveAgent({ ...config, anthropicWorkspaceId: 'wrkspc_test' }).investigate(test.input);
  });
  it('rejects unavailable Claude BYOK and automatic model routing', async () => {
    expect(() => createLiveAgent({ ...config, claudeModelId: 'auto' })).toThrow();
    fixture.mode = 'unavailable';
    await expect(createLiveAgent(config).investigate(investigation().input)).rejects.toThrow('not available');
    expect(fixture.calls).toEqual([]);
  });
  it('triages with every native tool disabled and no browser calls', async () => {
    const source = investigation().input.sources[0]!;
    const result = await createLiveAgent(config).triage({ source, candidateCases: [] });
    expect(result.outcome).toBe('no_action'); expect(fixture.disabled).toEqual(['Execute','Read']); expect(fixture.browserClosed).toBe(0);
  });
  it('does not pass unrelated backend credentials to Droid or write keys in its settings', async () => {
    process.env.BEFOREYOU_TEST_BACKEND_SECRET = 'sensitive-fixture';
    const test = investigation();
    test.input.saveEvidence = async capture => {
      const settings = await readFile(join(fixture.createOptions!.cwd as string, '.factory/settings.json'), 'utf8');
      expect(settings).not.toContain(config.anthropicApiKey); expect(settings).not.toContain(config.factoryApiKey);
      expect((fixture.createOptions!.env as Record<string,string>).BEFOREYOU_TEST_BACKEND_SECRET).toBeUndefined();
      expect((fixture.createOptions!.env as Record<string,string>).DATABASE_URL).toBeUndefined();
      return { kind: capture.kind, sourceEventId: capture.sourceEventId, stepId: capture.stepId, sourceLabel: capture.sourceLabel, displayUrl: capture.displayUrl, excerpt: capture.excerpt, contentHash: capture.contentHash, id: randomUUID(), caseId: test.input.caseId, runId: test.input.runId, observedAt: new Date().toISOString(), artifactId: null, provenance: { dataOrigin: 'synthetic', execution: 'live' } };
    };
    try { await createLiveAgent(config).investigate(test.input); } finally { delete process.env.BEFOREYOU_TEST_BACKEND_SECRET; }
  });
});
