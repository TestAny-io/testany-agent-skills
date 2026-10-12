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
  // A skills-directory plugin Claude finds above the project, outside the two roots SkillDock writes.
  await write(path.join(repo, '.claude/skills/up/.claude-plugin/plugin.json'), { name: 'up', description: 'Above the project.' });
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

test('plugins: enablement source, overrides, managed and synced protection, manifests and IDs; capabilities follow the native rules', async t => {
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
  assert.ok(catalog.plugins.every(item => item.id.startsWith('claude:plugin:') && item.agents.join() === 'claude' && !item.canInstall && item.revision));
  // Phase 4a: what Claude lets SkillDock change (the service marks all of it read-only while Claude is not managed).
  // Phase 4d: a skills-directory plugin in either root SkillDock writes leaves by the file transaction.
  assert.deepEqual(['a', 'b', 'c', 'x', 'sd', 'up'].map(name => [name, byName(name).canToggle, byName(name).canRemove]),
    [['a', true, true], ['b', true, true], ['c', false, true], ['x', false, false], ['sd', false, true], ['up', false, false]]);
  assert.match(byName('up').reason, /尚未加载|不能在这里移除/);
  assert.equal(byName('a').reason, undefined); assert.match(byName('c').reason, /组织托管设置决定/); assert.match(byName('x').reason, /claude\.ai 同步/); assert.match(byName('sd').reason, /尚未加载/);
  assert.notEqual(byName('a').id, byName('b').id);
  assert.match(byName('b').id, /^claude:plugin:b@m:project:[a-f0-9]{12}$/);
  // A skills-directory plugin (name@skills-dir) is a plugin, never a standalone skill.
  assert.deepEqual([byName('sd').marketplace, byName('sd').installation.scope, byName('sd').skillCount], ['skills-dir', 'user', 1]);
  assert.equal(catalog.skills.some(item => item.name === 'sd'), false);
  assert.deepEqual(catalog.skills.filter(item => item.name === 'inner').map(item => [item.scope, item.pluginId]), [['plugin', byName('sd').id]], '它带的技能列在它名下');
});

