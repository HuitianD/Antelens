import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { CaseDetailSchema, type CaseDetail } from '../../packages/contracts/src/index';

const apiOrigin = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:4002';
const origin = process.env.E2E_WEB_ORIGIN || 'http://127.0.0.1:3002';
// Presentation fixtures are synthetic/simulated. These checks make no provider claims.
async function fixture(request: APIRequestContext): Promise<CaseDetail> {
  expect((await (await request.get(`${apiOrigin}/health/live`)).json()).mode).toBe('demo');
  expect((await request.post(`${apiOrigin}/v1/demo/reset`, { headers: { Origin: origin } })).ok()).toBeTruthy();
  const cases = (await (await request.get(`${apiOrigin}/v1/cases?limit=100`)).json()).data.items;
  const rental = cases.find((c: any) => c.currentAssessment?.nextAction.label === 'Review charges');
  return CaseDetailSchema.parse((await (await request.get(`${apiOrigin}/v1/cases/${rental.id}`)).json()).data);
}
async function present(page: Page, detail: CaseDetail, history = [detail.currentAssessment!]) {
  detail.case.currentAssessment = detail.currentAssessment;
  CaseDetailSchema.parse(detail);
  const envelope = (data: unknown) => ({ data, meta: { requestId: 'labeled-evidence-presentation-fixture', schemaVersion: '1' } });
  await page.route(`${apiOrigin}/v1/cases/${detail.case.id}`, route => route.fulfill({ json: envelope(detail) }));
  await page.route(`${apiOrigin}/v1/cases/${detail.case.id}/assessments`, route => route.fulfill({ json: envelope({ items: history, nextCursor: null }) }));
  await page.goto(`/?case=${detail.case.id}`);
  await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Case detail', exact: true }).getByText('Demo data', { exact: true })).toBeVisible();
}
function emailOnly(detail: CaseDetail) {
  detail.evidence = detail.evidence.filter(e => e.kind === 'message_excerpt');
  detail.currentAssessment!.finding.evidenceIds = detail.evidence.map(e => e.id);
  detail.currentAssessment!.nextAction = { kind: 'open_source', label: 'Review email', sourceEventId: detail.sources[0]!.id };
}

test('email-only evidence preserves sentence breaks and never renders an empty page comparison', async ({ page, request }) => {
  const detail = await fixture(request); emailOnly(detail);
  const text = 'Please pay the $40 application fee.\n\nConfirm the payment instructions first.';
  detail.evidence[0]!.excerpt = text;
  await present(page, detail);
  await expect(page.getByRole('heading', { name: 'Original email', exact: true })).toBeVisible();
  await expect(page.locator('#comparison').getByRole('heading', { name: 'Email evidence', exact: true })).toBeVisible();
  await expect(page.locator('#comparison .evidence-scope')).toHaveText('Email only');
  await expect(page.locator('#comparison blockquote')).toHaveText(text);
  await expect(page.locator('#comparison blockquote')).toHaveCSS('white-space', 'pre-wrap');
  await expect(page.locator('#comparison .page-column')).toHaveCount(0);
  await expect(page.getByText('Linked page not checked', { exact: true })).toHaveCount(0);
});

test('only saved link metadata produces the uninspected hostname label', async ({ page, request }) => {
  const detail = await fixture(request); emailOnly(detail);
  detail.sourceReferences = [{ sourceEventId: detail.sources[0]!.id, originalUrl: null, links: ['https://rental.example.test/apply'] }];
  await present(page, detail);
  await expect(page.locator('#comparison .linked-page-status')).toHaveText('Linked page not checkedrental.example.test');
  await expect(page.locator('#comparison .linked-page-status a')).toHaveAttribute('href', 'https://rental.example.test/apply');
  await expect(page.locator('#comparison .page-column')).toHaveCount(0);
});

