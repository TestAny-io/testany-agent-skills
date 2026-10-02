import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import messages from '../src/i18n/messages.json' with { type: 'json' };

async function action(request: APIRequestContext, action: string, fields = {}) {
  const session = await (await request.get('/api/session')).json();
  const response = await request.post('/api/actions', { headers: { 'X-SkillDock-Token': session.token }, data: { mode: 'sandbox', action, ...fields } });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`nonfatal marketplace warnings remain readable through installation and updates (${language}/${theme})`, async ({ page, request }, testInfo) => {
    const tr = (key: string) => language === 'zh' ? key : (messages as Record<string, Record<string, string>>)[key]?.[language] || key;
    const state = await (await request.get('/api/state?mode=sandbox')).json();
    const name = `compat-${language}-${theme}`, root = path.join(state.paths.state, name), id = `${name}@${name}`;
    const write = async (relative: string, text: string) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
    await write('.claude-plugin/marketplace.json', JSON.stringify({ name, plugins: [{ name, source: './', version: '1.0.0', strict: false }] }));
    const manifest = (version: string) => write('.claude-plugin/plugin.json', JSON.stringify({ name, version, skills: './.claude/skills/' }));
    await manifest('2.0.0');
    await write('.claude/skills/compat-skill/SKILL.md', '---\nname: compat-skill\ndescription: Isolated compatibility fixture.\n---\nHarmless test content.\n');
    await action(request, 'marketplace.add', { sourceType: 'local', source: root });
    await page.addInitScript(value => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(value)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 900 : 1440, height: 960 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: tr('市场来源'), exact: true }).click();
    const market = page.locator('.market-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(market.locator('.compatibility-notice')).toContainText(tr('兼容性提示'));
    await expect(market.locator('.compatibility-notice')).toContainText('1.0.0');
    await expect(market.locator('.compatibility-notice')).toContainText('2.0.0');
    await page.getByRole('navigation').getByRole('button', { name: tr('插件'), exact: true }).click();
    await page.getByRole('button', { name: tr('安装插件'), exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Marketplace', exact: true }).click();
    await dialog.getByRole('searchbox', { name: tr('搜索插件') }).fill(name);
    await dialog.locator('.install-catalog-row').filter({ hasText: name }).click();
    await expect(dialog.locator('.compatibility-notice')).toContainText(tr('两处版本声明：{v0} 的市场版本为 {v1}，plugin.json 版本为 {v2}；采用 plugin.json 版本。').replace('{v0}', name).replace('{v1}', '1.0.0').replace('{v2}', '2.0.0'));
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: tr('确认安装'), exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`compatibility-${language}-${theme}.png`), fullPage: true });
    await dialog.getByRole('button', { name: tr('确认安装'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: tr('查看 {v0} 详情').replace('{v0}', name), exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('.compatibility-notice')).toContainText(tr('兼容性提示'));
    await page.keyboard.press('Escape');
    await manifest('2.0.1');
    await action(request, 'update.check', { target: { kind: 'plugin', id } });
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: tr('更新'), exact: true }).click();
    const warning = page.locator('.compatibility-notice').filter({ hasText: name });
    await expect(warning).toHaveCount(1); await expect(warning).toContainText('2.0.1');
    await expect(warning).toContainText(tr('兼容性提示'));
    await action(request, 'plugin.remove', { id });
  });
}
