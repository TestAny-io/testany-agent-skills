import { test, expect } from '@playwright/test';
import path from 'node:path';

const productionUrl = `http://127.0.0.1:${Number(process.env.SKILLDOCK_E2E_PORT || 4821) + 1}`;
const labels = {
  zh: { switch: '切换项目', path: '项目目录（绝对路径）', apply: '切换并重新扫描' },
  en: { switch: 'Switch project', path: 'Project directory (absolute path)', apply: 'Switch and rescan' },
  ja: { switch: 'プロジェクトを切り替え', path: 'プロジェクトディレクトリ（絶対パス）', apply: '切り替えて再スキャン' },
};

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`project selection, invalid paths and scan results in ${language}/${theme}`, async ({ page, request }, testInfo) => {
    const original = (await (await request.get(productionUrl + '/api/state')).json()).paths.project;
    const alternate = path.join(path.dirname(original), 'alternate-project');
    await page.addInitScript(preferences => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(preferences)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 960 });
    await page.goto(productionUrl);
    const text = labels[language];
    try {
      await page.getByRole('combobox', { name: text.switch, exact: true }).selectOption('browse');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(original);
      await dialog.locator('summary').click();
      const input = dialog.getByLabel(text.path);
      await input.fill(path.join(alternate, 'missing'));
      await dialog.getByRole('button', { name: text.apply }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      expect((await (await request.get(productionUrl + '/api/health')).json()).project).toBe(original);
      await input.fill(alternate);
      await page.screenshot({ path: testInfo.outputPath(`project-dialog-${language}-${theme}.png`), fullPage: true });
      await dialog.getByRole('button', { name: text.apply }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: text.switch, exact: true })).toHaveValue(alternate);
      await expect(page.locator('.skill-card').filter({ hasText: 'project-switch-sentinel' })).toBeVisible();
      await expect(page.locator('.skill-card').filter({ hasText: 'production-sentinel' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('combobox', { name: text.switch, exact: true })).toHaveValue(alternate);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`project-selected-${language}-${theme}.png`), fullPage: true });
    } finally {
      const session = await (await request.get(productionUrl + '/api/session')).json();
      await request.post(productionUrl + '/api/actions', { headers: { 'X-SkillDock-Token': session.token }, data: { mode: 'local', action: 'project.select', projectDir: original } });
    }
  });
}