test('the skills an installed plugin ships are listed read-only under it; commands and uninstalled plugins are not (REQ-SDX-002; Owner 2026-10-12)', async t => {
  const w = await world(t);
  // A second skill, a legacy command of the same name, a folder without SKILL.md, a hidden folder, and skills Claude loads all the
  // same (9.3 V23): one without frontmatter, one whose frontmatter names it differently, one that is a link inside the plugin.
  await skill(path.join(w.installA, 'skills'), 'b-skill');
  await write(path.join(w.installA, 'commands/a-skill.md'), '---\ndescription: legacy\n---\nrun');
  await fs.mkdir(path.join(w.installA, 'skills/notes'), { recursive: true }); await skill(path.join(w.installA, 'skills'), '.hidden');
  await write(path.join(w.installA, 'skills/broken/SKILL.md'), 'no frontmatter');
  await write(path.join(w.installA, 'skills/folder-name/SKILL.md'), '---\nname: other-name\ndescription: Named after its folder.\n---\n');
  await skill(path.join(w.installA, 'extra'), 'real'); await fs.symlink('../extra/real', path.join(w.installA, 'skills/linked'));
  // One that is too large to read is said so, once, though two installations share the directory.
  await write(path.join(w.installA, 'skills/huge/SKILL.md'), 'x'.repeat(2 * 1024 * 1024 + 1));
  // The same cache directory serves a second installation of the plugin, which is disabled.
  const plugins = [...await w.base.listPlugins(), { id: 'a@m', scope: 'project', projectPath: w.project, enabled: false, version: 'abc', installPath: w.installA }];
  const catalog = await claudeCatalog({ ...w.base, listPlugins: async () => plugins });
  const [user, project] = catalog.plugins.filter(item => item.name === 'a');
  assert.deepEqual([user.installation.scope, user.skillCount, project.installation.scope, project.skillCount], ['user', 5, 'project', 5], '命令文件不计入');
  const shipped = catalog.skills.filter(item => item.pluginId === user.id);
  assert.deepEqual(shipped.map(item => [item.name, item.description, item.isLink]), [['a-skill', 'a-skill skill.', false], ['b-skill', 'b-skill skill.', false], ['broken', '', false], ['folder-name', 'Named after its folder.', false], ['linked', 'real skill.', true]], '以目录名为名；说明头读不出时说明为空');
  assert.ok(shipped.every(item => item.scope === 'plugin' && item.enabled === true && item.version === 'abc' && item.sourceLabel === 'Claude 插件技能'));
  assert.ok(shipped.every(item => item.agents.join() === 'claude' && item.managed && !item.canToggle && !item.canRemove && !item.canUpdate && /随所属插件一起启用或停用/.test(item.reason) && item.revision
    && item.path === path.join(w.installA, 'skills', item.name, 'SKILL.md') && /^claude:skill:plugin:[a-f0-9]{12}$/.test(item.id) && item.visibility === undefined && item.enablement === undefined));
  // Each installation lists its own copy, with its own identity and the state of its plugin.
  const other = catalog.skills.filter(item => item.pluginId === project.id);
  assert.deepEqual(other.map(item => [item.name, item.enabled]), ['a-skill', 'b-skill', 'broken', 'folder-name', 'linked'].map(name => [name, false]));
  assert.ok(other.every(item => /所属插件已停用/.test(item.reason)));
  assert.equal(new Set(catalog.skills.map(item => item.id)).size, catalog.skills.length, 'ID 不重复');
  assert.deepEqual(catalog.diagnostics.filter(line => line.includes(w.installA)).map(line => line.replace(w.installA, '')), ['/skills/huge：SKILL.md 超过 2 MB。'], '读不了的技能记入诊断一次，不列出');
  // Nothing for a plugin without an installation directory, or one that is only available.
  const b = catalog.plugins.find(item => item.name === 'b' && item.installed);
  assert.deepEqual([b.skillCount, catalog.skills.filter(item => item.pluginId === b.id).length], [0, 0]);
  assert.ok(catalog.plugins.filter(item => !item.installed).every(item => item.skillCount === 0));
  // The revision follows the plugin's state: a write carrying an old one is refused like any other.
  plugins[0] = { ...plugins[0], enabled: false };
  const again = (await claudeCatalog({ ...w.base, listPlugins: async () => plugins })).skills.find(item => item.id === shipped[0].id);
  assert.deepEqual([again.enabled, again.revision === shipped[0].revision], [false, false]);
  // A plugin whose state Claude does not report: its skills say that it is the plugin's state that is unknown.
  plugins[0] = { ...plugins[0], enabled: undefined };
  const unknown = (await claudeCatalog({ ...w.base, listPlugins: async () => plugins })).skills.find(item => item.id === shipped[0].id);
  assert.deepEqual([unknown.enabled, /所属插件的启用状态尚未核实/.test(unknown.reason)], [null, true]);
});

