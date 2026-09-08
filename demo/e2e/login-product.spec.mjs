import {mkdirSync} from 'node:fs';
import {test,expect} from '@playwright/test';
const url=process.env.PRODUCT_UI_URL || 'http://127.0.0.1:4000/';
test.use({serviceWorkers:'block',viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
test.beforeAll(()=>mkdirSync('artifacts/ui',{recursive:true}));

test('real product login preserves layout and uses username/password semantics',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('aardvarkland-ui-language','en'));
  await page.goto(url);
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await expect(page.locator('input[autocomplete="username"]')).toHaveAttribute('autocapitalize','none');
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveAttribute('maxlength','128');
  await page.screenshot({path:'artifacts/ui/09-real-product-login.png',fullPage:true});
  let requests=0,release;
  await page.route('**/auth/login',async route=>{requests++;expect(new URL(route.request().url()).origin).toBe(new URL(url).origin);await new Promise(r=>release=r);await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Invalid credentials'})});});
  await page.locator('input[autocomplete="username"]').fill('warehouse.worker');
  await page.locator('input[autocomplete="current-password"]').fill('Demo-test-only-42!');
  await page.locator('.login-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await expect.poll(()=>requests).toBe(1);
  await expect(page.locator('input[autocomplete="current-password"]')).toBeDisabled();
  release();await expect(page.locator('input[autocomplete="current-password"]')).toBeEnabled();
  expect(requests).toBe(1);expect(errors).toEqual([]);
});

test('real product MFA field accepts only six digits and fits the mobile UI',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('aardvarkland-ui-language','en'));
  await page.route('**/auth/login',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({requiresMfa:true})}));
  await page.goto(url);await page.locator('input[autocomplete="username"]').fill('warehouse.worker');
  await page.locator('input[autocomplete="current-password"]').fill('Demo-test-only-42!');
  await page.locator('.login-form button[type="submit"]').click();
  const mfa=page.locator('input[autocomplete="one-time-code"]');await expect(mfa).toBeVisible();
  await expect(mfa).toHaveAttribute('maxlength','6');await expect(mfa).toHaveAttribute('pattern','[0-9]{6}');
  await mfa.fill('123456');await expect(mfa).toHaveValue('123456');
  await page.screenshot({path:'artifacts/ui/10-real-product-mfa-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
