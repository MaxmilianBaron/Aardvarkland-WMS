import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const screenshotDir = 'artifacts/ui';

test.beforeAll(() => mkdirSync(screenshotDir, { recursive: true }));
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function signIn(page, role = 'worker') {
  await page.locator('#demo-login-name').selectOption(role);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#demo-login')).toBeHidden();
}

async function assertSourceLoginGeometry(page) {
  const card = page.locator('.login-card');
  const visual = page.locator('.login-card__visual');
  const form = page.locator('.login-form');
  const logo = page.locator('.login-logo--image img');

  await expect(card).toBeVisible();
  await expect(card).toHaveCSS('display', 'grid');
  await expect(card).toHaveCSS('border-radius', '12px');
  await expect(card).toHaveCSS('min-height', '620px');

  const cardBox = await card.boundingBox();
  const visualBox = await visual.boundingBox();
  const formBox = await form.boundingBox();
  const logoBox = await logo.boundingBox();

  expect(Math.round(cardBox?.width ?? 0)).toBe(1000);
  expect(Math.round(cardBox?.height ?? 0)).toBeGreaterThanOrEqual(620);
  expect(Math.round(logoBox?.width ?? 0)).toBe(98);
  expect(Math.round(logoBox?.height ?? 0)).toBe(98);
  expect(Math.abs((visualBox?.width ?? 0) / (formBox?.width ?? 1) - (1 / 0.95))).toBeLessThan(0.03);

  await expect(page.locator('.login-brand__name')).toHaveText('Aardvarkland');
  await expect(page.locator('.login-brand__tagline')).toHaveText('warehouse management system');
  await expect(page.locator('#demo-login-name option')).toHaveCount(3);
  await expect(page.locator('#demo-password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#demo-password')).toHaveValue('demo');
  await expect(page.locator('#demo-language-toggle .flag-icon svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#demo-theme-toggle svg')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mobile preview' })).toHaveAttribute('href', './mobile-preview.html');
}

async function assertDesktopShellParity(page, accountName, sectionLabels) {
  await expect(page.locator('.legacy-brand')).toBeHidden();
  await expect(page.locator('.legacy-role-switch')).toBeHidden();
  await expect(page.locator('.sidebar__account')).toBeVisible();
  await expect(page.locator('.sidebar__account')).toContainText(accountName);
  await expect(page.locator('.topbar-brand')).toBeVisible();
  await expect(page.locator('.topbar-brand__copy strong')).toHaveText('Aardvarkland WMS');
  await expect(page.locator('.parity-route-meta')).toBeHidden();
  await expect(page.locator('.parity-sync-control')).toBeHidden();
  await expect(page.locator('.nav__section')).toHaveCount(sectionLabels.length);
  for (const label of sectionLabels) {
    await expect(page.locator('.nav__section-label').filter({ hasText: label })).toBeVisible();
  }
  await expect(page.locator('.nav__item').first()).toBeVisible();
  await expect(page.locator('.nav__item .nav__icon').first()).toBeVisible();
  await expect(page.locator('.mobile-tabbar')).toBeHidden();

  const shellColumns = await page.locator('.shell').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(shellColumns.split(' ').map((value) => Math.round(Number.parseFloat(value)))[0]).toBe(288);
  await expect(page.locator('.content')).toHaveCSS('padding-left', '32px');
  await expect(page.locator('.app-status-strip')).toHaveCSS('border-radius', '6px');
}

test('desktop login and all role shells match the Server source structure', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/Aardvarkland WMS Product Preview/);
  await assertSourceLoginGeometry(page);
  await page.screenshot({ path: `${screenshotDir}/01-server-source-login.png`, fullPage: true });

  await signIn(page, 'admin');
  await expect(page.locator('[data-role="admin"]')).toHaveClass(/is-active/);
  await assertDesktopShellParity(page, 'System admin', ['SYSTEM', 'CONNECTIONS']);
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/02-server-source-admin.png`, fullPage: true });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#demo-login')).toBeVisible();
  await signIn(page, 'manager');
  await expect(page.locator('[data-role="manager"]')).toHaveClass(/is-active/);
  await assertDesktopShellParity(page, 'Warehouse manager', ['OPERATIONS', 'WAREHOUSE', 'SUPPORT']);
  await page.screenshot({ path: `${screenshotDir}/03-server-source-manager.png`, fullPage: true });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'worker');
  await expect(page.locator('[data-role="worker"]')).toHaveClass(/is-active/);
  await assertDesktopShellParity(page, 'Warehouse worker', ['WORK', 'SUPPORT']);
  await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
  await expect(page.locator('#api-status')).toHaveText('API ready');
  await page.screenshot({ path: `${screenshotDir}/04-server-source-worker.png`, fullPage: true });

  expect(pageErrors).toEqual([]);
});

test('mobile shell uses the five-slot tabbar with a More drawer', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#demo-login')).toBeVisible();
  await expect(page.locator('.login-card')).toHaveCSS('grid-template-columns', /.+/);
  await page.screenshot({ path: `${screenshotDir}/05-server-mobile-login.png` });

  await signIn(page, 'worker');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.mobile-tabbar')).toBeVisible();
  await expect(page.locator('.mobile-tabbar > .mobile-tabbar__button')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator('.mobile-tabbar__more-toggle')).toContainText('More');
  await expect(page.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/06-server-mobile-worker.png` });

  await page.locator('.mobile-tabbar__more-toggle').click();
  await expect(page.locator('.mobile-tabbar__more')).toBeVisible();
  await expect(page.locator('.mobile-tabbar__more .mobile-tabbar__button')).toHaveCount(3);
  await page.screenshot({ path: `${screenshotDir}/07-server-mobile-more.png` });

  await page.locator('.mobile-tabbar__more .mobile-tabbar__button').first().click();
  await expect(page.locator('.mobile-tabbar__more')).toBeHidden();
  await expect(page.locator('#view-root')).not.toBeEmpty();

  expect(pageErrors).toEqual([]);
});

test('dedicated 411x868 phone frame remains available and runs the same source-parity UI', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light' });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}mobile-preview.html`, { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/mobile preview/);
  await expect(page.getByText('Mobile preview')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open standalone' })).toBeVisible();

  const phoneBox = await page.locator('.phone').boundingBox();
  expect(Math.round(phoneBox?.width ?? 0)).toBe(411);
  expect(Math.round(phoneBox?.height ?? 0)).toBe(868);

  const app = page.frameLocator('iframe[title="Aardvarkland WMS mobile preview"]');
  await expect(app.locator('#demo-login')).toBeVisible({ timeout: 15_000 });
  await expect(app.locator('#demo-mobile-link')).toBeHidden();
  await app.locator('#demo-login-name').selectOption('manager');
  await app.getByRole('button', { name: 'Sign in' }).click();
  await expect(app.locator('[data-role="manager"]')).toHaveClass(/is-active/, { timeout: 15_000 });
  await expect(app.locator('.mobile-tabbar')).toBeVisible();
  await expect(app.locator('#view-root')).not.toBeEmpty();
  await page.screenshot({ path: `${screenshotDir}/08-server-phone-frame-manager.png`, fullPage: true });

  expect(pageErrors).toEqual([]);
});
