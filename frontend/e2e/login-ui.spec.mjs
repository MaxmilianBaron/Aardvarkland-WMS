import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const UI_DIR = 'artifacts/ui';

async function seedUi(page, theme = 'light', language = 'cs') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ selectedTheme, selectedLanguage }) => {
    localStorage.setItem('aardvarkland-ui-theme', selectedTheme);
    localStorage.setItem('aardvarkland-ui-language', selectedLanguage);
    sessionStorage.clear();
  }, { selectedTheme: theme, selectedLanguage: language });
}

async function openLogin(page) {
  await page.goto('http://127.0.0.1:4000', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.login-card')).toBeVisible({ timeout: 10_000 });
}

async function shot(page, name, fullPage = true) {
  await mkdir(UI_DIR, { recursive: true });
  await page.screenshot({ path: `${UI_DIR}/${name}`, fullPage });
}

async function stubTelemetry(page) {
  await page.route('http://localhost:4001/api/observability/frontend-events', (route) => route.fulfill({ status: 204 }));
}

test.describe('WMS Server login visual smoke', () => {
  test('desktop login and invalid credentials are captured', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seedUi(page);
    await stubTelemetry(page);
    await page.route('http://localhost:4001/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }),
      });
    });
    await openLogin(page);

    await expect(page.getByRole('heading', { name: 'Přihlášení' })).toBeVisible();
    await shot(page, '01-server-desktop-login.png');

    await page.getByLabel('Přihlašovací jméno').fill('tester');
    await page.getByLabel('Heslo').fill('wrong-password');
    await page.getByRole('button', { name: 'Přihlásit se' }).click();
    await expect(page.getByRole('alert')).toContainText('Špatné přihlašovací jméno nebo heslo.');
    await shot(page, '02-server-desktop-login-error.png');
  });

  test('MFA challenge is captured without a live backend', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seedUi(page);
    await stubTelemetry(page);
    await page.route('http://localhost:4001/api/auth/login', async (route) => {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'MFA_CODE_REQUIRED', message: 'MFA code required' } }),
      });
    });
    await openLogin(page);

    await page.getByLabel('Přihlašovací jméno').fill('warehouse.manager');
    await page.getByLabel('Heslo').fill('example-password');
    await page.getByRole('button', { name: 'Přihlásit se' }).click();
    await expect(page.getByLabel('MFA kód')).toBeVisible();
    await expect(page.getByText('Zadejte 6místný kód z ověřovací aplikace.')).toBeVisible();
    await shot(page, '03-server-desktop-mfa.png');
  });

  test('mobile dark login is captured', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedUi(page, 'dark');
    await openLogin(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await shot(page, '04-server-mobile-dark-login.png', false);
  });
});
