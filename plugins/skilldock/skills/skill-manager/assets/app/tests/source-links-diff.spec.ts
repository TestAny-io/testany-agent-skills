import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const productionUrl = `http://127.0.0.1:${Number(process.env.SKILLDOCK_E2E_PORT || 4821) + 1}`;
const sourceUrl = 'https://github.com/TestAny-io/testany-agent-skills/tree/main/plugins/testany-llm/skills/prompt-optimizer';
const labels = {
  zh: { updates: '更新', connect: '关联更新来源', type: '来源类型', url: 'Git 仓库或目录链接', ref: '分支或标签（可选）', compare: '比较来源', confirm: '确认关联', check: '检查更新', diff: '查看代码差异', apply: '确认更新' },
  en: { updates: 'Updates', connect: 'Connect update source', type: 'Source type', url: 'Git repository or directory URL', ref: 'Branch or tag (optional)', compare: 'Compare source', confirm: 'Confirm connection', check: 'Check for updates', diff: 'View code diff', apply: 'Apply update' },
  ja: { updates: '更新', connect: '更新元を関連付け', type: '配布元の種類', url: 'Git リポジトリまたはディレクトリの URL', ref: 'ブランチまたはタグ（任意）', compare: '取得元を比較', confirm: '関連付けを確定', check: '更新を確認', diff: 'コードの差分を表示', apply: '更新を適用' },
};

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`one GitHub URL connects and shows safe lazy diff in ${language}/${theme}`, async ({ page, request }, testInfo) => {
    const state = await (await request.get(productionUrl + '/api/state')).json();
    expect(state.paths.skills).toContain('skilldock-browser-');
    const name = `source-diff-${language}-${theme}`; const directory = path.join(state.paths.skills, name);
    await fs.mkdir(directory, { recursive: true });
    const oldContent = `---\nname: ${name}\ndescription: Existing skill fixture.\n---\n# Old version\nOld line\n`;
    await fs.writeFile(path.join(directory, 'SKILL.md'), oldContent);
    await fs.writeFile(path.join(directory, 'removed.txt'), 'Old supporting file\n');
    const text = labels[language];
    await page.addInitScript(preferences => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(preferences)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 1000 });
    let diffRequests = 0;
    page.on('request', request => { if (request.url().endsWith('/api/actions') && request.postDataJSON()?.action === 'preview.diff') diffRequests++; });
    try {
      await page.goto(productionUrl);
      if (theme === 'light') await expect(page.locator('.sidebar-version')).toContainText('A Testany Product');
      await expect(page.locator('.private-note')).toHaveCount(0);
      await page.locator('.nav-item').filter({ hasText: text.updates }).click();
      const row = page.locator('.uw-item').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await row.getByRole('button', { name: text.connect, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').selectOption('git');
      await dialog.getByLabel(text.url, { exact: true }).fill(sourceUrl);
      await expect(dialog.getByLabel(text.ref, { exact: true })).toHaveValue('');
      await expect(dialog.locator('.git-source-advanced')).not.toHaveAttribute('open', '');
      await page.screenshot({ path: testInfo.outputPath(`github-source-${language}-${theme}.png`), fullPage: false, animations: "disabled" });
      await dialog.getByRole('button', { name: text.compare, exact: true }).click();
      await expect(dialog.locator('.resolved-source')).toContainText('plugins/testany-llm/skills/prompt-optimizer');
      await expect(dialog.locator('.resolved-source')).toContainText('main');
      expect(diffRequests).toBe(0);
      await dialog.getByRole('button', { name: text.confirm, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8')).toBe(oldContent);
      await row.getByRole('button', { name: text.check, exact: true }).click();
      await expect(dialog.locator('.diff-toggle')).toHaveAttribute('aria-expanded', 'false');
      await dialog.getByRole('button', { name: new RegExp(text.diff) }).click();
      expect(diffRequests).toBe(0);
      await expect(dialog.locator('.diff-file-heading').filter({ hasText: 'removed.txt' })).toContainText({ zh: '删除', en: 'Removed', ja: '削除' }[language]);
      await dialog.locator('.diff-file-heading').filter({ hasText: 'SKILL.md' }).click();
      await expect(dialog.locator('.diff-code')).toBeVisible();
      await expect(dialog.locator('.diff-line-removed')).toContainText(['name: ' + name]);
      await expect(dialog.locator('.diff-line-added').filter({ hasText: '<script>' })).toContainText('window.__diffExecuted');
      expect(await page.evaluate(() => (window as Window & { __diffExecuted?: boolean }).__diffExecuted)).toBeUndefined();
      await expect(dialog.locator('.diff-number').filter({ hasText: /^1$/ }).first()).toBeVisible();
      expect(diffRequests).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`update-diff-${language}-${theme}.png`), fullPage: false, animations: "disabled" });
      await dialog.locator('.diff-file-heading').filter({ hasText: 'image.bin' }).click();
      await expect(dialog.locator('.diff-file').filter({ hasText: 'image.bin' }).locator('.diff-note')).toBeVisible();
      await dialog.getByRole('button', { name: text.apply, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8')).toContain('# Updated source');
      expect(await fs.stat(path.join(directory, 'removed.txt')).catch(() => null)).toBeNull();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}
