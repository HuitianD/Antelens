import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const apiOrigin = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:4002';
const origin = process.env.E2E_WEB_ORIGIN || 'http://127.0.0.1:3002';

test.beforeEach(async ({ request }) => {
  const health = await (await request.get(`${apiOrigin}/health/live`)).json();
  expect(health.mode).toBe('demo');
  expect((await request.post(`${apiOrigin}/v1/demo/reset`, { headers: { Origin: origin } })).ok()).toBeTruthy();
  await mkdir('docs/screenshots', { recursive: true });
});

test('cited message/page comparison, accessible screenshot zoom and isolated demo controls', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('.case-row')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Add demo reply', exact: true })).not.toBeVisible();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-overview-desktop.png', fullPage: true });
  await page.locator('.case-row', { hasText: '24 Maple Street' }).click();
  const id = new URL(page.url()).searchParams.get('case');
  const detail = (await (await request.get(`${apiOrigin}/v1/cases/${id}`)).json()).data;
  const cited = detail.evidence.filter((e: any) => detail.currentAssessment.finding.evidenceIds.includes(e.id));
  await expect(page.locator('.message-column blockquote').first()).toHaveText(cited.find((e: any) => e.kind === 'message_excerpt').excerpt);
  await expect(page.locator('#comparison .page-column blockquote')).toHaveText(cited.find((e: any) => e.kind === 'page_excerpt').excerpt);
  await expect(page.getByRole('heading', { name: 'Message says' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page shows' })).toBeVisible();
  const image = page.locator('#comparison .screenshot-preview img');
  await expect(image).toHaveJSProperty('naturalWidth', 2000);
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-evidence-desktop.png' });
  await page.getByRole('button', { name: 'Enlarge screenshot', exact: true }).click();
  const zoom = page.getByRole('dialog', { name: 'Demo screenshot', exact: true });
  await expect(zoom).toBeVisible();
  await expect.poll(async()=>zoom.locator('img').evaluate(img=>{const image=img.getBoundingClientRect(),view=img.parentElement!.getBoundingClientRect();return image.width>100&&image.width<=view.width&&image.height<=view.height})).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'docs/screenshots/ui-screenshot-fit.png'});
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Screenshot zoom' })).toContainText('150%');
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-screenshot-zoom.png' });
  await page.keyboard.press('Escape'); await expect(zoom).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Case detail', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enlarge screenshot', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('mobile evidence fits the viewport and a failed screenshot can be reloaded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/demo/rental-checkout.png', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/'); await expect(page.locator('.case-row')).toHaveCount(5);
  await page.locator('.case-row', { hasText: '24 Maple Street' }).click();
  await expect(page.getByRole('alert', { name: 'Screenshot error', exact: true })).toContainText('Screenshot unavailable');
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-screenshot-error-mobile.png' });
  await page.unroute('**/demo/rental-checkout.png');
  await page.getByRole('button', { name: 'Reload image', exact: true }).click();
  await expect(page.locator('#comparison .screenshot-preview img')).toHaveJSProperty('naturalWidth', 2000);
  expect(await page.locator('.detail-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-page-evidence-mobile.png' });
  await page.locator('.detail-scroll').evaluate(el => {el.scrollTop=0;});
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-evidence-mobile.png' });
  await page.getByRole('button', { name: 'Enlarge screenshot', exact: true }).click();
  const zoom = page.getByRole('dialog', { name: 'Demo screenshot', exact: true });
  await expect(zoom).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await zoom.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'docs/screenshots/ui-screenshot-zoom-mobile.png'});
  await page.getByRole('button', { name: 'Close screenshot', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Case detail', exact: true })).toBeVisible();
});

test('pending investigation shows saved events without invented progress stages', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('.case-row')).toHaveCount(5);
  const receipt = await request.post(`${apiOrigin}/v1/demo/events`, {headers:{Origin:origin},data:{scenario:'SC-05'}});
  expect(receipt.status()).toBe(202);
  await expect(page.locator('.case-row')).toHaveCount(6);
  await page.locator('.case-row.unassessed').filter({hasNotText:'student account'}).click();
  await expect(page.locator('.current-stage')).toBeVisible();
  await expect(page.getByRole('region',{name:'Case detail'}).getByText('No assessment yet',{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'docs/screenshots/ui-progress-desktop.png'});
});

test('limited investigation has recorded stages and no favorable judgment', async ({ page }) => {
  await page.goto('/');
  await page.locator('.case-row', { hasText: 'student account' }).click();
  const dialog = page.getByRole('region', { name: 'Case detail', exact: true });
  await expect(dialog.getByText('No assessment yet', { exact: true })).toBeVisible();
  await dialog.locator('#comparison .inspection-details > summary').click();
  await expect(dialog.getByRole('heading', { name: 'What could not be checked' })).toBeVisible();
  await expect(dialog.getByText('No issues found', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Recheck request', exact: true })).toBeEnabled();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-limited-desktop.png' });
});

test('list rows name the original message, ordinary mail stays in No action needed, and the primary action reaches its evidence', async ({ page, request }) => {
  await page.goto('/');
  const cases = (await (await request.get(`${apiOrigin}/v1/cases?limit=100`)).json()).data.items;
  const rental = cases.find((c: any) => c.currentAssessment?.nextAction.label === 'Review charges');
  const row = page.locator('.case-row', { hasText: '24 Maple Street' });
  await expect(row).toContainText('Maple Homes');
  await expect(row.locator('.row-finding')).toHaveText(rental.currentAssessment.finding.headline);
  await expect(row.locator('.row-time-label')).toHaveText('Received');
  await expect(row.locator('.badge')).toHaveText('Confirm first');
  await page.getByRole('group', { name: 'Overview groups' }).getByRole('button', { name: /^No action needed/ }).click();
  await expect(page.locator('.message-row')).toHaveCount(1);
  await expect(page.locator('.case-row')).toHaveCount(1);
  await expect(page.locator('.case-row .badge')).toHaveText('No issues found');
  await page.getByRole('group', { name: 'Overview groups' }).getByRole('button', { name: /^All items/ }).click();
  await row.click();
  const detail = page.getByRole('region', { name: 'Case detail', exact: true });
  await expect(detail.locator('.primary-btn')).toHaveCount(1);
  await expect(detail.getByRole('heading', { name: 'Original email' })).toBeVisible();
  await detail.getByRole('button', { name: 'Review charges', exact: true }).click();
  await expect(page.locator(`#evidence-${rental.currentAssessment.nextAction.evidenceId}`)).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(row).toBeFocused();
});
