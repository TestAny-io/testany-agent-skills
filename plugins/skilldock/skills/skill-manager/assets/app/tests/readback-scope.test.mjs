// SPDX-License-Identifier: AGPL-3.0-only
// 0.11 UAT: a readback after a Codex operation confirms only its own target. Problems with
// unrelated records stay diagnostics and no longer turn a completed operation into a failure.
// The Codex command line is a local stand-in script; no Agent on this machine is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexAdapter, listCovers } from '../server/cli.mjs';
import { createService } from '../server/service.mjs';
import { resolveBackgroundSource } from '../server/background-worker.mjs';
import { writeGeneration } from '../server/generation.mjs';

const writeSkill = async (directory, name) => { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`); };

test('listCovers: the target list read in full, the target record kept, no record without identity; adapters without `listed` keep the strict rule', () => {
  const full = { diagnostics: ['unrelated'], listed: { plugins: true, marketplaces: true }, dropped: { plugins: ['other@m'], marketplaces: [], unidentified: { plugins: false, marketplaces: false } } };
  assert.equal(listCovers(full, 'plugins', 'demo@m'), true, '无关记录的问题不影响');
  assert.equal(listCovers(full, 'plugins', 'other@m'), false, '目标自己的记录被忽略时无法确认');
  assert.equal(listCovers({ ...full, dropped: { ...full.dropped, unidentified: { plugins: true, marketplaces: false } } }, 'plugins', 'demo@m'), false, '没有身份的记录可能正是目标');
  assert.equal(listCovers({ ...full, listed: { plugins: true, marketplaces: false } }, 'marketplaces', 'm'), false, '市场清单没有读到');
  assert.equal(listCovers({ diagnostics: ['x'] }, 'plugins', 'demo@m'), false, '旧替身：有诊断即无法确认');
  assert.equal(listCovers({ diagnostics: [] }, 'plugins', 'demo@m'), true);
});

test('dropped records: identities must read <name>@<marketplace>; named once, without control characters', async () => {
  const adapter = new CodexAdapter({ codexHome: '/unused' });
  adapter.probe = async () => (adapter.info = { available: true, path: '/stand-in/codex' });
  let records = [];
  adapter.command = async args => args[1] === 'marketplace' ? { marketplaces: [] } : { installed: [], available: records };
  const bad = { pluginId: 'bad@x', name: '../bad', marketplaceName: 'x' };
  records = [bad, { ...bad }, { pluginId: 'e\u202Evil@x', name: 'e\u202Evil', marketplaceName: 'x' }];
  const named = await adapter.list();
  assert.equal(named.diagnostics.filter(item => item.includes('bad@x')).length, 1, '相同的提示合并');
  assert.ok(named.diagnostics.includes('CLI 返回了无法安全使用的插件记录 evil@x，已忽略。'), '去掉方向控制字符');
  assert.equal(named.dropped.unidentified.plugins, false);
  // An identity of another shape cannot be matched: the record could be the target (review r2 D, E).
  for (const record of [{ pluginId: 'market/demo', name: 'demo' }, { pluginId: '', name: 'demo' }, { name: 'demo' }]) {
    records = [record];
    const result = await adapter.list();
    assert.equal(result.dropped.unidentified.plugins, true, JSON.stringify(record));
    assert.equal(listCovers(result, 'plugins', 'demo@market'), false, JSON.stringify(record));
  }
  records = [{ pluginId: '', name: '', marketplaceName: '' }];
  assert.ok((await adapter.list()).diagnostics.includes('CLI 返回了一条没有插件身份的记录，已忽略。'));
  // A name with '@' still splits at the last '@'.
  records = [{ pluginId: '@scope/tool@market', name: '@scope/tool', marketplaceName: 'market' }];
  const scoped = await adapter.list();
  assert.deepEqual([scoped.dropped.unidentified.plugins, listCovers(scoped, 'plugins', 'demo@market'), listCovers(scoped, 'plugins', '@scope/tool@market')], [false, true, false]);
});

/**
 * A stand-in Codex command line. `state.after` is applied by the next mutating command, so a
 * test decides what the readback sees: `noop` (the command changed nothing), `demo` (how the
 * target's record looks), `extraNull`, `pluginShape`, `marketsFail`, `market` (how the
 * marketplace record looks).
 */
async function world(t, after = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-readback-')));
  const codexHome = path.join(root, 'codex'); const market = path.join(root, 'market'); const binary = path.join(root, 'codex-stand-in.mjs');
  await fs.mkdir(codexHome);
  await writeSkill(path.join(market, 'plugins/demo/skills/demo'), 'demo');
  await fs.mkdir(path.join(market, '.agents/plugins'), { recursive: true });
  // `other` is installed but its source directory is gone, like a plugin behind a dead link.
  await fs.writeFile(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugins/demo' }, { name: 'other', source: './plugins/other' }] }));
  const stateFile = path.join(root, 'stand-in.json');
  await fs.writeFile(stateFile, JSON.stringify({ installed: true, demo: 'normal', market: 'normal', after, root: market }));
  await fs.writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2); const file = ${JSON.stringify(stateFile)};
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const mutate = change => { const after = state.after || {}; if (!after.noop) change(); Object.assign(state, after, { after: null }); save(); console.log('{}'); };
const record = (name, installed) => {
  const value = { pluginId: name + '@market', name, marketplaceName: 'market', version: '1.0.0', installed, enabled: true, source: { source: 'local', path: state.root + '/plugins/' + name } };
  if (name !== 'demo') return value;
  if (state.demo === 'unsafeVersion') value.version = '../1';
  if (state.demo === 'noPluginId') delete value.pluginId;
  if (state.demo === 'renamedId') value.pluginId = 'market/demo';
  if (state.demo === 'otherMarket') Object.assign(value, { pluginId: 'demo@other', marketplaceName: 'other', version: '../1' });
  return value;
};
const unsafe = { pluginId: 'bad@elsewhere', name: '../bad', marketplaceName: 'elsewhere' };
const marketRecord = () => ({ normal: { name: 'market', root: state.root }, relativeRoot: { name: 'market', root: 'market' }, noName: { root: state.root } }[state.market]);
if (args[0] === '--version') console.log('codex-cli stand-in');
else if (args.includes('--help')) console.log('list add remove marketplace');
else if (args[0] === 'plugin' && args[1] === 'list') {
  if (state.pluginShape === 'bad') console.log(JSON.stringify({ installed: 'unexpected', available: [] }));
  else console.log(JSON.stringify({ installed: [...(state.installed ? [record('demo', true)] : []), record('other', true), ...(state.extraNull ? [null] : [])], available: [record('demo', false), unsafe] }));
}
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
  if (state.marketsFail) { console.error('stand-in failure'); process.exit(2); }
  const entry = state.market === 'absent' ? [] : [{ ...marketRecord(), marketplaceSource: { sourceType: 'git', source: 'https://github.com/example/market.git' } }];
  console.log(JSON.stringify({ marketplaces: entry }));
}
else if (args[0] === 'plugin' && ['add', 'remove'].includes(args[1])) mutate(() => { state.installed = args[1] === 'add'; });
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'upgrade') mutate(() => {});
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'remove') mutate(() => { state.market = 'absent'; });
else { console.error('unexpected arguments'); process.exit(3); }
`, { mode: 0o700 });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const adapter = new CodexAdapter({ codexHome, codexBin: binary });
  const service = await createService({ home: root, codexHome, projectDir: root, stateDir: state, background: false, env: { HOME: root }, adapter,
    claudeCli: async () => ({ available: false, error: 'stand-in: none' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(result => result, error => error);
  const setState = async value => { const current = JSON.parse(await fs.readFile(stateFile, 'utf8')); await fs.writeFile(stateFile, JSON.stringify({ ...current, ...value })); };
  return { adapter, service, act, setState, codexHome };
}

test('unrelated problems stay diagnostics: removing, installing, refreshing and removing a marketplace still succeed', async t => {
  const w = await world(t);
  const before = await w.adapter.list();
  assert.ok(before.diagnostics.includes('CLI 返回了无法安全使用的插件记录 bad@elsewhere，已忽略。'), '提示指名被忽略的记录');
  assert.ok(before.diagnostics.some(item => item.startsWith('插件 other：')), '另一个插件的来源问题也在');
  assert.deepEqual(before.listed, { plugins: true, marketplaces: true });
  assert.match((await w.act({ action: 'plugin.remove', id: 'demo@market' })).message, /已卸载插件 demo/);
  assert.match((await w.act({ action: 'plugin.install', id: 'demo@market' })).message, /已安装插件 demo/);
  assert.match((await w.act({ action: 'marketplace.refresh', id: 'market' })).message, /已刷新 Git 市场 market/);
  assert.ok((await w.service.snapshot('local', true)).diagnostics.some(item => item.startsWith('插件 other：')), '无关问题照常显示');
  assert.match((await w.act({ action: 'marketplace.remove', id: 'market' })).message, /已移除市场来源 market/);
});

// Each case: the command returned, but the readback cannot prove the target's final state.
const unconfirmed = [
  ['plugin.remove', 'demo@market', { noop: true, demo: 'unsafeVersion' }, '目标记录（同一插件 ID）被忽略'],
  ['plugin.remove', 'demo@market', { noop: true, demo: 'noPluginId' }, '目标记录缺少插件 ID，仍按 名称@市场 归属'],
  ['plugin.remove', 'demo@market', { noop: true, demo: 'renamedId' }, '目标记录的插件 ID 换了写法'],
  ['plugin.remove', 'demo@market', { pluginShape: 'bad' }, '插件清单形状不受支持'],
  ['plugin.remove', 'demo@market', { extraNull: true }, '一条没有身份的记录可能正是目标'],
  ['marketplace.refresh', 'market', { marketsFail: true }, '刷新后市场清单没有读到'],
  ['marketplace.remove', 'market', { marketsFail: true }, '移除后市场清单没有读到'],
  ['marketplace.remove', 'market', { noop: true, market: 'relativeRoot' }, '市场记录（同名）被忽略'],
  ['marketplace.remove', 'market', { noop: true, market: 'noName' }, '市场记录没有名称'],
];
for (const [action, id, after, label] of unconfirmed) {
  test(`the target itself still has to be confirmed: ${action}, ${label}`, async t => {
    const w = await world(t, after);
    assert.equal((await w.act({ action, id })).code, 'READBACK_FAILED', label);
  });
}

test('the background worker keeps its task unless the full list proves SkillDock is gone', async t => {
  const w = await world(t);
  const context = id => ({ installation: { kind: 'plugin', codexHome: w.codexHome, marketplace: 'market', plugin: id, appPath: 'app' } });
  assert.equal(await resolveBackgroundSource(context('missing'), w.adapter), null, '完整清单中没有它：已卸载');
  for (const [demo, label] of [['noPluginId', '缺少插件 ID'], ['renamedId', '插件 ID 换了写法'], ['unsafeVersion', '版本不安全'], ['otherMarket', '被忽略的记录只是同名']]) {
    await w.setState({ demo });
    await assert.rejects(resolveBackgroundSource(context('demo'), w.adapter), /可能正是 SkillDock/, label);
  }
  await w.setState({ demo: 'normal', extraNull: true });
  await assert.rejects(resolveBackgroundSource(context('missing'), w.adapter), /可能正是 SkillDock/, '没有身份的记录');
  await w.setState({ extraNull: false, pluginShape: 'bad' });
  await assert.rejects(resolveBackgroundSource(context('missing'), w.adapter), /请恢复 Codex CLI/, '清单没读到');
});
