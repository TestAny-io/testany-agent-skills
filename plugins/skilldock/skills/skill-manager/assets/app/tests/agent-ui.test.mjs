// Phase 3d: the Agent dimension of the interface (HLD 4.1; PRD 5.1, 5.2), rendered with the
// production components and translator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const bundle = await build({
  stdin: { contents: 'export * from "./src/AgentUI"; export * from "./src/AgentEnvironments"; export * from "./src/agent-requests"; export * from "./src/NativeConfirm"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false, loader: { '.css': 'empty' },
});
function ui(language = 'zh') {
  const module = { exports: {} }, storage = new Map();
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports, require,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { dataset: {}, style: {} }, getElementById: () => null },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
  });
  module.exports.setPreferences({ language }); return module.exports;
}
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
// The confirmation dialog alone; its portal Modal cannot render on a server, so its body renders in place.
const confirmBundle = await build({
  stdin: { contents: 'export * from "./src/ConfirmDialog"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false, loader: { '.css': 'empty' },
  plugins: [{ name: 'modal-in-place', setup(build) {
    build.onResolve({ filter: /^\.\/Modal$/ }, () => ({ path: 'modal', namespace: 'in-place' }));
    build.onLoad({ filter: /.*/, namespace: 'in-place' }, () => ({ contents: 'export function Modal({ children }) { return children; }', loader: 'js' }));
  } }],
});
function confirmUi(language = 'zh') {
  const module = { exports: {} }, storage = new Map();
  runInNewContext(confirmBundle.outputFiles[0].text, { module, exports: module.exports, require,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { dataset: {}, style: {} }, getElementById: () => null },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} } });
  module.exports.setPreferences({ language }); return module.exports;
}
const i18nBundle = await build({ stdin: { contents: 'export * from "./src/i18n"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false });
function translatorFor(language) {
  const module = { exports: {} }, storage = new Map();
  runInNewContext(i18nBundle.outputFiles[0].text, { module, exports: module.exports, require,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { dataset: {}, style: {} }, getElementById: () => null },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} } });
  module.exports.setPreferences({ language }); return module.exports;
}
const environment = (agent, management, extra = {}) => ({ agent, installed: true, management, roots: { config: `/home/.${agent}`, pluginCache: `/home/.${agent}/plugins/cache`, skills: `/home/.${agent}/skills`, origin: 'default' },
  cli: { available: true, version: '1.0.0', path: `/bin/${agent}` }, ...extra });

test('the Agent dimension appears only with more than one environment present', () => {
  const { showsAgents, matchesAgent, objectAgents } = ui();
  assert.equal(showsAgents(undefined), false);
  assert.equal(showsAgents([environment('codex', 'enabled')]), false);
  assert.equal(showsAgents([environment('codex', 'enabled'), { ...environment('claude', 'enabled'), installed: false }]), false, '未安装的环境不计');
  assert.equal(showsAgents([environment('codex', 'enabled'), environment('claude', 'read-only')]), true);
  assert.equal(objectAgents({}).join(), 'codex', '缺省为 Codex');
  assert.equal(matchesAgent({ agents: ['codex', 'claude'] }, 'claude'), true);
  assert.equal(matchesAgent({}, 'claude'), false);
});

test('the Agent environments page offers what each state allows and opens a confirmation first', () => {
  const { AgentEnvironments } = ui();
  const confirmed = []; const ran = [];
  const html = render(AgentEnvironments, {
    environments: [environment('codex', 'enabled', { skilldock: { version: '0.11.0', running: true, canUpdate: false } }),
      environment('claude', 'read-only', { notes: ['从 Claude 桌面应用打开的会话不会自动更新插件（桌面应用为会话关闭了自动更新）；可在 SkillDock 或终端中手动更新。'] }),
      { ...environment('claude', 'unconfirmed'), agent: 'claude', reason: '无法确认 Claude 中的插件状态：stand-in。' }],
    skills: [{ agents: ['codex', 'claude'] }, { agents: ['claude'] }], plugins: [{ installed: true, agents: ['claude'] }, { installed: false, agents: ['claude'] }], marketplaces: [{ agents: ['claude'], name: 'skilldock-0a', displayName: 'helper', direct: true }], busy: false,
    onRun: request => ran.push(request), onConfirm: spec => confirmed.push(spec) });
  assert.match(html, /Codex<\/h2><span class="badge badge-green">已启用管理/);
  assert.match(html, /停用管理/); assert.match(html, /启用管理/); assert.match(html, /0\.11\.0（正在运行）/);
  assert.match(html, /配置根 \/home\/\.claude · 技能 2 个 · 插件 1 个/, '未安装的插件不计入');
  assert.match(html, /桌面应用/); assert.match(html, /无法确认 Claude 中的插件状态：stand-in。/);
  assert.equal((html.match(/>启用管理</g) || []).length, 1, '无法确认的环境不提供启用');
  assert.match(html, /切换 Claude 根目录/); assert.match(html, /Node\.js/);
});

