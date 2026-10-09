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
  stdin: { contents: 'export * from "./src/AgentUI"; export * from "./src/AgentEnvironments"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
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
    skills: [{ agents: ['codex', 'claude'] }, { agents: ['claude'] }], plugins: [{ installed: true, agents: ['claude'] }], busy: false,
    onRun: request => ran.push(request), onConfirm: spec => confirmed.push(spec) });
  assert.match(html, /Codex<\/h2><span class="badge badge-green">已启用管理/);
  assert.match(html, /停用管理/); assert.match(html, /启用管理/); assert.match(html, /0\.11\.0（正在运行）/);
  assert.match(html, /配置根 \/home\/\.claude · 技能 2 个 · 插件 1 个/);
  assert.match(html, /桌面应用/); assert.match(html, /无法确认 Claude 中的插件状态：stand-in。/);
  assert.equal((html.match(/>启用管理</g) || []).length, 1, '无法确认的环境不提供启用');
  assert.match(html, /切换 Claude 根目录/); assert.match(html, /Node\.js/);
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
  const html = render(AgentEnvironments, { environments: [environment('claude', 'read-only')], skills: [], plugins: [], busy: false, onRun() {}, onConfirm() {} });
  for (const text of ['Read-only', 'Turn on management', 'Show paths', 'Change Claude root', 'Configuration root /home/.claude · 0 skills · 0 plugins', 'Detect again']) assert.ok(html.includes(text), text);
  assert.match(render(ClaudePluginFacts, { plugin: { installation: { scope: 'user' }, enabled: false, enablement: { decidedBy: 'user' } } }), /Install scope: User.*Set by user settings: Disabled/);
  assert.equal(/[一-鿿]/.test(html), false, '英文界面不残留中文');
});
