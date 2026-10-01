import { test, expect } from '@playwright/test';
import messages from '../src/i18n/messages.json' with { type: 'json' };

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`official plugin discovery, preview and separate connection state (${language}/${theme})`, async ({ page }, testInfo) => {
    const tr = (key: string) => language === 'zh' ? key : (messages as Record<string, Record<string, string>>)[key]?.[language] || key;
    const id = 'app-opaque-fixture@openai-curated-remote';
    let installs = 0, connected = false, iconReads = 0;
    const plugin = () => ({ id, name: 'app-opaque-fixture', displayName: 'Miro', description: 'Visualize and structure ideas', keywords: ['whiteboard'], marketplace: 'openai-curated-remote', version: '2.0.1', installed: installs > 0, enabled: installs > 0, skillCount: 0, canInstall: installs === 0, canRemove: false, canToggle: false, icon: { remote: id }, directory: { appId: 'asdk_app_fixture', installUrl: 'https://chatgpt.com/apps/miro/asdk_app_fixture', connected } });
    await page.route('**/api/state?*', async route => {
      const response = await route.fetch(); const snapshot = await response.json();
      snapshot.plugins = [plugin()]; snapshot.marketplaces = [{ id: 'openai-curated-remote', name: 'openai-curated-remote', displayName: 'Codex Plugin Directory', type: 'remote', pluginCount: 1, canRemove: false, canRefresh: false }];
      await route.fulfill({ json: snapshot });
    });
    await page.route('**/api/plugin-icon?*', async route => { iconReads++; await route.fulfill({ json: { data: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#f5cf47"/></svg>').toString('base64') } }); });
    await page.route('**/api/actions', async route => {
      const request = route.request().postDataJSON();
      if (request.id !== id) return route.continue();
      if (request.action === 'plugin.previewMarketplace') return route.fulfill({ json: { message: '', pluginPreview: { id: 'preview-fixture', pluginId: id, name: 'Miro', version: '2.0.1', description: 'Visualize and structure ideas', sourceType: 'remote', source: 'Codex Plugin Directory', icon: { remote: id }, skills: [], skillDetails: [], canSelectSkills: false, components: ['apps'], duplicates: [], remote: { appId: 'asdk_app_fixture', name: 'Miro', description: 'The full official application description.', installUrl: plugin().directory.installUrl } } } });
      if (request.action === 'plugin.install') { expect(request.previewId).toBe('preview-fixture'); installs++; }
      else if (request.action === 'plugin.connectionStatus') connected = true;
      else throw new Error('Unexpected fixture mutation: ' + request.action);
      return route.fulfill({ json: { message: '', remoteInstall: { id, name: 'Miro', installed: installs > 0, connected, installUrl: plugin().directory.installUrl } } });
    });
    await page.addInitScript(value => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(value)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 900 : 1440, height: 960 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: tr('插件'), exact: true }).click();
    const search = page.getByRole('searchbox').first();
    await search.fill('mIrO');
    await page.getByRole('button', { name: tr('查看全部匹配（{v0} 项）').replace('{v0}', '1'), exact: true }).click();
    const card = page.locator('article.skill-card').filter({ has: page.getByRole('heading', { name: 'Miro', exact: true }) });
    await expect(card).toHaveCount(1);
    await expect(card.locator('img[data-provider-icon]')).toHaveCount(1);
    await search.fill('whiteboard'); await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: tr('安装插件'), exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Miro', exact: true })).toBeVisible();
    await expect(dialog.getByText(tr('远程插件的完整组件清单与技能选择尚未开放；这里展示官方应用介绍。'))).toBeVisible();
    await expect(dialog.getByRole('link', { name: tr('查看官方详情与授权') })).toHaveAttribute('href', plugin().directory.installUrl);
    expect(installs).toBe(0); expect(iconReads).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`remote-preview-${language}-${theme}.png`), fullPage: true });
    await dialog.getByRole('button', { name: tr('确认安装'), exact: true }).click();
    await expect(dialog.getByText(tr('插件已安装'), { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: tr('连接账号') })).toBeVisible();
    await dialog.getByRole('button', { name: tr('刷新安装状态') }).click();
    await expect(dialog.getByText(tr('应用连接可用，请在新的 Codex 会话中使用。'))).toBeVisible();
    expect(installs).toBe(1);
    await dialog.getByRole('button', { name: tr('完成'), exact: true }).click();
    await page.getByRole('button', { name: tr('安装插件'), exact: true }).first().click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox', { name: tr('搜索插件') }).fill('Miro');
    const row = dialog.locator('.install-catalog-row');
    await expect(row).toHaveCount(1); await expect(row).toContainText('Miro'); await expect(row).toBeDisabled();
  });
}