test('turning Claude management off offers the clean-up only for marketplaces SkillDock generated, unticked at first', () => {
  const { disableConfirmation } = ui();
  const claude = environment('claude', 'enabled');
  const plain = disableConfirmation(claude, [{ agents: ['claude'], name: 'm' }]);
  assert.deepEqual([plain.option, plain.affected, plain.request.confirm], [undefined, undefined, undefined], '没有生成的 marketplace 时不出现');
  const spec = disableConfirmation(claude, [{ agents: ['claude'], name: 'skilldock-0a', displayName: 'helper', direct: true }, { agents: ['codex'], name: 'direct-codex', direct: true }]);
  assert.deepEqual(spec.affected, ['skilldock-0a（helper）'], '只列 Claude 一侧的');
  assert.deepEqual([spec.request.confirm, spec.option.request.confirm, spec.option.request.management], [undefined, true, 'read-only']);
  assert.equal(disableConfirmation(environment('codex', 'enabled'), [{ agents: ['codex'], name: 'direct-codex', direct: true }]).option, undefined, 'Codex 不提供');
  const html = render(confirmUi().ConfirmDialog, { dialog: spec, busy: null, action: async () => undefined, onClose() {} });
  assert.match(html, /<input type="checkbox"\/>一并清理/, '默认不勾选');
  assert.equal(render(confirmUi().ConfirmDialog, { dialog: plain, busy: null, action: async () => undefined, onClose() {} }).includes('checkbox'), false);
});

test('Agents are shown by their marks, named for screen readers and tooltips; the split counts each side', () => {
  const { AgentBadges, AgentSplit, AgentFilter } = ui();
  const badges = render(AgentBadges, { agents: ['codex', 'claude'] });
  assert.equal((badges.match(/<svg/g) || []).length, 2);
  assert.match(badges, /role="img" aria-label="Codex" title="Codex"/); assert.match(badges, /aria-label="Claude" title="Claude"/);
  assert.equal(/>(Codex|Claude)</.test(badges), false, '不再用文字标识');
  const split = render(AgentSplit, { counts: { codex: 28, claude: 5 } });
  assert.match(split, /agent-split-item agent-codex.*Codex<\/span>28/); assert.match(split, /agent-split-item agent-claude.*Claude<\/span>5/);
  const filter = render(AgentFilter, { value: 'all', onChange() {}, counts: { all: 33, codex: 28, claude: 5 } });
  assert.equal((filter.match(/<svg/g) || []).length, 2, '筛选按钮带图标');
});

test('Claude facts: install scope, enablement source, protection, visibility and auto-update', () => {
  const { ClaudePluginFacts, ClaudeSkillFacts, MarketAutoUpdate, enablementText } = ui();
  const plugin = render(ClaudePluginFacts, { plugin: { installation: { scope: 'project', projectPath: '/p' }, enabled: true, enablement: { decidedBy: 'project', overriddenBy: 'project' }, protection: 'managed' } });
  assert.match(plugin, /安装范围：项目/); assert.match(plugin, /由项目设置决定：已启用（覆盖了较低层级的设置）/); assert.match(plugin, /由组织托管/);
  assert.equal(render(ClaudePluginFacts, { plugin: { enabled: true } }), '', 'Codex 插件没有这些说明');
  assert.match(render(ClaudeSkillFacts, { skill: { visibility: 'name-only', enablement: { decidedBy: 'local' } } }), /由本地设置决定：仅显示名称/);
  const shared = render(ClaudeSkillFacts, { skill: { perAgent: { codex: { enabled: true }, claude: { visibility: 'disabled', enablement: { decidedBy: 'user' } } } } });
  assert.match(shared, /Codex：已启用/); assert.match(shared, /Claude：由用户设置决定：已关闭/);
  assert.match(render(MarketAutoUpdate, { market: { autoUpdate: { enabled: false, isDefault: true } } }), /自动更新：关（默认）/);
  assert.equal(enablementText(undefined, '已启用'), '已启用（默认）');
});

