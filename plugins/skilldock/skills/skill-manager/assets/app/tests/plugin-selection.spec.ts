import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import messages from '../src/i18n/messages.json' with { type: 'json' };

async function action(request: APIRequestContext, action: string, fields = {}) {
  const session = await (await request.get('/api/session')).json();
  const response = await request.post('/api/actions', { headers: { 'X-SkillDock-Token': session.token }, data: { mode: 'sandbox', action, ...fields } });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function fixture(request: APIRequestContext, suffix: string, count = 22) {
  const state = await (await request.get('/api/state?mode=sandbox')).json();
  const root = path.join(state.paths.state, `selection-${suffix}`); const plugin = path.join(root, 'plugin');
  const name = `selection-${suffix}`;
  const write = async (relative: string, content: string) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); };
  for (let i = 0; i < count; i++) {
    const skill = `workflow-${String(i).padStart(2, '0')}`;
    await write(`plugin/skills/${skill}/SKILL.md`, `---\nname: ${skill}\ndescription: A useful workflow with a clear purpose — 用途说明と説明。\n---\nA browser fixture.\n`);
  }
  await write('plugin/.codex-plugin/plugin.json', JSON.stringify({ name, version: '1.0.0', description: 'A plugin with readable, selectable workflows.', mcpServers: './servers.json' }));
  await write('.agents/plugins/marketplace.json', JSON.stringify({ name, plugins: [{ name, source: './plugin' }] }));
  await action(request, 'marketplace.add', { sourceType: 'local', source: root });
  return { root, plugin, name, id: `${name}@${name}` };
}

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`marketplace skill choices are visible and persist in ${language}/${theme}`, async ({ page, request }, testInfo) => {
    const tr = (key: string) => language === 'zh' ? key : (messages as Record<string, Record<string, string>>)[key]?.[language] || key;
    const f = await fixture(request, `${language}-${theme}`);
    await page.addInitScript(value => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(value)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 960 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: tr('插件'), exact: true }).click();
    await page.getByRole('button', { name: tr('安装插件'), exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Marketplace', exact: true }).click();
    await dialog.getByRole('searchbox', { name: tr('搜索插件') }).fill(f.name);
    await dialog.locator('.install-catalog-row').filter({ hasText: f.name }).click();
    const picker = dialog.getByRole('region', { name: tr('插件内的技能') });
    await expect(picker.getByRole('checkbox')).toHaveCount(22);
    await expect(picker).toContainText('用途说明と説明');
    await expect(picker).toContainText('skills/workflow-21/SKILL.md');
    await picker.getByRole('button', { name: tr('全不选'), exact: true }).click();
    await picker.getByRole('searchbox').fill('workflow-02');
    await picker.getByRole('checkbox').check();
    await picker.getByRole('searchbox').fill('workflow-19');
    await picker.getByRole('checkbox').check();
    await picker.getByRole('searchbox').clear();
    expect(await picker.getByRole('checkbox').evaluateAll(nodes => nodes.filter(node => (node as HTMLInputElement).checked).length)).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(dialog.getByRole('button', { name: tr('确认安装'), exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`plugin-skill-choice-${language}-${theme}.png`), fullPage: true });
    await dialog.getByRole('button', { name: tr('确认安装'), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const state = await (await request.get('/api/state?mode=sandbox')).json();
    expect(state.plugins.find((plugin: any) => plugin.id === f.id).enabled).toBe(true);
    const skills = state.skills.filter((skill: any) => skill.pluginId === f.id && skill.scope === 'plugin');
    expect(skills).toHaveLength(22);
    expect(skills.filter((skill: any) => skill.enabled).map((skill: any) => skill.name).sort()).toEqual(['workflow-02', 'workflow-19']);
    await action(request, 'plugin.remove', { id: f.id });
  });
}

for (const sourceType of ['local', 'git']) test(`${sourceType} plugin preview supports selection and safe cancellation`, async ({ page, request }) => {
  const f = await fixture(request, `direct-${sourceType}`, 3);
  if (sourceType === 'git') {
    const git = (args: string[]) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', f.plugin, ...args]);
    git(['init', '-b', 'main']); git(['add', '.']); git(['commit', '-m', 'Fixture']);
  }
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: '插件', exact: true }).click();
  await page.getByRole('button', { name: '安装插件', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  if (sourceType === 'git') await dialog.getByRole('button', { name: 'Git 仓库', exact: true }).click();
  await dialog.getByLabel(sourceType === 'git' ? 'Git 仓库或目录链接' : '插件目录路径', { exact: true }).fill(f.plugin);
  await dialog.getByRole('button', { name: '预览插件', exact: true }).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  await dialog.getByRole('button', { name: '全不选', exact: true }).click();
  await dialog.getByRole('checkbox').first().check();
  await page.keyboard.press('Escape');
  expect((await (await request.get('/api/state?mode=sandbox')).json()).plugins.some((plugin: any) => plugin.name === f.name && plugin.installed)).toBe(false);
});

test('failed marketplace preview is an error, not an empty skill list or an installable confirmation', async ({ page, request }) => {
  const f = await fixture(request, 'broken', 1);
  await fs.writeFile(path.join(f.plugin, 'skills/workflow-00/SKILL.md'), 'broken frontmatter');
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: '插件', exact: true }).click();
  await page.getByRole('button', { name: '安装插件', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Marketplace', exact: true }).click();
  await dialog.getByRole('searchbox', { name: '搜索插件' }).fill(f.name);
  await dialog.locator('.install-catalog-row').filter({ hasText: f.name }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认安装', exact: true })).toHaveCount(0);
});
