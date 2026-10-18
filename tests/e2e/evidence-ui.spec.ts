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
  await page.goto('/'); await expect(page.locator('.case-card')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Add demo reply', exact: true })).not.toBeVisible();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-overview-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Review charges', exact: true }).click();
  const id = new URL(page.url()).searchParams.get('case');
  const detail = (await (await request.get(`${apiOrigin}/v1/cases/${id}`)).json()).data;
  const cited = detail.evidence.filter((e: any) => detail.currentAssessment.finding.evidenceIds.includes(e.id));
  await expect(page.locator('.message-column blockquote').first()).toHaveText(cited.find((e: any) => e.kind === 'message_excerpt').excerpt);
  await expect(page.locator('.page-column blockquote')).toHaveText(cited.find((e: any) => e.kind === 'page_excerpt').excerpt);
  await expect(page.getByRole('heading', { name: 'Message says' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page shows' })).toBeVisible();
  const image = page.locator('.screenshot-preview img');
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
  await expect(page.getByRole('dialog', { name: 'Case detail', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enlarge screenshot', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('mobile evidence fits the viewport and a failed screenshot can be reloaded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/demo/rental-checkout.png', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/'); await expect(page.locator('.case-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Review charges', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Screenshot error', exact: true })).toContainText('Screenshot unavailable');
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-screenshot-error-mobile.png' });
  await page.unroute('**/demo/rental-checkout.png');
  await page.getByRole('button', { name: 'Reload image', exact: true }).click();
  await expect(page.locator('.screenshot-preview img')).toHaveJSProperty('naturalWidth', 2000);
  expect(await page.locator('.drawer').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-page-evidence-mobile.png' });
  await page.locator('.drawer').evaluate(el => {el.scrollTop=0;});
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-evidence-mobile.png' });
  await page.getByRole('button', { name: 'Enlarge screenshot', exact: true }).click();
  const zoom = page.getByRole('dialog', { name: 'Demo screenshot', exact: true });
  await expect(zoom).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await zoom.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'docs/screenshots/ui-screenshot-zoom-mobile.png'});
  await page.getByRole('button', { name: 'Close screenshot', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Case detail', exact: true })).toBeVisible();
});

test('pending investigation shows saved events without invented progress stages', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('.case-card')).toHaveCount(5);
  const receipt = await request.post(`${apiOrigin}/v1/demo/events`, {headers:{Origin:origin},data:{scenario:'SC-05'}});
  expect(receipt.status()).toBe(202);
  await expect(page.locator('.case-card')).toHaveCount(6);
  await page.getByRole('button',{name:'View investigation',exact:true}).click();
  await expect(page.locator('.current-stage')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('No assessment yet',{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({animations:'disabled',path:'docs/screenshots/ui-progress-desktop.png'});
});

test('limited investigation has recorded stages and no favorable judgment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review the limitation', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Case detail', exact: true });
  await expect(dialog.getByText('No assessment yet', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'What could not be checked' })).toBeVisible();
  await expect(dialog.getByText('No issues found', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Recheck request', exact: true })).toBeEnabled();
  await page.screenshot({animations:'disabled', path: 'docs/screenshots/ui-limited-desktop.png' });
});
