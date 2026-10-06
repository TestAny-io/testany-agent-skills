import { test, expect } from '@playwright/test';
import type { Snapshot } from '../shared/contracts';
import messages from '../src/i18n/messages.json' with { type: 'json' };
import serverMessages from '../src/i18n/server-messages.json' with { type: 'json' };
import errors from '../src/i18n/errors.json' with { type: 'json' };

// Use the real temporary inventory and UI with deterministic failure records.
// Persistence of the error code is covered by backend-updates.test.mjs.
for (const language of ['en', 'ja'] as const) {
  test(`details, update failures and activity use ${language} while keeping source text`, async ({ page }, testInfo) => {
    const original = '该技能在上次检查后有本地修改，未覆盖。';
    const backgroundError = 'SkillDock 数据目录属于另一个安装来源；未接管其后台。';
    const providerDescription = '第三方技能描述保持原文';
    await page.addInitScript(language => localStorage.setItem('skilldock.preferences.v1', JSON.stringify({ language, theme: 'light' })), language);
    await page.route(/\/api\/state(?:\?|$)/, async route => {
      const response = await route.fetch();
      const data: Snapshot = await response.json();
      const plugin = data.plugins[0];
      Object.assign(plugin, { installed: true, enabled: true, installedPath: '/fixture/plugin', description: providerDescription });
      const item = data.updates![0];
      Object.assign(item, { status: 'error', canApply: false, message: original, reasonCode: 'LOCAL_CHANGES' });
      data.updateRuns = [{ id: 'i18n-run', trigger: 'manual', status: 'partial', startedAt: data.scannedAt, finishedAt: data.scannedAt,
        items: [{ target: item.target, name: item.name, status: 'error', message: original, reasonCode: 'LOCAL_CHANGES' }] }];
      data.activity = [{ id: 'i18n-activity', action: 'skill.update', target: '用户技能', status: 'error', message: original, reasonCode: 'LOCAL_CHANGES', createdAt: data.scannedAt, canRestore: false }];
      data.schedule!.background = { provider: 'launchd', status: 'error', lastError: backgroundError };
      await route.fulfill({ response, json: data });
    });
    await page.goto('/');
    const nav = page.getByRole('navigation').getByRole('button');
    await nav.nth(1).click();
    await page.locator('.skill-card-open').first().click();
    await expect(page.locator('.inspector dt').filter({ hasText: messages['安装路径'][language] })).toBeVisible();
    await expect(page.locator('.inspector .dialog-description')).toHaveText(providerDescription);
    await nav.nth(3).click();
    await expect(page.locator('.uw-background-status .service-message > span')).toHaveText(serverMessages[backgroundError][language]);
    await expect(page.locator('.uw-list .uw-item').first().locator(':scope > .uw-message > .service-message > span')).toHaveText(errors.LOCAL_CHANGES[language]);
    await expect(page.locator('.uw-previous-issues .service-message > span')).toHaveText(errors.LOCAL_CHANGES[language]);
    await expect(page.locator('.uw-previous-issues .original-message')).not.toBeVisible();
    await page.locator('.uw-runs > details > summary').first().click();
    await expect(page.locator('.uw-runs .service-message > span')).toHaveText(errors.LOCAL_CHANGES[language]);
    await nav.nth(4).click();
    await expect(page.locator('.activity-item .service-message > span')).toHaveText(errors.LOCAL_CHANGES[language]);
    await expect(page.locator('.activity-item .activity-target')).toHaveText('用户技能');
    await expect(page.locator('.activity-item .original-message')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`activity-${language}.png`), fullPage: true });
    await page.locator('.activity-item .service-message summary').click();
    await expect(page.locator('.activity-item .original-message')).toHaveText(original);
  });
}
