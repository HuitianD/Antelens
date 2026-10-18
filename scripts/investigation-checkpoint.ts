import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { supabaseBackendKey, supabaseServiceHeaders } from '../packages/db/src/credentials.js';
import { assertLiveInvestigationConfiguration, requiredInvestigationVariables } from '../apps/api/src/synthetic-ingest.js';

import { loadEnvLocal } from './load-env-local.js';
loadEnvLocal();
if (existsSync('.local/browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.local/browsers');
process.env.APP_MODE = 'live';

type Stage = { name: string; result: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string };
const stages: Stage[] = [];
const note = (name: string, result: Stage['result'], detail: string) => stages.push({ name, result, detail });

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';
const webOrigin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = supabaseBackendKey();

const localBrowser = (process.env.BROWSER_RUNTIME?.trim() || 'daytona') === 'local_controlled';
const browserLabel = localBrowser ? 'Local controlled-fixture browser (not Daytona)' : 'Daytona sandbox browser';
try {
  assertLiveInvestigationConfiguration();
  note('Provider configuration', 'PASS', `Factory, Anthropic, fixture origin, and allowlisted domains are present. Browser runtime: ${browserLabel}.`);
} catch {
  const missing = requiredInvestigationVariables().filter(name => !process.env[name]?.trim());
  note('Provider configuration', 'BLOCKED', `Missing environment variables: ${missing.join(', ')}.`);
}

if (!url || !publishable || !secret) note('Supabase session', 'BLOCKED', 'Supabase public URL, publishable key, or backend secret is missing.');
else {
  const health = await fetch(`${apiOrigin}/health/live`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!health?.ok || (await health.json()).mode !== 'live') {
    note('Live services', 'BLOCKED', 'Start APP_MODE=live pnpm dev:live on pinned Node before running the checkpoint.');
  } else {
    note('Live services', 'PASS', 'API and worker are running in live mode.');
    const password = `Aa1!${randomBytes(12).toString('hex')}`;
    const email = `beforeyou.investigation.${Date.now()}@example.test`;
    await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: { ...supabaseServiceHeaders(secret), 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }), signal: AbortSignal.timeout(15000) });
    const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: publishable, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000) });
    const token = signIn.ok ? (await signIn.json() as { access_token?: string }).access_token : undefined;
    if (!token) note('Supabase session', 'BLOCKED', 'Could not obtain a bearer token for the checkpoint user.');
    else {
      note('Supabase session', 'PASS', 'Authenticated API session is available.');
      const fixtureOrigin = process.env.CONTROLLED_FIXTURE_ORIGIN!.replace(/\/$/, '');
      const fixtureUrl = `${fixtureOrigin}/fixtures/SC-01`;
      const fixture = await fetch(fixtureUrl, { headers: { 'ngrok-skip-browser-warning': '1' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!fixture?.ok) note('Controlled fixture reachability', 'FAIL', 'The configured fixture origin did not return SC-01 over HTTPS.');
      else {
        const html = await fixture.text();
        note('Controlled fixture reachability', html.includes('$29') && html.includes('$40') ? 'PASS' : 'FAIL', 'SC-01 fixture is reachable and contains the rental fee conflict text.');
      }
      if (stages.find(s => s.name === 'Provider configuration')?.result === 'PASS') {
        const queued = await fetch(`${apiOrigin}/v1/synthetic/investigations`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: webOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(16).toString('hex') }, body: '{}', signal: AbortSignal.timeout(15000) });
        if (!queued.ok) note('Investigation queue', 'FAIL', `Synthetic investigation ingress returned HTTP ${queued.status}.`);
        else {
          const sourceId = (await queued.json()).data.sourceEventId as string;
          note('Investigation queue', 'PASS', 'SC-01 synthetic source was accepted and queued for triage.');
          const connections = await fetch(`${apiOrigin}/v1/connections`, { headers: { Authorization: `Bearer ${token}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
          if (connections.ok) {
            const items = (await connections.json()).data as Array<{ kind: string; status: string; accountLabel: string }>;
            const synthetic = items.find(c => c.kind === 'gmail' && c.accountLabel.includes('Synthetic'));
            note('Synthetic mailbox presentation', synthetic && synthetic.status === 'not_connected' ? 'PASS' : 'FAIL', 'Synthetic fixture mailboxes are labeled and not shown as a connected real Gmail account.');
          }
          const deadline = Date.now() + 480000;
          let published = false;
          while (Date.now() < deadline) {
            const messages = await fetch(`${apiOrigin}/v1/messages/${sourceId}`, { headers: { Authorization: `Bearer ${token}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
            if (messages.ok) {
              const detail = (await messages.json()).data;
              const caseId = detail.caseIds?.[0];
              if (caseId) {
                const c = await fetch(`${apiOrigin}/v1/cases/${caseId}`, { headers: { Authorization: `Bearer ${token}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
                if (c.ok) {
                  const body = await c.json();
                  const assessment = body.data.currentAssessment;
                  const run = body.data.latestRun;
                  if (assessment && run?.provenance?.execution === 'live' && assessment.provenance?.execution === 'live') {
                    published = true;
                    const evidence = body.data.evidence as Array<{ provenance: { execution: string }; excerpt: string | null; artifactId: string | null }>;
                    note('Claude / Droid triage & investigation', 'PASS', `Live assessment published with verdict ${assessment.verdict ?? 'null'} (run ${run.status}).`);
                    const pageEvidence = evidence.some(e => e.provenance.execution === 'live' && (e.excerpt?.includes('29') || e.excerpt?.includes('membership')));
                    const screenshot = evidence.some(e => e.provenance.execution === 'live' && e.artifactId);
                    if (localBrowser) {
                      note('Local browser evidence & Supabase storage', pageEvidence ? 'PASS' : 'FAIL', pageEvidence ? `Real page excerpt from the local controlled-fixture browser${screenshot ? ' and a stored screenshot' : ''}; the run is labeled as not using Daytona.` : 'Expected page evidence referencing recurring membership terms.');
                      note('Daytona evidence', 'BLOCKED', 'Not verified. BROWSER_RUNTIME=local_controlled was used; sandbox egress is pending sponsor support.');
                    } else {
                      note('Daytona evidence & Supabase storage', pageEvidence ? 'PASS' : run.status === 'limited' ? 'BLOCKED' : 'FAIL', run.status === 'limited' && !pageEvidence ? 'Investigation ended limited before page evidence was stored.' : 'Expected live page evidence referencing recurring membership terms.');
                    }
                    note('Dashboard assessment', assessment.finding?.headline ? 'PASS' : 'FAIL', assessment.finding?.headline ? 'Case detail exposes the live finding for dashboard review.' : 'Assessment published without a finding headline.');
                    break;
                  }
                  if (run?.status === 'failed' || run?.status === 'limited') {
                    note('Claude / Droid triage & investigation', 'FAIL', `Run ended with status ${run.status}.`);
                    break;
                  }
                }
              }
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          if (!published && !stages.some(s => s.name === 'Claude / Droid triage & investigation')) note('Claude / Droid triage & investigation', 'BLOCKED', 'Timed out waiting for a live assessment within eight minutes.');
        }
      }
    }
  }
}

for (const stage of stages) console.log(`${stage.result}: ${stage.name} — ${stage.detail}`);
if (stages.some(s => s.result === 'FAIL')) process.exitCode = 1;
else if (stages.some(s => s.result === 'BLOCKED')) process.exitCode = 2;