test('a plugin\'s skills are the ones Claude loads: the default directory and what is declared besides; a marketplace root lists a complete set (9.3 V23)', async t => {
  const w = await world(t); const cache = path.join(w.configDir, 'plugins/cache/d'); const marketDir = path.join(w.configDir, 'plugins/marketplaces/d');
  // The layouts of tests/claude-plugin-skills-smoke.mjs, as Claude installs them: a plugin whose source is the
  // marketplace root is a copy of that root, marketplace file included.
  const entries = [
    { name: 'one', source: './', strict: false, skills: ['./skills/x'] }, { name: 'two', source: '.', strict: false, skills: './skills/y' }, { name: 'rootall', source: './', strict: false },
    { name: 'gone', source: './', strict: false, skills: ['./skills/absent'] }, { name: 'whole', source: './', strict: false, skills: ['./skills/', './skills/x'] },
    { name: 'sub', source: './plugins/sub', strict: false, skills: ['./tools'] }, { name: 'subone', source: './plugins/sub', strict: false, skills: ['./tools/t1', './../outside', '../outside', 7] },
    { name: 'man', source: './plugins/man' }, { name: 'elsewhere', source: { source: 'github', repo: 'o/elsewhere' }, skills: ['./extra'] },
  ];
  const root = async directory => { for (const name of ['x', 'y', 'z']) await skill(path.join(directory, 'skills'), name); await write(path.join(directory, '.claude-plugin/marketplace.json'), { name: 'd', plugins: entries }); };
  const sub = async directory => { await skill(path.join(directory, 'skills'), 's1'); await skill(path.join(directory, 'tools'), 't1'); await skill(path.join(directory, 'tools'), 't2'); };
  await root(marketDir);
  for (const name of ['one', 'two', 'rootall', 'gone', 'whole']) await root(path.join(cache, name, '1'));
  for (const name of ['sub', 'subone']) await sub(path.join(cache, name, '1'));
  await write(path.join(cache, 'man/1/.claude-plugin/plugin.json'), { name: 'man', skills: './custom' }); await skill(path.join(cache, 'man/1/skills'), 'm1'); await skill(path.join(cache, 'man/1/custom'), 'c1');
  await skill(path.join(cache, 'elsewhere/1/skills'), 'e1'); await skill(path.join(cache, 'elsewhere/1/extra'), 'e2');
  // Nothing outside the installation is the plugin's: a skill linked from elsewhere, a declared path that leaves it.
  await skill(path.join(w.root, 'outside'), 'stray'); await fs.symlink(path.join(w.root, 'outside/stray'), path.join(cache, 'sub/1/skills/stray')); await skill(path.join(cache, 'subone'), 'outside');
  // A plugin no longer in the marketplace, and one whose listing there moved on after it was installed.
  await skill(path.join(cache, 'removed/1/skills'), 'r1');
  const names = [...entries.map(entry => entry.name), 'removed'];
  const catalog = await claudeCatalog({ ...w.base,
    listPlugins: async () => names.map(name => ({ id: `${name}@d`, scope: 'user', enabled: true, version: '1', installPath: path.join(cache, name, '1') })),
    listMarketplaces: async () => [{ name: 'd', source: 'github', repo: 'o/d', installLocation: marketDir }] });
  const shipped = name => { const plugin = catalog.plugins.find(item => item.name === name && item.installed); const list = catalog.skills.filter(item => item.pluginId === plugin.id).map(item => item.name).sort(); assert.equal(plugin.skillCount, list.length, name); return list; };
  assert.deepEqual(Object.fromEntries(names.map(name => [name, shipped(name)])), {
    one: ['x'], two: ['y'], rootall: ['x', 'y', 'z'], gone: ['x', 'y', 'z'], whole: ['x', 'y', 'z'],
    sub: ['s1', 't1', 't2'], subone: ['s1', 't1'], man: ['c1', 'm1'], elsewhere: ['e1', 'e2'], removed: ['r1'] });
  assert.deepEqual(catalog.skills.filter(item => item.name === 't1').map(item => path.relative(cache, item.path)).sort(), ['sub/1/tools/t1/SKILL.md', 'subone/1/tools/t1/SKILL.md']);
  assert.deepEqual(catalog.diagnostics.filter(line => line.includes('越出插件目录')).map(line => path.relative(cache, line)), ['sub/1/skills/stray：技能链接越出插件目录，未列出。']);
  // What the installed version ships is what its own copy of the marketplace file says, whatever the marketplace lists now.
  await write(path.join(marketDir, '.claude-plugin/marketplace.json'), { name: 'd', plugins: entries.map(entry => entry.name === 'one' ? { ...entry, skills: ['./skills/x', './skills/z'] } : entry).filter(entry => entry.name !== 'two') });
  const later = await claudeCatalog({ ...w.base, listPlugins: async () => ['one', 'two'].map(name => ({ id: `${name}@d`, scope: 'user', enabled: true, version: '1', installPath: path.join(cache, name, '1') })),
    listMarketplaces: async () => [{ name: 'd', source: 'github', repo: 'o/d', installLocation: marketDir }] });
  assert.deepEqual(['one', 'two'].map(name => later.skills.filter(item => item.pluginId === later.plugins.find(plugin => plugin.name === name && plugin.installed).id).map(item => item.name)), [['x'], ['y']]);
});