test('the new texts are translated (en)', () => {
  const { AgentEnvironments, ClaudePluginFacts } = ui('en');
  const html = render(AgentEnvironments, { environments: [environment('claude', 'read-only')], skills: [], plugins: [], marketplaces: [], busy: false, onRun() {}, onConfirm() {} });
  for (const text of ['Read-only', 'Turn on management', 'Show paths', 'Change Claude root', 'Configuration root /home/.claude · 0 skills · 0 plugins', 'Detect again']) assert.ok(html.includes(text), text);
  assert.match(render(ClaudePluginFacts, { plugin: { installation: { scope: 'user' }, enabled: false, enablement: { decidedBy: 'user' } } }), /Install scope: User.*Set by user settings: Disabled/);
  assert.equal(/[一-鿿]/.test(html), false, '英文界面不残留中文');
});

test('the new notes and diagnostics are translated (en, ja)', () => {
  for (const language of ['en', 'ja']) {
    const { t } = translatorFor(language);
    for (const text of ['Claude 桌面应用为会话自带的插件（例如内置浏览器、电脑操作）不安装在 Claude 配置目录中，这里不列出。', '这一版 SkillDock 只列出 Claude 中可安装的插件，暂不能在这里安装；可以在 Claude Code 中用 /plugin 安装。',
      '未安装：Claude 已添加的 Marketplace 中尚未安装的插件，取自 Claude 在本机保存的副本；这一版只能查看。', 'CLI 返回了无法安全使用的插件记录 bad@elsewhere，已忽略。', 'marketplace broken 的本机副本无法读取，插件数与其中未安装的插件暂不显示。',
      'CLI 返回了一条没有插件身份的记录，已忽略。', 'marketplace odd:name 的名称无法用作插件身份，未列出其中未安装的插件。', '无法确认 SkillDock 安装状态：Codex 返回的插件记录中有无法安全使用的项，可能正是 SkillDock；未删除后台任务。']) {
      const translated = t(text);
      assert.notEqual(translated, text, text);
      if (language === 'en') assert.equal(/[一-鿿]/.test(translated), false, translated);
    }
  }
});

test('requests: the multi-agent snapshot only from API version 2; a write names the side of its object', () => {
  const { stateUrl, requestAgent } = ui();
  assert.equal(stateUrl('local', 2), '/api/state?mode=local&multiAgent=1');
  assert.equal(stateUrl('local', 1), '/api/state?mode=local'); assert.equal(stateUrl('local', undefined), '/api/state?mode=local');
  const snapshot = { skills: [{ id: 'shared', agents: ['codex', 'claude'] }, { id: 'claude:skill:user:a', agents: ['claude'] }, { id: 'plain' }],
    plugins: [{ id: 'claude:plugin:x@m:user', agents: ['claude'] }], marketplaces: [{ id: 'claude:marketplace:m', agents: ['claude'] }] };
  assert.equal(requestAgent({ action: 'skill.toggle', id: 'shared' }, snapshot), 'codex', '共用对象作用于 Codex 一侧');
  assert.equal(requestAgent({ action: 'skill.toggle', id: 'claude:skill:user:a' }, snapshot), 'claude');
  assert.equal(requestAgent({ action: 'plugin.toggle', id: 'claude:plugin:x@m:user' }, snapshot), 'claude');
  assert.equal(requestAgent({ action: 'update.check', target: { kind: 'plugin', id: 'claude:plugin:x@m:user' } }, snapshot), 'claude');
  assert.equal(requestAgent({ action: 'skill.toggle', id: 'plain' }, snapshot), 'codex', '缺省为 Codex');
  assert.equal(requestAgent({ action: 'updates.run' }, snapshot), 'codex');
  assert.equal(requestAgent({ action: 'agent.setManagement', agent: 'claude' }, snapshot), 'claude');
});

