import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../shared/contracts';

async function state(page: Page): Promise<Snapshot> {
  const response = await page.request.get('/api/state?mode=sandbox');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function action(page: Page, name: string, click: () => Promise<unknown>, ok = true) {
  const waiting = page.waitForResponse(response => response.url().endsWith('/api/actions') && response.request().postDataJSON()?.action === name);
  await click();
  const response = await waiting;
  expect(response.ok(), await response.text()).toBe(ok);
  return response.json();
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true });

test('inventory waits for the server session and uses only its selected environment', async ({ page }) => {
  const inventories: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/state')) inventories.push(request.url()); });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const requested = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/api/session', async route => { entered(); await gate; await route.continue(); });
  await page.goto('/');
  await requested;
  expect(inventories).toEqual([]);
  release();
  await expect(page.getByRole('button', { name: '查看 design-review 详情', exact: true })).toBeVisible();
  expect(inventories.length).toBeGreaterThan(0);
  expect(inventories.every(url => new URL(url).searchParams.get('mode') === 'sandbox')).toBe(true);
  await expect(page.locator('.mode-switch')).toHaveCount(0);
});

test('skill library supports searching, detail text, keyboard return and persisted toggles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const open = page.getByRole('button', { name: '查看 design-review 详情', exact: true });
  await expect(open).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索' }).fill('no-such-skill-12345');
  await expect(open).toHaveCount(0);
  await page.getByRole('button', { name: '清空搜索' }).click();
  await page.getByRole('button', { name: '列表视图' }).click();
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('检查页面的主要任务');
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await action(page, 'skill.toggle', () => page.getByRole('switch', { name: '禁用 design-review', exact: true }).click());
  await expect(page.getByRole('switch', { name: '启用 design-review', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch', { name: '启用 design-review', exact: true })).toHaveAttribute('aria-checked', 'false');
  expect((await state(page)).skills.find(skill => skill.name === 'design-review')?.enabled).toBe(false);
  await action(page, 'skill.toggle', () => page.getByRole('switch', { name: '启用 design-review', exact: true }).click());
  expect((await state(page)).skills.find(skill => skill.name === 'design-review')?.enabled).toBe(true);
  expect(errors).toEqual([]);
});

test('install preview cancels safely, installs with provenance, and handles a duplicate without overwrite', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '安装技能', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/技能目录路径/).fill((await state(page)).examples!.skillSource!);
  await action(page, 'skill.previewInstall', () => page.getByRole('button', { name: '预览技能', exact: true }).click());
  await expect(page.getByRole('dialog')).toContainText('release-notes');
  await page.keyboard.press('Escape');
  expect((await state(page)).skills.some(skill => skill.name === 'release-notes')).toBe(false);
  await page.getByRole('button', { name: '安装技能', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/技能目录路径/).fill((await state(page)).examples!.skillSource!);
  await action(page, 'skill.previewInstall', () => page.getByRole('button', { name: '预览技能', exact: true }).click());
  await action(page, 'skill.install', () => page.getByRole('button', { name: '确认安装', exact: true }).click());
  await expect(page.getByRole('button', { name: '查看 release-notes 详情', exact: true })).toBeVisible();
  const installed = (await state(page)).skills.find(skill => skill.name === 'release-notes');
  expect(installed?.canUpdate).toBe(true);
  await page.getByRole('button', { name: '安装技能', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/技能目录路径/).fill((await state(page)).examples!.skillSource!);
  await action(page, 'skill.previewInstall', () => page.getByRole('button', { name: '预览技能', exact: true }).click(), false);
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await state(page)).skills.filter(skill => skill.name === 'release-notes')).toHaveLength(1);
});

