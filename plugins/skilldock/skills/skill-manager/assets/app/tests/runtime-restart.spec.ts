import { test, expect } from '@playwright/test';

const productionUrl = `http://127.0.0.1:${Number(process.env.SKILLDOCK_E2E_PORT || 4821) + 1}`;
for (const language of ['zh', 'en', 'ja'] as const) {
  test(`restart reconnects and preserves navigation and preferences in ${language}`, async ({ page }, testInfo) => {
    let instanceId = 'before-restart'; let status = 'ready'; let offline = false;
    let navigations = 0; let sessions = 0; const writes: string[] = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/session') sessions++;
      if (request.method() === 'POST') writes.push(request.url());
    });
    await page.addInitScript(language => localStorage.setItem('skilldock.preferences.v1', JSON.stringify({ language, theme: 'dark' })), language);
    await page.route('**/api/health', route => offline ? route.abort() : route.fulfill({ json: { app: 'skilldock', instanceId, restart: { id: 'upgrade', status } } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(productionUrl);
    await expect(page.locator('.skill-card').filter({ hasText: 'production-sentinel' })).toBeVisible();
    await page.locator('.nav-item').nth(3).click();
    const title = await page.locator('h1').innerText();
    status = 'preparing';
    const preparing = { zh: '正在准备新版 SkillDock…', en: 'Preparing the new version of SkillDock…', ja: '新しいバージョンの SkillDock を準備中…' }[language];
    await expect(page.getByRole('status').filter({ hasText: preparing })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`restart-${language}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    offline = true;
    const restarting = { zh: '正在重启，界面将自动恢复…', en: 'Restarting. This page will reconnect automatically…', ja: '再起動中です。画面は自動的に再接続されます…' }[language];
    await expect(page.getByRole('status').filter({ hasText: restarting })).toBeVisible();
    instanceId = 'after-restart'; status = 'ready'; offline = false;
    await expect.poll(() => navigations).toBe(2);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('.runtime-notice')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('skilldock.preferences.v1')!).language)).toBe(language);
    expect(sessions).toBeGreaterThanOrEqual(2); expect(writes).toEqual([]);
  });
}

test('a failed restart remains visible while the old app is usable', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { app: 'skilldock', instanceId: 'old-restored', restart: { id: 'failed-upgrade', status: 'failed', message: 'fixture startup failed; previous runtime restored', restored: true } } }));
  await page.goto(productionUrl);
  await expect(page.locator('.runtime-notice-error')).toContainText('新版未能启动');
  await expect(page.locator('.skill-card').filter({ hasText: 'production-sentinel' })).toBeVisible();
  await page.locator('.nav-item').nth(2).click();
  await expect(page.locator('h1')).toContainText('市场');
});

test('reconnection before the first health response still loads a fresh page', async ({ page }) => {
  let offline = true; let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.route('**/api/health', route => offline ? route.abort() : route.fulfill({ json: { app: 'skilldock', instanceId: 'new-instance' } }));
  await page.goto(productionUrl);
  await expect(page.locator('.runtime-notice')).toContainText('连接已中断');
  offline = false;
  await expect.poll(() => navigations).toBe(2);
  await expect(page.locator('.runtime-notice')).toHaveCount(0);
});
