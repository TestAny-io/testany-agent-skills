// SPDX-License-Identifier: AGPL-3.0-only
// Opt-in smoke for phase 4a (not part of `npm test`): the real Claude command line, in a
// temporary HOME and Claude configuration directory, against a local directory marketplace.
// Run it only without network access, e.g.:
//   SKILLDOCK_SMOKE_CLAUDE=/path/to/claude sandbox-exec -f no-network.sb node tests/claude-writes-smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';

const claudePath = process.env.SKILLDOCK_SMOKE_CLAUDE;
if (!claudePath) { console.error('SKILLDOCK_SMOKE_CLAUDE 未设置。'); process.exit(2); }
const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-smoke-')));
const home = path.join(root, 'home'); const project = path.join(root, 'project'); const market = path.join(root, 'market');
await fs.mkdir(path.join(home, '.claude'), { recursive: true }); await fs.mkdir(project, { recursive: true });
await write(path.join(market, '.claude-plugin/marketplace.json'), { name: 'smoke-market', owner: { name: 'SkillDock smoke' }, plugins: [{ name: 'smoke-plugin', source: './plugins/smoke-plugin', description: 'Smoke plugin.' }] });
await write(path.join(market, 'plugins/smoke-plugin/.claude-plugin/plugin.json'), { name: 'smoke-plugin', version: '1.0.0', description: 'Smoke plugin.' });
await write(path.join(market, 'plugins/smoke-plugin/skills/hello/SKILL.md'), '---\nname: hello\ndescription: Smoke skill.\n---\n');
const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: new Date().toISOString() } } });

const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false,
  env: { HOME: home, PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' },
  adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false, error: 'smoke: no Codex' } }) },
  claudeCli: async () => ({ available: true, path: claudePath, version: 'smoke' }),
  claudeCatalog: { managedDir: path.join(root, 'no-managed') } });
const steps = [];
const act = async (label, request) => {
  const started = Date.now();
  const result = await service.action({ mode: 'local', agent: 'claude', ...request });
  steps.push(`${label}：${result.message.split('\n')[0]}（${Date.now() - started} ms）`);
  return result;
};
const claude = async () => (await service.snapshot('local', true, { multiAgent: true }));
const plugin = async predicate => (await claude()).plugins.find(item => item.agents?.includes('claude') && item.name === 'smoke-plugin' && predicate(item));
try {
  assert.equal((await claude()).agents.find(item => item.agent === 'claude').management, 'enabled');
  await act('添加 marketplace', { action: 'marketplace.add', sourceType: 'local', source: market });
  const available = await plugin(item => !item.installed);
  assert.ok(available?.canInstall, '本机副本中的插件可安装');
  await act('安装（用户）', { action: 'plugin.install', id: available.id, expectedRevision: available.revision });
  let installed = await plugin(item => item.installed && item.installation.scope === 'user');
  assert.equal(installed.enabled, true);
  await act('停用（用户）', { action: 'plugin.toggle', id: installed.id, enabled: false, expectedRevision: installed.revision });
  installed = await plugin(item => item.id === installed.id); assert.equal(installed.enabled, false);
  await act('启用（用户）', { action: 'plugin.toggle', id: installed.id, enabled: true, expectedRevision: installed.revision });
  installed = await plugin(item => item.id === installed.id); assert.equal(installed.enabled, true);
  await act('停用（项目本地设置）', { action: 'plugin.toggle', id: installed.id, enabled: false, scope: 'local', expectedRevision: installed.revision });
  assert.ok(await fs.stat(path.join(project, '.claude/settings.local.json')), '本地设置写在项目里');
  installed = await plugin(item => item.id === installed.id); assert.equal(installed.enabled, false);
  await act('启用（项目本地设置）', { action: 'plugin.toggle', id: installed.id, enabled: true, scope: 'local', expectedRevision: installed.revision });
  installed = await plugin(item => item.id === installed.id);
  await act('卸载并保留数据', { action: 'plugin.remove', id: installed.id, expectedRevision: installed.revision, confirm: true, keepData: true });
  assert.equal(await plugin(item => item.installed), undefined);
  let marketplace = (await claude()).marketplaces.find(item => item.name === 'smoke-market');
  await act('刷新 marketplace', { action: 'marketplace.refresh', id: marketplace.id, expectedRevision: marketplace.revision });
  marketplace = (await claude()).marketplaces.find(item => item.name === 'smoke-market');
  await act('移除 marketplace', { action: 'marketplace.remove', id: marketplace.id, expectedRevision: marketplace.revision, confirm: true });
  assert.equal((await claude()).marketplaces.some(item => item.name === 'smoke-market'), false);
  // Everything Claude wrote stays in the temporary world.
  const written = (await fs.readdir(path.join(home, '.claude'), { recursive: true })).length;
  console.log(steps.join('\n'));
  console.log(`临时配置目录中的条目：${written}；全部步骤通过。`);
} finally {
  await service.close();
  if (!process.env.SKILLDOCK_SMOKE_KEEP) await fs.rm(root, { recursive: true, force: true });
}
