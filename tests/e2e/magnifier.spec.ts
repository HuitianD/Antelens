import { test, expect } from '@playwright/test';

test('magnifier fits the sidebar, respects reduced motion, and disappears on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const accent = page.locator('.sidebar-accent-stage.ready');
  await expect(accent).toBeVisible();
  expect(await accent.evaluate(el => {
    const box = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect();
    return box.left >= parent.left && box.right <= parent.right && box.top >= parent.top && box.bottom <= parent.bottom;
  })).toBeTruthy();
  await expect(page.locator('.sidebar-accent')).toHaveAttribute('aria-hidden', 'true');
  // Compare actual rendered pixels after pointer movement: reduced motion must hold a still pose.
  const still = await accent.screenshot();
  await page.mouse.move(20, 450);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await accent.screenshot()).toEqual(still);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar-accent')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('unavailable WebGL renders the SVG fallback and leaves navigation usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
      if (kind.startsWith('webgl') || kind === 'experimental-webgl') return null;
      return original.call(this, kind as any, ...args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.sidebar-accent .accent-static')).toBeVisible();
  await expect(page.locator('.sidebar-accent canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'All messages', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All messages', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All messages', exact: true })).toHaveAttribute('aria-current', 'page');
});