test('skills: visibility from the deciding layer by name, user and project roots up to the repository root', async t => {
  const w = await world(t);
  // Claude's own skills; those a plugin ships have their own case above.
  const skills = (await claudeCatalog(w.base)).skills.filter(item => !item.pluginId);
  const byName = name => skills.find(item => item.name === name);
  assert.deepEqual(skills.map(item => [item.name, item.scope]).sort(), [['p1', 'project'], ['p2', 'project'], ['u1', 'user'], ['u2', 'user'], ['u3', 'user']]);
  assert.deepEqual([byName('u1').visibility, byName('u1').enabled, byName('u1').enablement], ['disabled', false, { decidedBy: 'user' }]);
  assert.deepEqual([byName('u2').visibility, byName('u2').protection, byName('u2').enablement], ['disabled', 'managed', { decidedBy: 'managed', locked: true }], '托管追加目录中的设置');
  assert.deepEqual([byName('u3').visibility, byName('u3').enabled, byName('u3').enablement], ['enabled', true, { decidedBy: 'default' }]);
  assert.deepEqual([byName('p1').visibility, byName('p1').enabled, byName('p1').enablement], ['name-only', null, { decidedBy: 'local' }]);
  // Phase 4b1: visibility can be written unless managed settings decide it (u2); removal and updates come later.
  assert.ok(skills.every(item => item.id.startsWith('claude:skill:') && item.canToggle === (item.name !== 'u2') && !item.canRemove && !item.canUpdate && !!item.reason === (item.name === 'u2')));
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
  // Backlog UI-18: the branch a marketplace is pinned to comes from Claude's own record; none when it follows the default.
  assert.equal('ref' in m, false);
  await write(path.join(w.configDir, 'plugins/known_marketplaces.json'), { m: { source: { source: 'github', repo: 'o/m', ref: 'feature/x\u0007' }, installLocation: path.join(w.configDir, 'plugins/marketplaces/m') } });
  assert.equal((await claudeCatalog(w.base)).marketplaces.find(item => item.name === 'm').ref, 'feature/x', '去掉控制字符');
  // Claude's list names the ref before its record does; it is bounded, and the revision does not follow it (36c: display only).
  const withRef = ref => claudeCatalog({ ...w.base, listMarketplaces: async () => [{ name: 'm', source: 'github', repo: 'o/m', ...(ref === undefined ? {} : { ref }) }] }).then(catalog => catalog.marketplaces.find(item => item.name === 'm'));
  const [fromRecord, fromList, long] = [await withRef(undefined), await withRef('release/1.x'), await withRef('r'.repeat(300))];
  assert.deepEqual([fromRecord.ref, fromList.ref, long.ref.length], ['feature/x', 'release/1.x', 200]);
  assert.deepEqual([fromList.revision, long.revision], [fromRecord.revision, fromRecord.revision]);
});

