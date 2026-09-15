import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = `http://127.0.0.1:${Number(process.env.SKILLDOCK_E2E_PORT || 4821) + 1}`;
const labels = {
  zh: { manage: '管理同名技能', preview: '预览移除', remove: '确认移除选中的', cancel: '取消', keep: '全部保留', back: '返回选择', activity: '操作记录', restore: '恢复', confirmRestore: '确认恢复', review: '确认移除范围', disabled: '配置已禁用' },
  en: { manage: 'Manage duplicate skills', preview: 'Preview removal', remove: 'Remove', cancel: 'Cancel', keep: 'Keep all', back: 'Back to selection', activity: 'Activity', restore: 'Restore', confirmRestore: 'Restore', review: 'Review removal scope', disabled: 'Disabled in config' },
  ja: { manage: '同名スキルを管理', preview: '削除をプレビュー', remove: '選択した', cancel: 'キャンセル', keep: 'すべて保持', back: '選択に戻る', activity: '履歴', restore: '復元', confirmRestore: '復元する', review: '削除範囲を確認', disabled: '設定で無効' },
};

for (const language of ['zh', 'en', 'ja'] as const) for (const theme of ['light', 'dark']) {
  test(`select exact duplicate copies and restore one in ${language}/${theme}`, async ({ page, request }, testInfo) => {
    const state = await (await request.get(url + '/api/state')).json();
    expect(state.paths.skills).toContain('skilldock-browser-'); expect(state.paths.project).toContain('skilldock-browser-');
    const name = `duplicates-${language}-${theme}`;
    const directories = [path.join(state.paths.skills, `${name}-one`), path.join(state.paths.skills, `${name}-two`), path.join(state.paths.project, '.agents/skills', `${name}-three`), path.join(state.paths.project, '.codex/skills', `${name}-four`)];
    const system = path.join(state.paths.skills, '.system', name);
    const cache = path.join(path.dirname(state.paths.skills), 'plugins/cache/duplicate-fixtures', name, '1.0.0');
    const cachedSkill = path.join(cache, 'skills', name);
    const files = [...directories, system, cachedSkill].map(directory => path.join(directory, 'SKILL.md'));
    const content = files.map((file, i) => `---\nname: ${name}\ndescription: Duplicate copy ${i + 1} — ${language}.\n---\nOriginal file ${i + 1}\n`);
    for (const [i, file] of files.entries()) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content[i]); }
    await fs.mkdir(path.join(cache, '.codex-plugin'), { recursive: true });
    await fs.writeFile(path.join(cache, '.codex-plugin/plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
    const token = (await (await request.get(url + '/api/session')).json()).token;
    const fresh = await (await request.get(url + '/api/state')).json();
    const retained = fresh.skills.find((skill: { path: string }) => skill.path === files[3]);
    const toggle = await request.post(url + '/api/actions', { headers: { 'X-SkillDock-Token': token }, data: { mode: 'local', action: 'skill.toggle', id: retained.id, enabled: false } });
    expect(toggle.ok()).toBe(true);
    const configBefore = await fs.readFile(state.paths.config, 'utf8');
    const text = labels[language]; const selectedIndices = theme === 'light' ? [0] : [0, 2];
    await page.addInitScript(preferences => localStorage.setItem('skilldock.preferences.v1', JSON.stringify(preferences)), { language, theme });
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 1000 });
    const mutations: string[] = [];
    page.on('request', req => { if (req.url().endsWith('/api/actions')) mutations.push(req.postDataJSON()?.action); });
    try {
      await page.goto(url);
      const cards = page.locator('.skill-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(cards).toHaveCount(6);
      // The detail warning and each duplicate card both lead to the same selector.
      await cards.first().locator('.skill-card-open').click();
      await page.getByRole('dialog').getByRole('button', { name: text.manage, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAccessibleName(text.manage);
      const copies = dialog.locator('.duplicate-copy');
      await expect(copies).toHaveCount(6);
      await expect(dialog.locator('input:checked')).toHaveCount(0);
      await expect(dialog.locator('input:disabled')).toHaveCount(2);
      await expect(dialog.getByRole('button', { name: new RegExp('^' + text.preview) })).toBeDisabled();
      await copies.filter({ hasText: files[0] }).getByRole('checkbox').check();
      await dialog.getByRole('button', { name: text.cancel, exact: true }).click();
      expect(mutations).toEqual([]);
      await cards.first().getByRole('button', { name: text.manage, exact: true }).click();
      await expect(dialog.locator('input:checked')).toHaveCount(0);
      for (const i of selectedIndices) await copies.filter({ hasText: files[i] }).getByRole('checkbox').check();
      await expect(dialog.locator('.duplicate-summary')).toContainText(String(selectedIndices.length));
      await expect(dialog.locator('.modal-header')).toBeInViewport();
      await expect(dialog.locator('.duplicate-footer')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`duplicate-selection-${language}-${theme}.png`), fullPage: false, animations: 'disabled' });
      await dialog.getByRole('button', { name: new RegExp('^' + text.preview) }).click();
      await expect(dialog).toHaveAccessibleName(text.review);
      expect(await dialog.locator('.duplicate-body').evaluate(element => element.scrollTop)).toBe(0);
      await expect(dialog.locator('.duplicate-review-remove li')).toHaveCount(selectedIndices.length);
      for (const i of selectedIndices) await expect(dialog.locator('.duplicate-review-remove')).toContainText(files[i]);
      for (const [i, file] of files.entries()) expect(await fs.readFile(file, 'utf8')).toBe(content[i]);
      expect(mutations).toEqual(['skill.previewRemoval']);
      await dialog.getByRole('button', { name: text.back, exact: true }).click();
      await dialog.getByRole('button', { name: text.keep, exact: true }).click();
      await expect(dialog.locator('input:checked')).toHaveCount(0);
      for (const i of selectedIndices) await copies.filter({ hasText: files[i] }).getByRole('checkbox').check();
      await dialog.getByRole('button', { name: new RegExp('^' + text.preview) }).click();
      await expect(dialog).toHaveAccessibleName(text.review);
      await page.screenshot({ path: testInfo.outputPath(`duplicate-review-${language}-${theme}.png`), fullPage: false, animations: 'disabled' });
      await dialog.getByRole('button', { name: new RegExp('^' + text.remove) }).click();
      await expect(dialog).toHaveCount(0);
      await expect(cards).toHaveCount(6 - selectedIndices.length);
      for (const [i, file] of files.entries()) {
        if (selectedIndices.includes(i)) expect(await fs.stat(file).catch(() => null)).toBeNull();
        else expect(await fs.readFile(file, 'utf8')).toBe(content[i]);
      }
      expect(await fs.readFile(state.paths.config, 'utf8')).toBe(configBefore);
      expect((await (await request.get(url + '/api/state')).json()).skills.find((skill: { id: string }) => skill.id === retained.id).enabled).toBe(false);
      await page.locator('.nav-item').filter({ hasText: text.activity }).click();
      const removed = page.locator('.activity-item').filter({ has: page.locator('.activity-path', { hasText: files[0] }) });
      await removed.getByRole('button', { name: text.restore, exact: true }).click();
      await expect(dialog.locator('.confirm-target')).toContainText(files[0]);
      await dialog.locator('.modal-footer .button').last().click();
      await expect(dialog).toHaveCount(0);
      expect(await fs.readFile(files[0], 'utf8')).toBe(content[0]);
      if (selectedIndices.length > 1) expect(await fs.stat(files[2]).catch(() => null)).toBeNull();
    } finally {
      for (const directory of [...directories, system, path.dirname(cache)]) await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

test('a changed selection fails visibly without removing any selected copy', async ({ page, request }) => {
  const state = await (await request.get(url + '/api/state')).json();
  expect(state.paths.skills).toContain('skilldock-browser-');
  const name = 'duplicates-stale-preview';
  const directories = ['first', 'second'].map(suffix => path.join(state.paths.skills, `${name}-${suffix}`));
  for (const directory of directories) { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Stale preview test.\n---\nOriginal\n`); }
  try {
    await page.goto(url);
    await page.locator('.skill-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).first().getByRole('button', { name: '管理同名技能' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '选择可移除项', exact: true }).click();
    await dialog.getByRole('button', { name: '预览移除（2）', exact: true }).click();
    await expect(dialog.locator('.duplicate-review-list').last()).toContainText('所有已列出安装都将移除');
    await fs.appendFile(path.join(directories[1], 'SKILL.md'), '\nExternal edit\n');
    await dialog.getByRole('button', { name: '确认移除选中的 2 份', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('变化');
    await expect(dialog.locator('.duplicate-copy')).toHaveCount(2);
    for (const directory of directories) expect(await fs.stat(path.join(directory, 'SKILL.md'))).toBeTruthy();
  } finally { for (const directory of directories) await fs.rm(directory, { recursive: true, force: true }); }
});