test('screenshot-only browser evidence is visible, and a loading failure has its own retry state', async ({ page, request }) => {
  const detail = await fixture(request), pageRecord = detail.evidence.find(e => e.kind === 'page_excerpt')!;
  detail.case.sourceKinds = ['browser']; detail.sources = detail.sources.map(s => ({ ...s, kind: 'browser' as const, title: 'Controlled browser presentation fixture', senderLabel: null }));
  const screenshot = { ...pageRecord, id: randomUUID(), kind: 'screenshot' as const, artifactId: randomUUID(), excerpt: null, inspection: { method: 'captured_page_daytona' as const, label: 'Captured page inspected in Daytona' as const, captureId: randomUUID(), bundleHash: 'a'.repeat(64), sandboxId: 'presentation-fixture', capturedAt: pageRecord.observedAt, inspectedAt: pageRecord.observedAt, networkRequests: 0 as const } };
  detail.evidence = [screenshot]; detail.currentAssessment!.finding.evidenceIds = [screenshot.id];
  detail.currentAssessment!.nextAction = { kind: 'review_evidence', label: 'Review screenshot', evidenceId: screenshot.id };
  let unavailable = true;
  await page.route(`${apiOrigin}/v1/evidence/${screenshot.id}`, route => unavailable ? route.fulfill({ status: 503, body: '{}' }) : route.fulfill({ json: { data: { evidence: screenshot, artifactUrl: `${origin}/demo/rental-checkout.png`, expiresAt: null }, meta: { requestId: 'fixture-image', schemaVersion: '1' } } }));
  await present(page, detail);
  await expect(page.getByRole('heading', { name: 'Original message', exact: true })).toHaveCount(0);
  await expect(page.locator('#comparison .message-column')).toHaveCount(0);
  await expect(page.locator('#comparison .evidence-scope')).toHaveText('Offline page inspection');
  await expect(page.getByRole('alert', { name: 'Screenshot error', exact: true })).toBeVisible();
  await expect(page.locator('#comparison')).not.toContainText('No text excerpt');
  await expect(page.locator('#comparison')).not.toContainText('No saved page evidence');
  unavailable = false; await page.getByRole('button', { name: 'Reload image', exact: true }).click();
  await expect(page.locator('#comparison .screenshot-preview img')).toHaveJSProperty('naturalWidth', 2000);
  await expect(page.getByRole('alert', { name: 'Screenshot error', exact: true })).toHaveCount(0);
});

test('historical comparison uses the matching capture, preserves its fee, and stacks at a narrow width', async ({ page, request }) => {
  const detail = await fixture(request), current = detail.currentAssessment!, pageRecord = detail.evidence.find(e => e.kind === 'page_excerpt')!;
  current.version = 2; pageRecord.excerpt = 'Current membership: $39 per month.';
  const oldRun = randomUUID(), oldPage = { ...pageRecord, id: randomUUID(), runId: oldRun, excerpt: 'Earlier membership: $29 per month.', inspection: { method: 'captured_page_daytona' as const, label: 'Captured page inspected in Daytona' as const, captureId: randomUUID(), bundleHash: 'b'.repeat(64), sandboxId: 'history-presentation-fixture', capturedAt: pageRecord.observedAt, inspectedAt: pageRecord.observedAt, networkRequests: 0 as const } };
  const oldImage = { ...oldPage, id: randomUUID(), kind: 'screenshot' as const, artifactId: randomUUID(), excerpt: null };
  const oldEmail = { ...detail.evidence.find(e => e.kind === 'message_excerpt')!, id: randomUUID(), runId: oldRun };
  const historical = { ...current, id: randomUUID(), runId: oldRun, version: 1, finding: { ...current.finding, evidenceIds: [oldEmail.id, oldImage.id] }, nextAction: { kind: 'review_evidence' as const, label: 'Review screenshot', evidenceId: oldImage.id } };
  detail.evidence.push(oldPage, oldImage, oldEmail);
  await page.route(`${apiOrigin}/v1/evidence/${oldImage.id}`, route => route.fulfill({ json: { data: { evidence: oldImage, artifactUrl: `${origin}/demo/rental-checkout.png`, expiresAt: null }, meta: { requestId: 'fixture-history-image', schemaVersion: '1' } } }));
  await page.setViewportSize({ width: 390, height: 844 }); await present(page, detail, [current, historical]);
  const history = page.locator('.history-item').filter({ hasText: 'Version 1' });
  await history.locator(':scope > summary').click(); await history.locator('.history-evidence > summary').click();
  await expect(history.locator('.page-column blockquote')).toHaveText('Earlier membership: $29 per month.');
  await expect(page.locator('#comparison .page-column blockquote')).toHaveText('Current membership: $39 per month.');
  await expect(history.locator('.screenshot-preview img')).toHaveJSProperty('naturalWidth', 2000);
  expect(await history.locator('.evidence-comparison').evaluate(el => { const columns = el.children; return columns[1]!.getBoundingClientRect().top >= columns[0]!.getBoundingClientRect().bottom; })).toBeTruthy();
  expect(await page.locator('.detail-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({ path: 'docs/screenshots/evidence-sources-history-mobile.png', animations: 'disabled' });
});

test('missing cited records are identified as unavailable rather than implying an email-only scope', async ({ page, request }) => {
  const detail = await fixture(request);
  detail.evidence = detail.evidence.filter(e => e.kind === 'message_excerpt');
  await present(page, detail);
  await expect(page.locator('#comparison').getByRole('status')).toHaveText('Some evidence cited in this version is unavailable.');
  await expect(page.locator('#comparison .evidence-scope')).toHaveCount(0);
  await expect(page.getByRole('alert', { name: 'Screenshot error', exact: true })).toHaveCount(0);
});