test('a failing list or an unknown settings format leaves Claude unconfirmed; its install record is shown meanwhile', async t => {
  const w = await world(t);
  const failing = await claudeCatalog({ ...w.base, listPlugins: async () => { throw new Error('claude plugin list 失败：stand-in'); } });
  assert.match(failing.unconfirmed, /无法确认.*stand-in/); assert.equal(failing.evidence, 'record');
  assert.deepEqual(failing.plugins.filter(item => item.marketplace === 'm' && item.installed).map(item => [item.name, item.enabled]), [['a', null]]);
  const shape = await claudeCatalog({ ...w.base, listMarketplaces: async () => [{ unexpected: true }] });
  assert.match(shape.unconfirmed, /形状未知/);
  await write(path.join(w.project, '.claude/settings.local.json'), { skillOverrides: ['p1'] });
  assert.match((await claudeCatalog(w.base)).unconfirmed, /settings\.local\.json.*skillOverrides 的格式未知/);
  await write(path.join(w.project, '.claude/settings.local.json'), { skillOverrides: { p1: 'name-only' } });
  await write(path.join(w.configDir, 'settings.json'), '{ not json');
  assert.match((await claudeCatalog(w.base)).unconfirmed, /settings\.json.*不是有效的 JSON/);
  // Without a command line the environment layer decides; the record is still shown.
  const none = await claudeCatalog({ ...w.base, cli: null });
  assert.deepEqual([none.unconfirmed, none.evidence], [null, 'record']);
});

test('installable plugins come from the marketplace copy on disk: not installed, read-only, listed once', async t => {
  const w = await world(t);
  const marketDir = path.join(w.configDir, 'plugins/marketplaces/m');
  const revision = (await claudeCatalog(w.base)).marketplaces.find(item => item.name === 'm').revision;
  await write(path.join(marketDir, '.claude-plugin/marketplace.json'), { name: 'm', plugins: [{ name: 'a' }, { name: 'b' }, { name: 'l' }, { name: 'r' }, { name: 'd', displayName: 'Dee', description: 'Plugin D.', version: '2.0.0' }, { name: 'd' }, { name: '../e' }, { name: 'f@g' }, { name: 'h:user' }, { name: 'n\u0000x' }, null] });
  // b is installed in this project, l only in another project (local scope), r only in Claude's own record.
  await write(path.join(w.configDir, 'plugins/installed_plugins.json'), { version: 2, plugins: { 'a@m': [{ scope: 'user', installPath: w.installA, version: 'abc' }], 'r@m': [{ scope: 'project', projectPath: '/elsewhere', version: '1' }] } });
  const listed = await w.base.listPlugins();
  const otherMarket = path.join(w.root, 'odd-market'); await write(path.join(otherMarket, '.claude-plugin/marketplace.json'), { name: 'odd:name', plugins: [{ name: 'z' }] });
  const broken = path.join(w.root, 'broken-market'); await fs.mkdir(broken);
  const shapeless = path.join(w.root, 'shapeless-market'); await write(path.join(shapeless, '.claude-plugin/marketplace.json'), { name: 'shapeless', plugins: { z: {} } });
  const base = { ...w.base, listPlugins: async () => [...listed, { id: 'l@m', scope: 'local', projectPath: '/elsewhere', enabled: false }],
    listMarketplaces: async () => [...await w.base.listMarketplaces(), { name: 'odd:name', source: 'directory', path: otherMarket, installLocation: otherMarket }, { name: 'broken', source: 'directory', path: broken, installLocation: broken }, { name: 'shapeless', source: 'directory', path: shapeless, installLocation: shapeless }] };
  const catalog = await claudeCatalog(base);
  const available = catalog.plugins.filter(item => !item.installed);
  assert.deepEqual(available.map(item => [item.id, item.name, item.displayName, item.description, item.version, item.marketplace]), [['claude:plugin:d@m', 'd', 'Dee', 'Plugin D.', '2.0.0', 'm']], '任何作用域已安装的、重复的、名称不合规的与市场名不合规的都不列出');
  assert.ok(catalog.diagnostics.some(item => item.startsWith('marketplace broken 的本机副本无法读取')), '副本读不了时说明原因');
  assert.ok(catalog.diagnostics.some(item => item.startsWith('marketplace shapeless 的本机副本无法读取')), '副本格式不对时说明原因');
  assert.ok(catalog.diagnostics.includes('marketplace odd:name 的名称无法用作插件身份，未列出其中未安装的插件。'), '市场名不合规时说明原因');
  assert.equal(catalog.unconfirmed, null, '副本问题不影响 Claude 的确认状态');
  assert.deepEqual([available[0].enabled, available[0].canInstall, available[0].agents.join(), available[0].reason], [null, true, 'claude', undefined]);
  assert.equal((await claudeCatalog(w.base)).marketplaces.find(item => item.name === 'm').revision, revision, '市场的修订号只随已安装插件变化');
  // Claude's install record is enough evidence; without any evidence an entry might be installed.
  assert.deepEqual((await claudeCatalog({ ...w.base, cli: null })).plugins.filter(item => !item.installed).map(item => item.name), ['b', 'l', 'd']);
  await fs.rm(path.join(w.configDir, 'plugins/installed_plugins.json'));
  assert.deepEqual((await claudeCatalog({ ...w.base, cli: null })).plugins.filter(item => !item.installed), []);
});

