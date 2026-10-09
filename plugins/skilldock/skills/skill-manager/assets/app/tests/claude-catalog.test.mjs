// SPDX-License-Identifier: AGPL-3.0-only
// Phase 3b: the Claude read path (HLD 3.2, 3.4; API-SDX-001 36c §6) on stand-in command-line
// output and settings files in a temporary world. No Claude installed on this machine runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { claudeCatalog, readClaudeSettings } from '../server/claude-catalog.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
const skill = (directory, name) => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`);

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-catalog-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const managedDir = path.join(root, 'managed');
  const repo = path.join(root, 'repo'); const project = path.join(repo, 'app');
  await fs.mkdir(path.join(repo, '.git'), { recursive: true }); await fs.mkdir(project, { recursive: true });
  await write(path.join(configDir, 'settings.json'), { enabledPlugins: { 'a@m': true, 'b@m': false }, skillOverrides: { u1: 'off' }, env: { SECRET: 'never read' } });
  await write(path.join(project, '.claude/settings.json'), { enabledPlugins: { 'b@m': true } });
  await write(path.join(project, '.claude/settings.local.json'), { skillOverrides: { p1: 'name-only' } });
  await write(path.join(managedDir, 'managed-settings.json'), { enabledPlugins: { 'c@m': true } });
  await write(path.join(managedDir, 'managed-settings.d/10-team.json'), { skillOverrides: { u2: 'off' } });
  for (const name of ['u1', 'u2', 'u3']) await skill(path.join(configDir, 'skills'), name);
  await skill(path.join(repo, '.claude/skills'), 'p1'); await skill(path.join(project, '.claude/skills'), 'p2');
  await write(path.join(configDir, 'skills/sd/.claude-plugin/plugin.json'), { name: 'sd', description: 'Skills-dir plugin.' });
  await skill(path.join(configDir, 'skills/sd/skills'), 'inner');
  const cache = path.join(configDir, 'plugins/cache/m');
  const installA = path.join(cache, 'a/abc'); await skill(path.join(installA, 'skills'), 'a-skill');
  await write(path.join(installA, '.claude-plugin/plugin.json'), { name: 'a', description: 'Plugin A.' }); await write(path.join(installA, '.codex-plugin/plugin.json'), { name: 'a' });
  const marketDir = path.join(configDir, 'plugins/marketplaces/m');
  await write(path.join(marketDir, '.claude-plugin/marketplace.json'), { name: 'm', plugins: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
  await write(path.join(configDir, 'plugins/known_marketplaces.json'), { m: { source: { source: 'github', repo: 'o/m' }, installLocation: marketDir, lastUpdated: '2026-10-01T00:00:00.000Z', autoUpdate: true } });
  await write(path.join(configDir, 'plugins/installed_plugins.json'), { version: 2, plugins: { 'a@m': [{ scope: 'user', installPath: installA, version: 'abc' }] } });
  const plugins = [
    { id: 'a@m', scope: 'user', enabled: true, version: 'abc', installPath: installA },
    { id: 'b@m', scope: 'project', projectPath: project, enabled: true, version: 'def' },
    { id: 'c@m', scope: 'user', enabled: true, version: 'ghi' },
    { id: 'x@synced', scope: 'user', enabled: true, version: '1' },
  ];
  const markets = [{ name: 'm', source: 'github', repo: 'o/m', installLocation: marketDir }, { name: 'claude-plugins-official', source: 'github', repo: 'anthropics/claude-plugins-official' }];
  const base = { claudeRoot: { configDir, pluginCacheDir: path.join(configDir, 'plugins/cache') }, project, managedDir, cli: { available: true, path: '/stand-in/claude' },
    listPlugins: async () => plugins, listMarketplaces: async () => markets };
  return { root, home, configDir, managedDir, repo, project, installA, base };
}

test('plugins: enablement source, overrides, managed and synced protection, manifests and IDs; nothing is writable yet', async t => {
  const w = await world(t);
  const catalog = await claudeCatalog(w.base);
  assert.deepEqual([catalog.unconfirmed, catalog.evidence], [null, 'cli']);
  const byName = name => catalog.plugins.find(item => item.name === name);
  assert.deepEqual(byName('a').enablement, { decidedBy: 'user' });
  assert.deepEqual([byName('a').manifests, byName('a').skillCount, byName('a').description], [['codex', 'claude'], 1, 'Plugin A.']);
  assert.deepEqual(byName('b').enablement, { decidedBy: 'project', overriddenBy: 'project' }, '用户设置为停用，被项目设置覆盖');
  assert.deepEqual(byName('b').installation, { scope: 'project', projectPath: w.project });
  assert.deepEqual([byName('c').enablement, byName('c').protection], [{ decidedBy: 'managed', locked: true }, 'managed']);
  assert.deepEqual([byName('x').protection, byName('x').enablement.locked], ['synced', true]);
  assert.ok(catalog.plugins.every(item => item.id.startsWith('claude:plugin:') && item.agents.join() === 'claude' && !item.canToggle && !item.canRemove && !item.canInstall && item.revision));
  assert.notEqual(byName('a').id, byName('b').id);
  assert.match(byName('b').id, /^claude:plugin:b@m:project:[a-f0-9]{12}$/);
  // A skills-directory plugin (name@skills-dir) is a plugin, never a standalone skill.
  assert.deepEqual([byName('sd').marketplace, byName('sd').installation.scope, byName('sd').skillCount], ['skills-dir', 'user', 1]);
  assert.equal(catalog.skills.some(item => ['sd', 'inner'].includes(item.name)), false);
});

test('skills: visibility from the deciding layer by name, user and project roots up to the repository root', async t => {
  const w = await world(t);
  const { skills } = await claudeCatalog(w.base);
  const byName = name => skills.find(item => item.name === name);
  assert.deepEqual(skills.map(item => [item.name, item.scope]).sort(), [['p1', 'project'], ['p2', 'project'], ['u1', 'user'], ['u2', 'user'], ['u3', 'user']]);
  assert.deepEqual([byName('u1').visibility, byName('u1').enabled, byName('u1').enablement], ['disabled', false, { decidedBy: 'user' }]);
  assert.deepEqual([byName('u2').visibility, byName('u2').protection, byName('u2').enablement], ['disabled', 'managed', { decidedBy: 'managed', locked: true }], '托管追加目录中的设置');
  assert.deepEqual([byName('u3').visibility, byName('u3').enabled, byName('u3').enablement], ['enabled', true, { decidedBy: 'default' }]);
  assert.deepEqual([byName('p1').visibility, byName('p1').enabled, byName('p1').enablement], ['name-only', null, { decidedBy: 'local' }]);
  assert.ok(skills.every(item => item.id.startsWith('claude:skill:') && !item.canToggle && item.reason));
});

test('marketplaces: auto-update from settings, Claude\'s record or the default; plugin count and refresh time', async t => {
  const w = await world(t);
  const { marketplaces } = await claudeCatalog(w.base);
  const m = marketplaces.find(item => item.name === 'm'); const official = marketplaces.find(item => item.name === 'claude-plugins-official');
  assert.deepEqual([m.autoUpdate.enabled, m.autoUpdate.isDefault, m.pluginCount, m.refreshedAt, m.source], [true, false, 3, '2026-10-01T00:00:00.000Z', 'o/m']);
  assert.match(m.autoUpdate.note, /桌面应用/);
  assert.deepEqual([official.autoUpdate.enabled, official.autoUpdate.isDefault], [true, true]);
  await write(path.join(w.configDir, 'settings.json'), { extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' }, autoUpdate: false } } });
  const declared = (await claudeCatalog(w.base)).marketplaces.find(item => item.name === 'm');
  assert.deepEqual([declared.autoUpdate.enabled, declared.autoUpdate.isDefault, declared.autoUpdate.note], [false, false, undefined], '设置中的声明优先于 Claude 的记录');
});

test('a failing list or an unknown settings format leaves Claude unconfirmed; its install record is shown meanwhile', async t => {
  const w = await world(t);
  const failing = await claudeCatalog({ ...w.base, listPlugins: async () => { throw new Error('claude plugin list 失败：stand-in'); } });
  assert.match(failing.unconfirmed, /无法确认.*stand-in/); assert.equal(failing.evidence, 'record');
  assert.deepEqual(failing.plugins.filter(item => item.marketplace === 'm').map(item => [item.name, item.enabled]), [['a', null]]);
  const shape = await claudeCatalog({ ...w.base, listMarketplaces: async () => [{ unexpected: true }] });
  assert.match(shape.unconfirmed, /形状未知/);
  await write(path.join(w.project, '.claude/settings.local.json'), { skillOverrides: ['p1'] });
  assert.match((await claudeCatalog(w.base)).unconfirmed, /settings\.local\.json.*skillOverrides 的格式未知/);
  await write(path.join(w.configDir, 'settings.json'), '{ not json');
  assert.match((await claudeCatalog(w.base)).unconfirmed, /settings\.json.*不是有效的 JSON/);
  // Without a command line the environment layer decides; the record is still shown.
  const none = await claudeCatalog({ ...w.base, cli: null });
  assert.deepEqual([none.unconfirmed, none.evidence], [null, 'record']);
});

test('settings: only the three relevant keys are read; a home-directory project is not counted twice', async t => {
  const w = await world(t);
  const settings = await readClaudeSettings({ configDir: w.configDir, project: w.project, managedDir: w.managedDir });
  assert.deepEqual(Object.keys(settings.layers.user).sort(), ['enabledPlugins', 'skillOverrides']);
  assert.equal(JSON.stringify(settings).includes('never read'), false);
  const atHome = await claudeCatalog({ ...w.base, project: w.home });
  assert.deepEqual(atHome.skills.map(item => [item.name, item.scope]).sort(), [['u1', 'user'], ['u2', 'user'], ['u3', 'user']]);
  assert.deepEqual(atHome.plugins.find(item => item.name === 'b').enablement, { decidedBy: 'user' }, '主目录项目不把用户设置算作项目设置');
});

test('the command lines run with the allowed variables, Claude\'s root and the project as working directory', async t => {
  const w = await world(t);
  const seen = path.join(w.root, 'seen');
  const cli = await write(path.join(w.root, 'claude'), `#!/bin/sh
{ pwd; /usr/bin/env | /usr/bin/cut -d= -f1; } > "${seen}-$2"
case "$2" in
list) echo '[{"id":"a@m","scope":"user","enabled":true,"version":"abc"}]' ;;
marketplace) echo '[{"name":"m","source":"github","repo":"o/m"}]' ;;
esac`);
  await fs.chmod(cli, 0o755);
  const catalog = await claudeCatalog({ ...w.base, listPlugins: undefined, listMarketplaces: undefined, cli: { available: true, path: cli },
    env: { HOME: w.home, PATH: '/usr/bin:/bin', CLAUDECODE: '1', ANTHROPIC_API_KEY: 'not-a-real-key' } });
  assert.deepEqual([catalog.unconfirmed, catalog.plugins.find(item => item.name === 'a').enabled], [null, true]);
  for (const name of ['list', 'marketplace']) {
    const [cwd, ...keys] = (await fs.readFile(`${seen}-${name}`, 'utf8')).trim().split('\n');
    assert.equal(await fs.realpath(cwd), w.project, name);
    for (const key of ['CLAUDE_CONFIG_DIR', 'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']) assert.ok(keys.includes(key), `${name} ${key}`);
    for (const key of ['CLAUDECODE', 'ANTHROPIC_API_KEY']) assert.equal(keys.includes(key), false, `${name} ${key}`);
  }
});
