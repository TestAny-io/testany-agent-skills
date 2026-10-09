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
import { writeGeneration } from '../server/generation.mjs';

const writeSkill = async (directory, name) => { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`); };

test('listCovers: the target list read in full and the target record kept; adapters without `listed` keep the strict rule', () => {
  const full = { diagnostics: ['unrelated'], listed: { plugins: true, marketplaces: true }, dropped: { plugins: ['other@m'], marketplaces: [] } };
  assert.equal(listCovers(full, 'plugins', 'demo@m'), true, '无关记录的问题不影响');
  assert.equal(listCovers(full, 'plugins', 'other@m'), false, '目标自己的记录被忽略时无法确认');
  assert.equal(listCovers({ ...full, listed: { plugins: true, marketplaces: false } }, 'marketplaces', 'm'), false, '市场清单没有读到');
  assert.equal(listCovers({ diagnostics: ['x'] }, 'plugins', 'demo@m'), false, '旧替身：有诊断即无法确认');
  assert.equal(listCovers({ diagnostics: [] }, 'plugins', 'demo@m'), true);
});

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-readback-')));
  const codexHome = path.join(root, 'codex'); const market = path.join(root, 'market'); const binary = path.join(root, 'codex-stand-in.mjs');
  await fs.mkdir(codexHome);
  await writeSkill(path.join(market, 'plugins/demo/skills/demo'), 'demo');
  await fs.mkdir(path.join(market, '.agents/plugins'), { recursive: true });
  // `other` is installed but its source directory is gone, like a plugin behind a dead link.
  await fs.writeFile(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugins/demo' }, { name: 'other', source: './plugins/other' }] }));
  const stateFile = path.join(root, 'stand-in.json');
  const write = async state => fs.writeFile(stateFile, JSON.stringify({ installed: true, dropAfterMutation: false, failMarketsAfterMutation: false, ...state, market, stateFile }));
  await write({});
  await fs.writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2); const file = ${JSON.stringify(stateFile)};
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const record = (name, installed) => ({ pluginId: name + '@market', name, marketplaceName: 'market', version: state.dropped && name === 'demo' ? '../1' : '1.0.0', installed, enabled: true, source: { source: 'local', path: state.market + '/plugins/' + name } });
const unsafe = { pluginId: 'bad@elsewhere', name: '../bad', marketplaceName: 'elsewhere' };
if (args[0] === '--version') console.log('codex-cli stand-in');
else if (args.includes('--help')) console.log('list add remove marketplace');
else if (args[0] === 'plugin' && args[1] === 'list') console.log(JSON.stringify({ installed: [...(state.installed ? [record('demo', true)] : []), record('other', true)], available: [record('demo', false), unsafe] }));
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') { if (state.marketsFail) { console.error('stand-in failure'); process.exit(2); } console.log(JSON.stringify({ marketplaces: [{ name: 'market', root: state.market, marketplaceSource: { sourceType: 'git', source: 'https://github.com/example/market.git' } }] })); }
else if (args[0] === 'plugin' && ['add', 'remove'].includes(args[1])) { state.installed = args[1] === 'add'; state.dropped = state.dropAfterMutation; fs.writeFileSync(file, JSON.stringify(state)); console.log('{}'); }
else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'upgrade') { state.marketsFail = state.failMarketsAfterMutation; fs.writeFileSync(file, JSON.stringify(state)); console.log('{}'); }
else { console.error('unexpected arguments'); process.exit(3); }
`, { mode: 0o700 });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const adapter = new CodexAdapter({ codexHome, codexBin: binary });
  const service = await createService({ home: root, codexHome, projectDir: root, stateDir: state, background: false, env: { HOME: root }, adapter,
    claudeCli: async () => ({ available: false, error: 'stand-in: none' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(result => result, error => error);
  return { adapter, service, act, write };
}

test('unrelated problems stay diagnostics: removing, installing and refreshing still succeed', async t => {
  const w = await world(t);
  const before = await w.adapter.list();
  assert.ok(before.diagnostics.some(item => item.includes('无法安全使用')) && before.diagnostics.some(item => item.startsWith('插件 other：')), '两类无关问题都在');
  assert.deepEqual(before.listed, { plugins: true, marketplaces: true });
  const removed = await w.act({ action: 'plugin.remove', id: 'demo@market' });
  assert.match(removed.message, /已卸载插件 demo/);
  const installed = await w.act({ action: 'plugin.install', id: 'demo@market' });
  assert.match(installed.message, /已安装插件 demo/);
  const refreshed = await w.act({ action: 'marketplace.refresh', id: 'market' });
  assert.match(refreshed.message, /已刷新 Git 市场 market/);
  assert.ok((await w.service.snapshot('local', true)).diagnostics.some(item => item.startsWith('插件 other：')), '无关问题照常显示');
});

test('the target itself still has to be confirmed: its record dropped, or its list not read', async t => {
  const w = await world(t);
  await w.write({ dropAfterMutation: true });
  assert.equal((await w.act({ action: 'plugin.remove', id: 'demo@market' })).code, 'READBACK_FAILED', '目标记录被忽略');
  await w.write({ failMarketsAfterMutation: true });
  assert.equal((await w.act({ action: 'marketplace.refresh', id: 'market' })).code, 'READBACK_FAILED', '市场清单没有读到');
});