test('settings: only the three relevant keys are read; a home-directory project is not counted twice', async t => {
  const w = await world(t);
  const settings = await readClaudeSettings({ configDir: w.configDir, project: w.project, managedDir: w.managedDir });
  assert.deepEqual(Object.keys(settings.layers.user).sort(), ['enabledPlugins', 'skillOverrides']);
  assert.equal(JSON.stringify(settings).includes('never read'), false);
  const atHome = await claudeCatalog({ ...w.base, project: w.home });
  assert.deepEqual(atHome.skills.filter(item => !item.pluginId).map(item => [item.name, item.scope]).sort(), [['u1', 'user'], ['u2', 'user'], ['u3', 'user']]);
  assert.deepEqual(atHome.plugins.find(item => item.name === 'b').enablement, { decidedBy: 'user' }, '主目录项目不把用户设置算作项目设置');
});

test('the command lines run with the allowed variables, Claude\'s root and the project as working directory', async t => {
  const w = await world(t);
  const seen = path.join(w.root, 'seen');
  const argv = path.join(w.root, 'argv');
  const cli = await write(path.join(w.root, 'claude'), `#!/bin/sh
echo "$*" >> "${argv}"
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
  // Exactly the two lists: never `--available` (it downloads the plugin directory) or any update.
  assert.deepEqual((await fs.readFile(argv, 'utf8')).trim().split('\n').sort(), ['plugin list --json', 'plugin marketplace list --json']);
  // Without Claude's configuration root nothing runs: listing would create it (PH3-P1-02).
  await fs.rm(argv); await fs.rm(w.configDir, { recursive: true });
  const rootless = await claudeCatalog({ ...w.base, listPlugins: undefined, listMarketplaces: undefined, cli: { available: true, path: cli }, env: { HOME: w.home, PATH: '/usr/bin:/bin' } });
  // Only the project's skills-directory plugin, found from its files, is left.
  assert.deepEqual([rootless.unconfirmed, rootless.evidence, rootless.plugins.map(item => item.name), rootless.listed], [null, 'none', ['up'], false]);
  await assert.rejects(fs.stat(argv), { code: 'ENOENT' }); await assert.rejects(fs.stat(w.configDir), { code: 'ENOENT' });
});

test('precedence and scope: local over project, skills by their name, nothing above the repository root', async t => {
  const w = await world(t);
  await write(path.join(w.project, '.claude/settings.json'), { enabledPlugins: { 'b@m': false } });
  await write(path.join(w.project, '.claude/settings.local.json'), { enabledPlugins: { 'b@m': true }, skillOverrides: { renamed: 'off' } });
  await write(path.join(w.project, '.claude/skills/folder/SKILL.md'), '---\nname: renamed\ndescription: Name differs from its folder.\n---\n');
  await skill(path.join(w.root, '.claude/skills'), 'above-repo');
  const catalog = await claudeCatalog(w.base);
  assert.deepEqual(catalog.plugins.find(item => item.name === 'b').enablement, { decidedBy: 'local', overriddenBy: 'local' }, '本地设置覆盖项目设置');
  assert.deepEqual([catalog.skills.find(item => item.name === 'renamed').visibility], ['disabled'], '按技能名（frontmatter）匹配');
  assert.equal(catalog.skills.some(item => item.name === 'above-repo'), false, '仓库根以上不再查找');
});

test('unknown formats leave Claude unconfirmed: a visibility value, an unreadable managed drop-in directory', async t => {
  const w = await world(t);
  await write(path.join(w.configDir, 'settings.json'), { skillOverrides: { u3: 'sometimes' } });
  const unknown = await claudeCatalog(w.base);
  assert.match(unknown.unconfirmed, /技能 u3 的可见性设置 sometimes 无法识别/);
  const u3 = unknown.skills.find(item => item.name === 'u3');
  assert.deepEqual([u3.enabled, 'visibility' in u3], [null, false]);
  if (process.getuid?.() !== 0) {
    await write(path.join(w.configDir, 'settings.json'), {});
    const dropIn = path.join(w.managedDir, 'managed-settings.d'); await fs.chmod(dropIn, 0o000);
    const blocked = await claudeCatalog(w.base).finally(() => fs.chmod(dropIn, 0o755));
    assert.match(blocked.unconfirmed, /托管设置目录 .*managed-settings\.d 无法读取/);
  }
});

test('skills-directory plugins are identified by their directory; same names in user and project both stay', async t => {
  const w = await world(t);
  await write(path.join(w.project, '.claude/skills/sd/.claude-plugin/plugin.json'), { name: 'sd' });
  const catalog = await claudeCatalog({ ...w.base, listPlugins: async () => [{ id: 'sd@skills-dir', scope: 'user', enabled: false }] });
  const sds = catalog.plugins.filter(item => item.name === 'sd');
  assert.deepEqual(sds.map(item => [item.installation.scope, item.installation.skillsDir, item.enabled]).sort(),
    [['project', path.join(w.project, '.claude/skills'), null], ['user', path.join(w.configDir, 'skills'), false]]);
  assert.notEqual(sds[0].id, sds[1].id);
});

test('marketplace addresses never carry credentials', async t => {
  const w = await world(t);
  const catalog = await claudeCatalog({ ...w.base, listMarketplaces: async () => [{ name: 'private', source: 'git', url: 'https://user:secret@git.example.com/o/r.git?token=abc' }] });
  assert.equal(catalog.marketplaces[0].source, 'https://git.example.com/o/r.git');
});

test('an unreadable skills root leaves Claude unconfirmed; a managed value overrides a different local one', async t => {
  const w = await world(t);
  // Only the local layer disagrees with the managed one, so the override comes from it alone.
  await write(path.join(w.configDir, 'settings.json'), {}); await write(path.join(w.project, '.claude/settings.json'), {});
  await write(path.join(w.managedDir, 'managed-settings.json'), { enabledPlugins: { 'b@m': true } });
  await write(path.join(w.project, '.claude/settings.local.json'), { enabledPlugins: { 'b@m': false } });
  assert.deepEqual((await claudeCatalog(w.base)).plugins.find(item => item.name === 'b').enablement, { decidedBy: 'managed', overriddenBy: 'managed', locked: true });
  if (process.getuid?.() !== 0) {
    const skills = path.join(w.configDir, 'skills'); await fs.chmod(skills, 0o000);
    const blocked = await claudeCatalog(w.base).finally(() => fs.chmod(skills, 0o755));
    assert.match(blocked.unconfirmed, /技能目录 .*skills 无法读取/);
  }
});