test('update preview applies source changes and activity restores the original version', async ({ page }) => {
  await page.goto('/');
  await nav(page, '更新').click();
  await expect(page.getByRole('heading', { name: 'writing-assistant', exact: true })).toBeVisible();
  const row = page.locator('.update-row').filter({ has: page.getByRole('heading', { name: 'writing-assistant', exact: true }) });
  // What the check says the update touches on the other side is shown with its result (41 UI-11).
  await page.route('**/api/actions', async route => {
    if (route.request().postDataJSON()?.action !== 'update.check') return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), nativeRules: [{ kind: 'scope', message: '这个技能目录由 Codex 与 Claude 共用，两侧看到的内容都会改变。' }] } });
  });
  await action(page, 'update.check', () => row.getByRole('button', { name: '检查更新', exact: true }).click());
  await page.unroute('**/api/actions');
  await expect(page.getByRole('dialog')).toContainText('checklist.md');
  await expect(page.getByRole('dialog').locator('.native-rules')).toHaveText('这个技能目录由 Codex 与 Claude 共用，两侧看到的内容都会改变。');
  await action(page, 'update.apply', () => page.getByRole('button', { name: '确认更新', exact: true }).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, '技能库').click();
  await page.getByRole('button', { name: '查看 writing-assistant 详情', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('第二版');
  await page.keyboard.press('Escape');
  await nav(page, '操作记录').click();
  const activity = page.locator('.activity-item').filter({ has: page.getByRole('heading', { name: '更新技能', exact: true }) }).first();
  await activity.getByRole('button', { name: '恢复', exact: true }).click();
  await action(page, 'activity.restore', () => page.getByRole('button', { name: '确认恢复', exact: true }).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, '技能库').click();
  await page.getByRole('button', { name: '查看 writing-assistant 详情', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('第一版');
});

test('removal confirmation cancels then quarantines and restores a skill', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: '查看 release-notes 详情', exact: true });
  await open.click();
  await page.getByRole('button', { name: '移除技能', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect((await state(page)).skills.some(skill => skill.name === 'release-notes')).toBe(true);
  await open.click();
  await page.getByRole('button', { name: '移除技能', exact: true }).click();
  await action(page, 'skill.remove', () => page.getByRole('button', { name: '移至可恢复区', exact: true }).click());
  await expect(open).toHaveCount(0);
  await nav(page, '操作记录').click();
  const activity = page.locator('.activity-item').filter({ has: page.getByRole('heading', { name: '移除技能', exact: true }) }).first();
  await activity.getByRole('button', { name: '恢复', exact: true }).click();
  await action(page, 'activity.restore', () => page.getByRole('button', { name: '确认恢复', exact: true }).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, '技能库').click();
  await expect(open).toBeVisible();
  expect((await state(page)).skills.find(skill => skill.name === 'release-notes')?.canUpdate).toBe(true);
});

test('isolated market and plugin lifecycle changes actual inventory and preserves package boundaries', async ({ page }) => {
  await page.goto('/');
  await nav(page, '市场来源').click();
  await page.getByRole('button', { name: '添加来源', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/市场目录路径/).fill((await state(page)).examples!.marketplaceSource!);
  await action(page, 'marketplace.add', () => page.getByRole('dialog').getByRole('button', { name: '添加来源', exact: true }).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const market = page.locator('.market-card').filter({ has: page.getByRole('heading', { name: 'community-market', exact: true }) });
  await market.getByRole('button', { name: '浏览插件' }).click();
  const plugin = page.locator('.skill-card').filter({ has: page.getByRole('heading', { name: 'community-tools', exact: true }) });
  await plugin.getByRole('button', { name: '安装插件', exact: true }).click();
  await action(page, 'plugin.install', () => page.getByRole('dialog').getByRole('button', { name: '确认安装', exact: true }).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await state(page)).skills.some(skill => skill.pluginId === 'community-tools@community-market')).toBe(true);
  await action(page, 'plugin.toggle', () => page.getByRole('switch', { name: '禁用 community-tools', exact: true }).click());
  expect((await state(page)).skills.filter(skill => skill.pluginId === 'community-tools@community-market').every(skill => skill.enabled === false)).toBe(true);
  await action(page, 'plugin.toggle', () => page.getByRole('switch', { name: '启用 community-tools', exact: true }).click());
  await plugin.getByRole('button', { name: '查看 community-tools 详情', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '卸载', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('community-tools');
  await action(page, 'plugin.remove', () => page.getByRole('button', { name: '确认卸载', exact: true }).click());
  expect((await state(page)).skills.some(skill => skill.pluginId === 'community-tools@community-market')).toBe(false);
  await nav(page, '市场来源').click();
  await page.getByRole('button', { name: '移除来源 community-market', exact: true }).click();
  await action(page, 'marketplace.remove', () => page.getByRole('dialog').getByRole('button', { name: /确认移除|移除来源/ }).click());
  expect((await state(page)).marketplaces.some(item => item.name === 'community-market')).toBe(false);
});

test('the bulk removal preview names what the removal touches on the other side (41 UI-11)', async ({ page }) => {
  // Two copies of one name, and a preview carrying a native rule: only the interface is under test.
  await page.route('**/api/state?mode=sandbox*', async route => {
    const response = await route.fetch(); const snapshot: Snapshot = await response.json();
    const first = snapshot.skills.find(skill => skill.name === 'design-review')!;
    Object.assign(first, { duplicateNames: ['design-review'], canRemove: true });
    snapshot.skills.push({ ...first, id: `${first.id}-copy`, path: `${first.path}.copy/SKILL.md` });
    await route.fulfill({ response, json: snapshot });
  });
  await page.route('**/api/actions', async route => {
    const request = route.request().postDataJSON();
    if (request?.action !== 'skill.previewRemoval') return route.fallback();
    const skills = (await state(page)).skills.filter(skill => skill.name === 'design-review');
    await route.fulfill({ json: { message: '移除预览已准备好，请核对每份路径。', removalPreview: { id: 'preview', name: 'design-review', remove: skills.slice(0, 1), keep: [] },
      nativeRules: [{ kind: 'scope', message: '这个技能目录由 Codex 与 Claude 共用，两侧看到的内容都会改变。' }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '管理同名技能' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: /预览|继续|下一步/ }).click();
  await expect(dialog.getByRole('heading', { name: '确认移除范围' })).toBeVisible();
  await expect(dialog.locator('.native-rules')).toHaveText('这个技能目录由 Codex 与 Claude 共用，两侧看到的内容都会改变。');
});

test('a plan target waiting for confirmation is marked in the plan settings (41 UI-12)', async ({ page }) => {
  await page.route('**/api/state?mode=sandbox*', async route => {
    const response = await route.fetch(); const snapshot: Snapshot = await response.json();
    const target = snapshot.updates!.find(item => item.name === 'writing-assistant')!.target;
    snapshot.schedule = { ...snapshot.schedule!, enabled: true, autoApply: true, targets: [{ ...target, confirmation: 'pending' }] };
    await route.fulfill({ response, json: snapshot });
  });
  await page.goto('/');
  await nav(page, '更新').click();
  await expect(page.locator('.uw-pending-confirmation li')).toHaveText(['writing-assistant']);
  await page.getByRole('button', { name: '设置计划', exact: true }).click();
  const marked = page.getByRole('dialog').locator('.uw-check').filter({ has: page.locator('.uw-pending-tag') });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText('writing-assistant');
  await expect(marked.locator('.uw-pending-tag')).toHaveText('待确认');
});

test('large plugin catalogs render in batches while search covers all results', async ({ page }) => {
  // A version-2 interface asks for `/api/state?mode=sandbox&multiAgent=1`.
  await page.route('**/api/state?mode=sandbox*', async route => {
    const response = await route.fetch();
    const snapshot: Snapshot = await response.json();
    snapshot.plugins = Array.from({ length: 4106 }, (_, index) => ({
      id: `catalog-${String(index).padStart(5, '0')}@catalog`,
      name: `catalog-${String(index).padStart(5, '0')}`,
      description: 'Synthetic large-catalog browser fixture', marketplace: 'catalog',
      installed: false, enabled: false, skillCount: 0,
      canInstall: false, canRemove: false, canToggle: false,
      ...(index === 4105 ? { reason: '当前账号或工作区不允许安装此插件，请在 Codex 官方目录查看原因。' } : {}),
    }));
    await route.fulfill({ response, json: snapshot });
  });
  await page.goto('/');
  await nav(page, '插件').click();
  await page.getByRole('button', { name: /^全部插件/ }).click();
  await expect(page.locator('.skill-card')).toHaveCount(48);
  await expect(page.locator('.plugin-pagination')).toContainText('4106');
  await page.getByRole('button', { name: '显示更多', exact: true }).click();
  await expect(page.locator('.skill-card')).toHaveCount(96);
  await page.getByRole('searchbox', { name: '搜索' }).fill('catalog-04105');
  await expect(page.locator('.skill-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'catalog-04105', exact: true })).toBeVisible();
  // Why it cannot be installed is on the card, not only in its details (41 UI-07).
  await expect(page.locator('.skill-card .skill-reason')).toHaveText('当前账号或工作区不允许安装此插件，请在 Codex 官方目录查看原因。');
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect(page.locator('.skill-card')).toHaveCount(48);
});

for (const width of [1440, 720, 390]) {
  test(`responsive interface and modal remain usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '查看 design-review 详情' })).toBeVisible();
    for (const name of ['技能库', '插件', '市场来源', '更新', '操作记录']) {
      await nav(page, name).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await nav(page, '技能库').click();
    await page.screenshot({ path: testInfo.outputPath(`library-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '安装技能', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => { const b = element.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; })).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.getByRole('dialog').evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '安装技能', exact: true })).toBeFocused();
  });
}