test('writes to a Claude object carry its revision; a confirmation is sent again with the choices its rules offer', () => {
  const { requestRevision, confirmedRequest, confirmationChoices, NativeRuleList } = ui();
  const snapshot = { skills: [{ id: 'shared', agents: ['codex', 'claude'], revision: 'aa' }], plugins: [{ id: 'claude:plugin:x@m:user', agents: ['claude'], revision: 'bb' }], marketplaces: [{ id: 'claude:marketplace:m', agents: ['claude'], revision: 'cc' }] };
  assert.equal(requestRevision({ action: 'plugin.toggle', id: 'claude:plugin:x@m:user' }, snapshot), 'bb');
  assert.equal(requestRevision({ action: 'marketplace.refresh', id: 'claude:marketplace:m' }, snapshot), 'cc');
  assert.equal(requestRevision({ action: 'skill.toggle', id: 'shared' }, snapshot), 'aa', '共用技能带两侧共同的修订号');
  assert.equal(requestRevision({ action: 'skill.toggle', id: 'codex-only' }, { ...snapshot, skills: [{ id: 'codex-only', agents: ['codex'], revision: 'zz' }] }), undefined, '只属于 Codex 的对象保持 1 版语义');
  assert.equal(requestRevision({ action: 'plugin.toggle', id: 'claude:plugin:x@m:user', expectedRevision: 'dd' }, snapshot), 'dd');
  assert.equal(requestRevision({ action: 'updates.run' }, snapshot), undefined);
  const removal = { request: { action: 'plugin.remove', id: 'claude:plugin:x@m:user' }, message: 'm', rules: [{ kind: 'data-removal', message: 'd' }, { kind: 'reload', message: 'r' }] };
  assert.equal(JSON.stringify(confirmationChoices(removal.rules)), JSON.stringify({ keepData: true, gitExclude: false }));
  assert.equal(JSON.stringify(confirmedRequest(removal, { keepData: true, gitExclude: true })), JSON.stringify({ action: 'plugin.remove', id: 'claude:plugin:x@m:user', confirm: true, keepData: true }));
  const local = { request: { action: 'plugin.toggle', id: 'p', enabled: false }, message: 'm', rules: [{ kind: 'scope', message: 's', items: ['.claude/settings.local.json'] }] };
  assert.equal(JSON.stringify(confirmedRequest(local, { keepData: true, gitExclude: false })), JSON.stringify({ action: 'plugin.toggle', id: 'p', enabled: false, confirm: true, gitExclude: false }));
  assert.equal(JSON.stringify(confirmedRequest({ ...local, rules: [{ kind: 'scope', message: 's' }] }, { keepData: true, gitExclude: true })), JSON.stringify({ action: 'plugin.toggle', id: 'p', enabled: false, confirm: true }));
  const html = render(NativeRuleList, { rules: [...removal.rules, { kind: 'affected-plugins', message: '移除后，从它安装的这些插件也会被卸载：', items: ['demo'] }] });
  assert.match(html, /移除后，从它安装的这些插件也会被卸载：/); assert.match(html, /<code>demo<\/code>/); assert.equal((html.match(/<li>/g) || []).length + (html.match(/<li /g) || []).length >= 3, true);
});

test('a new marketplace or skill names the chosen side whenever an Agent is managed', () => {
  const { creationAgent } = ui();
  assert.equal(creationAgent(['codex', 'claude'], 'claude'), 'claude');
  assert.equal(creationAgent(['claude'], 'claude'), 'claude', '只有 Claude 时不回落到 Codex');
  assert.equal(creationAgent(['claude'], 'codex'), 'claude');
  assert.equal(creationAgent(['codex'], 'codex'), 'codex');
  assert.equal(creationAgent([], 'codex'), undefined, '都不可管理时按 1 版处理');
});

test('nested service messages translate both the outer and the inner sentence (en)', () => {
  const { t } = translatorFor('en');
  assert.equal(t('无法确认 Claude 中的插件状态：设置文件 /x/settings.json 不是有效的 JSON。'), 'Cannot confirm the plugin state in Claude: The settings file /x/settings.json is not valid JSON.');
  assert.equal(t('未找到可用的 Codex CLI。 Codex 为只读：这次检查没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。'),
    'No working Codex CLI was found. Codex is read-only: this check did not change Codex. If there is a new version, turn on Codex management to update.');
});

