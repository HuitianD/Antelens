import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('.local/browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.local/browsers');
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { supabaseBackendKey, supabaseServiceHeaders } from '../packages/db/src/credentials.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.APP_MODE = 'live';

type Result = 'PASS' | 'FAIL' | 'BLOCKED';
const checks: { name: string; result: Result; detail: string }[] = [];
const note = (name: string, result: Result, detail: string) => checks.push({ name, result, detail });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = supabaseBackendKey();
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';
const webOrigin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000';

if (!url || !publishable || !secret) {
  note('Configuration', 'BLOCKED', 'Supabase public URL, publishable key, or backend secret is missing from the ignored environment file.');
  for (const check of checks) console.log(`${check.result}: ${check.name} — ${check.detail}`);
  process.exitCode = 2;
} else {
  const password = `Aa1!${randomBytes(12).toString('hex')}`;
  const stamp = Date.now().toString(36);
  const emailA = `beforeyou.verify.a.${stamp}@example.test`;
  const emailB = `beforeyou.verify.b.${stamp}@example.test`;
  let tokenA = '';
  let tokenB = '';
  let sourceId = '';
  try {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...supabaseServiceHeaders(secret), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password, email_confirm: true }),
      signal: AbortSignal.timeout(15000),
    });
    const createdB = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...supabaseServiceHeaders(secret), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password, email_confirm: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!created.ok || !createdB.ok) throw new Error('admin_user_create_failed');

    const signIn = async (email: string) => {
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: publishable, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const body = await response.json() as { access_token?: string };
      return body.access_token ?? null;
    };
    tokenA = (await signIn(emailA)) ?? '';
    tokenB = (await signIn(emailB)) ?? '';
    if (!tokenA || !tokenB) throw new Error('password_sign_in_failed');

    const health = await fetch(`${apiOrigin}/health/live`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!health?.ok || (await health.json()).mode !== 'live') {
      note('Runtime services', 'BLOCKED', 'Start live services with pinned Node: APP_MODE=live pnpm dev:live');
      throw new Error('services_unavailable');
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(webOrigin, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByLabel('Email').fill(emailA);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor({ timeout: 45000 });
      await page.getByText('Live workspace', { exact: true }).first().waitFor({ timeout: 15000 });
      note('Real sign-in through the web UI', 'PASS', 'Email/password sign-in reached the authenticated Overview workspace.');
    } catch {
      note('Real sign-in through the web UI', 'FAIL', 'The sign-in form did not reach the authenticated dashboard.');
    } finally {
      await browser.close();
    }

    const dashboard = await fetch(`${apiOrigin}/v1/dashboard`, { headers: { Authorization: `Bearer ${tokenA}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
    if (!dashboard.ok) note('API recognizes the signed-in user', 'FAIL', `Dashboard request returned HTTP ${dashboard.status}.`);
    else {
      const body = await dashboard.json();
      if (body?.data?.mode !== 'live') note('API recognizes the signed-in user', 'FAIL', 'Dashboard did not report live mode for the authenticated session.');
      else note('API recognizes the signed-in user', 'PASS', 'Authenticated dashboard request succeeded for the signed-in owner.');
    }

    const ingest = await fetch(`${apiOrigin}/v1/synthetic/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, Origin: webOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': randomBytes(16).toString('hex') },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (!ingest.ok) note('Synthetic test record persists after refresh', 'FAIL', `Synthetic ingest returned HTTP ${ingest.status}.`);
    else {
      sourceId = (await ingest.json()).data.sourceEventId as string;
      const first = await fetch(`${apiOrigin}/v1/messages/${sourceId}`, { headers: { Authorization: `Bearer ${tokenA}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
      const second = await fetch(`${apiOrigin}/v1/messages/${sourceId}`, { headers: { Authorization: `Bearer ${tokenA}`, Origin: webOrigin, 'Cache-Control': 'no-store' }, signal: AbortSignal.timeout(10000) });
      const title = first.ok ? (await first.json()).data?.source?.title : '';
      if (!first.ok || !second.ok || !String(title).includes('Synthetic test record')) {
        note('Synthetic test record persists after refresh', 'FAIL', 'The labeled synthetic message was not readable twice for the same owner.');
      } else note('Synthetic test record persists after refresh', 'PASS', 'The labeled synthetic message remained available after a repeat fetch.');
    }

    if (!sourceId) note('Another test user cannot access that record through the API', 'BLOCKED', 'Synthetic record id was unavailable because ingest failed.');
    else {
      const cross = await fetch(`${apiOrigin}/v1/messages/${sourceId}`, { headers: { Authorization: `Bearer ${tokenB}`, Origin: webOrigin }, signal: AbortSignal.timeout(10000) });
      if (cross.status === 404) note('Another test user cannot access that record through the API', 'PASS', 'Cross-owner message access returned not found.');
      else note('Another test user cannot access that record through the API', 'FAIL', `Cross-owner access returned HTTP ${cross.status}.`);
    }
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'services_unavailable') {
      /* already noted */
    } else if (message === 'admin_user_create_failed') {
      note('Real sign-in through the web UI', 'BLOCKED', 'Supabase admin user provisioning was rejected.');
    } else if (message === 'password_sign_in_failed') {
      note('Real sign-in through the web UI', 'BLOCKED', 'Password sign-in did not return a session for provisioned test users.');
    } else if (!checks.some(c => c.name === 'Real sign-in through the web UI')) {
      note('Real sign-in through the web UI', 'BLOCKED', `Verification stopped before browser sign-in (${message || 'unknown error'}).`);
    }
  }

  for (const check of checks) console.log(`${check.result}: ${check.name} — ${check.detail}`);
  if (checks.some(c => c.result === 'FAIL')) process.exitCode = 1;
  else if (checks.some(c => c.result === 'BLOCKED')) process.exitCode = 2;
}
