import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { buildUpdateItems } from '../server/sources.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const messages = JSON.parse(await fs.readFile(new URL('../src/i18n/messages.json', import.meta.url)));
const serverMessages = JSON.parse(await fs.readFile(new URL('../src/i18n/server-messages.json', import.meta.url)));
const errorMessages = JSON.parse(await fs.readFile(new URL('../src/i18n/errors.json', import.meta.url)));
// Compile the production translator and preferences. Only browser storage/DOM
// surfaces are minimal fixtures; template selection and rendering are real.
const bundle = await build({
  stdin: { contents: 'export * from "./src/i18n"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
});
function translator(language) {
  const module = { exports: {} }, storage = new Map();
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { dataset: {}, style: {} }, getElementById: () => null },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
  });
  module.exports.setPreferences({ language }); return module.exports;
}
const reload = ' 新的 Codex 会话或重载后生效。';
const lifecycle = [
  ['已安装插件 {v0}，请在新会话中确认能力。', 'Installed plugin {v0}. Check its capabilities in a new session.'],
  ['已卸载插件 {v0}，请在新会话中确认能力。', 'Uninstalled plugin {v0}. Verify the result in a new session.'],
  ['已启用插件 {v0}，新会话生效。', 'Enabled plugin {v0}; effective in a new session.'],
  ['已禁用插件 {v0}，新会话生效。', 'Disabled plugin {v0}; effective in a new session.'],
];
for (const language of ['zh', 'en', 'ja']) {
  test(`plugin lifecycle messages translate the complete sentence and reload suffix (${language})`, () => {
    const { t, ServiceMessage } = translator(language);
    for (const [source, english] of lifecycle) for (const name of ['testany-eng', '设计插件 插件助手']) for (const needsReload of [false, true]) {
      const input = source.replace('{v0}', name) + (needsReload ? reload : '');
      const expected = (language === 'zh' ? source : language === 'en' ? english : serverMessages[source].ja).replace('{v0}', name)
        + (needsReload ? language === 'zh' ? reload : messages[reload][language] : '');
      assert.equal(t(input), expected);
      assert.equal(renderToStaticMarkup(createElement(ServiceMessage, { value: input })), `<div class="service-message"><span>${expected}</span></div>`);
    }
  });
  test(`every server catalog template resolves without being shadowed by a label (${language})`, () => {
    const { t } = translator(language);
    const substitute = value => value.replace(/\{(v\d+)\}/g, (_, slot) => `literal-${slot}-设计`);
    for (const [key, translated] of Object.entries(serverMessages)) {
      assert.equal(t(substitute(key)), substitute(language === 'zh' ? key : translated[language]), key);
      assert.equal(t(substitute(key) + reload), substitute(language === 'zh' ? key : translated[language]) + (language === 'zh' ? reload : messages[reload][language]), `${key} + reload`);
    }
  });
  test(`exact labels and literal user values keep their meaning (${language})`, () => {
    const { t } = translator(language);
    const key = '查看 {v0} 详情', name = '已安装插件 示例 / 日本語 $& {v99}';
    assert.equal(t(key, { v0: name }), (language === 'zh' ? key : messages[key][language]).replace('{v0}', () => name));
    const label = '{v0}插件 {v1}';
    assert.equal(t(label, { v0: 'custom-action', v1: name }), (language === 'zh' ? label : messages[label][language]).replace('{v0}', 'custom-action').replace('{v1}', () => name));
    assert.equal(t('provider text / 外部名称'), 'provider text / 外部名称');
  });
  test(`update guidance and service status have complete translations (${language})`, () => {
    const { t, ServiceMessage } = translator(language);
    const gitSkills = [true, false].map((root, i) => ({ id: String(i), name: '用户技能', scope: 'user', canRemove: true, path: '/skills/example', sourceInfo: { kind: 'git-checkout', subpath: root ? '.' : 'skills/example' } }));
    const guidance = buildUpdateItems({ plugins: [], skills: gitSkills });
    const examples = ['安装路径', ...guidance.map(item => item.message),
      '已关闭自动更新；当前单项完成后停止。',
      'SkillDock 数据目录属于另一个安装来源；未接管其后台。',
      '检查期间来源或安装身份发生变化；重新选择后才会自动应用。',
      'Codex 应用目录读取超时，请稍后重试。'];
    for (const source of examples) {
      const expected = language === 'zh' ? source : (messages[source] || serverMessages[source])?.[language];
      assert.ok(expected, `Missing ${language} translation: ${source}`);
      assert.equal(t(source), expected);
      assert.equal(renderToStaticMarkup(createElement(ServiceMessage, { value: source })), `<div class="service-message"><span>${expected}</span></div>`);
    }
  });
  test(`nested diagnostics translate application details while preserving names (${language})`, () => {
    const { t } = translator(language);
    const name = '设计插件', reason = '安装缓存中的声明组件缺失或越界。';
    const source = `插件 ${name}：${reason}`;
    const expectedReason = language === 'zh' ? reason : serverMessages[reason]?.[language];
    assert.ok(expectedReason);
    const wrapper = language === 'zh' ? '插件 {v0}：{v1}' : serverMessages['插件 {v0}：{v1}'][language];
    assert.equal(t(source), wrapper.replace('{v0}', name).replace('{v1}', expectedReason));
    const external = '第三方返回的原文';
    assert.equal(t(`插件 ${name}：${external}`), wrapper.replace('{v0}', name).replace('{v1}', external));
  });
  test(`saved update errors use their code and keep original diagnostics collapsed (${language})`, () => {
    const { ServiceMessage, requestError } = translator(language);
    const original = '该技能在上次检查后有本地修改，未覆盖。';
    const markup = renderToStaticMarkup(createElement(ServiceMessage, { value: original, code: 'LOCAL_CHANGES', error: true }));
    if (language === 'zh') assert.equal(markup, `<div class="service-message"><span>${original}</span></div>`);
    else {
      assert.ok(markup.startsWith(`<div class="service-message"><span>${errorMessages.LOCAL_CHANGES[language]}</span><details>`));
      assert.ok(markup.includes(original));
      assert.equal(markup, renderToStaticMarkup(createElement(ServiceMessage, { value: requestError('LOCAL_CHANGES', original).message, error: true })));
    }
    for (const code of ['STAGING_BOUNDARY', 'TARGET_BINDING_CHANGED', 'PLUGIN_PREVIEW_UNAVAILABLE', 'PLUGIN_DISABLED', 'APP_RESTARTING', 'SESSION_CHANGED']) {
      assert.ok(errorMessages[code]?.en && errorMessages[code]?.ja, `Missing ${code}`);
    }
  });
}
