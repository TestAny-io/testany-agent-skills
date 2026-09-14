import { test, expect } from '@playwright/test';

const productionUrl = `http://127.0.0.1:${Number(process.env.SKILLDOCK_E2E_PORT || 4821) + 1}`;

for (const language of ['zh', 'en', 'ja']) {
  test(`production opens local inventory without sandbox UI in ${language}`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    await page.addInitScript(language => {
      localStorage.setItem('skilldock.preferences.v1', JSON.stringify({ language, theme: 'dark', mode: 'sandbox' }));
      localStorage.setItem('skilldock.mode', 'sandbox');
    }, language);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${productionUrl}/?mode=sandbox`);
    await expect(page.locator('.skill-card').filter({ hasText: 'production-sentinel' })).toBeVisible();
    expect(new URL(requests[0]).pathname).toBe('/api/session');
    const inventories = requests.filter(url => new URL(url).pathname === '/api/state');
    expect(inventories.length).toBeGreaterThan(0);
    expect(inventories.every(url => new URL(url).searchParams.get('mode') === 'local')).toBe(true);
    expect(requests.every(url => new URL(url).searchParams.get('mode') !== 'sandbox')).toBe(true);
    await expect(page.locator('.mode-switch')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/Sandbox|演练|サンドボックス/);
    await expect(page.locator('body')).not.toContainText('design-review');
    const navigation = page.getByRole('navigation').getByRole('button');
    for (let i = 0; i < 5; i++) {
      await navigation.nth(i).click();
      await expect(page.locator('body')).not.toContainText(/Sandbox|演练|サンドボックス/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await navigation.nth(0).click();
    const install = { zh: '安装技能', en: 'Install skill', ja: 'スキルを追加' }[language]!;
    await page.getByRole('button', { name: install, exact: true }).click();
    await expect(page.getByRole('dialog')).not.toContainText(/Sandbox|演练|サンドボックス|Use .*example/);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: testInfo.outputPath(`production-${language}-390.png`), fullPage: true });
  });
}

for (const failure of ['unavailable', 'missing-mode', 'invalid-mode', 'missing-token']) {
  test(`bootstrap ${failure} blocks inventory and writes until retry succeeds`, async ({ page }) => {
    const inventories: string[] = [];
    const mutations: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/state') inventories.push(request.url());
      if (request.method() === 'POST') mutations.push(request.url());
    });
    await page.route('**/api/session', route => route.fulfill({
      status: failure === 'unavailable' ? 503 : 200,
      json: failure === 'unavailable' ? { error: { message: 'Test service unavailable' } }
        : failure === 'missing-token' ? { defaultMode: 'local' }
          : { token: 'fixture-token', ...(failure === 'invalid-mode' ? { defaultMode: 'unexpected' } : {}) },
    }));
    await page.goto(productionUrl);
    await expect(page.locator('.error-banner[role=alert]')).toBeVisible();
    expect(inventories).toEqual([]);
    expect(mutations).toEqual([]);
    await expect(page.getByRole('button', { name: '安装技能', exact: true })).toBeDisabled();
    await page.unroute('**/api/session');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.locator('.skill-card').filter({ hasText: 'production-sentinel' })).toBeVisible();
    expect(inventories.every(url => new URL(url).searchParams.get('mode') === 'local')).toBe(true);
    expect(mutations).toEqual([]);
  });
}
