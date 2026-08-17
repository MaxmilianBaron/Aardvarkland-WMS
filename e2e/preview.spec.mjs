import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const screenshotDir = 'artifacts/ui';

test.beforeAll(() => {
  mkdirSync(screenshotDir, { recursive: true });
});

test('desktop preview renders worker, manager and admin views', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle(/Aardvarkland WMS Product Preview/);
  await expect(page.locator('#workspace-title')).toBeVisible();
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await expect(page.locator('[data-role="worker"]')).toHaveClass(/is-active/);
  await page.screenshot({ path: `${screenshotDir}/01-wms-desktop-worker.png`, fullPage: true });

  await page.locator('[data-role="manager"]').click();
  await expect(page.locator('[data-role="manager"]')).toHaveClass(/is-active/);
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/02-wms-desktop-manager.png`, fullPage: true });

  await page.locator('[data-role="admin"]').click();
  await expect(page.locator('[data-role="admin"]')).toHaveClass(/is-active/);
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/03-wms-desktop-admin.png`, fullPage: true });

  expect(pageErrors).toEqual([]);
  await page.close();
});

test('mobile preview remains usable', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#workspace-title')).toBeVisible();
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/04-wms-mobile-worker.png` });

  expect(pageErrors).toEqual([]);
  await page.close();
});
