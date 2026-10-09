// SPDX-License-Identifier: AGPL-3.0-only
// Opt-in smoke for phases 4a and 4d (not part of `npm test`): the real Claude command line, in a
// temporary HOME and Claude configuration directory, against a local directory marketplace, and
// plugins from a local directory with and without a Claude manifest.
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
// Phase 4d sources: one with only a Codex manifest, one with a Claude manifest.
await write(path.join(root, 'plain-src/.codex-plugin/plugin.json'), { name: 'plain-plugin', version: '2.0.0', description: 'No Claude manifest.' });
await write(path.join(root, 'plain-src/skills/plain/SKILL.md'), '---\nname: plain\ndescription: Plain skill.\n---\n');
// No manifest at all: named after its directory (4d review P1-01).
await write(path.join(root, 'bare-src/skills/bare/SKILL.md'), '---\nname: bare\ndescription: Bare skill.\n---\n');
await write(path.join(root, 'dir-src/.claude-plugin/plugin.json'), { name: 'dir-plugin', version: '1.0.0', description: 'Skills-directory plugin.' });
await write(path.join(root, 'dir-src/skills/inside/SKILL.md'), '---\nname: inside\ndescription: Inside skill.\n---\n');
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
  // A local installation in the project: Claude's record of the project path must match the readback.
  const again = await plugin(item => !item.installed);
  await act('安装（项目本地设置）', { action: 'plugin.install', id: again.id, scope: 'local', expectedRevision: again.revision });
  const local = await plugin(item => item.installed && item.installation.scope === 'local');
  assert.equal(await fs.realpath(local.installation.projectPath), await fs.realpath(project));
  let marketplace = (await claude()).marketplaces.find(item => item.name === 'smoke-market');
  await act('刷新 marketplace', { action: 'marketplace.refresh', id: marketplace.id, expectedRevision: marketplace.revision });
  marketplace = (await claude()).marketplaces.find(item => item.name === 'smoke-market');
  // Removed while a plugin installed from it is still there: the message says what Claude did to it.
  const removal = await act('移除 marketplace（仍有插件）', { action: 'marketplace.remove', id: marketplace.id, expectedRevision: marketplace.revision, confirm: true });
  assert.equal((await claude()).marketplaces.some(item => item.name === 'smoke-market'), false);
  steps.push(`移除后提示全文：${removal.message.replace(/\n/g, ' / ')}`);
  steps.push(`移除后仍安装的插件：${(await claude()).plugins.filter(item => item.agents?.includes('claude') && item.installed && item.name === 'smoke-plugin').length}`);
  // Phase 4d: a source without a Claude manifest, through the marketplace SkillDock writes.
  const declared = async () => Object.keys(JSON.parse(await fs.readFile(path.join(home, '.claude/settings.json'), 'utf8')).extraKnownMarketplaces ?? {}).filter(name => name.startsWith('skilldock-'));
  const named = async name => (await claude()).plugins.find(item => item.agents?.includes('claude') && item.name === name && item.installed);
  const installPlain = async label => {
    const preview = (await act(`${label}：预览`, { action: 'plugin.previewInstall', sourceType: 'local', source: path.join(root, 'plain-src') })).pluginPreview;
    assert.deepEqual(preview.scopes, ['user', 'local']);
    await act(`${label}：安装（用户）`, { action: 'plugin.installSource', previewId: preview.id });
    const plain = await named('plain-plugin');
    assert.ok(plain?.marketplace.startsWith('skilldock-'), '经 SkillDock 生成的 marketplace 安装');
    assert.deepEqual(await declared(), [plain.marketplace], '用户设置中出现这条声明');
    // Claude lists the directory it was given, so SkillDock knows the marketplace as its own (re-review P3-03).
    assert.equal((await claude()).marketplaces.find(item => item.name === plain.marketplace)?.direct, true, '标为 SkillDock 生成的单插件来源');
    steps.push(`${label}：Claude 读到的版本 ${plain.version}，技能 ${plain.skillCount} 个，已标为单插件来源`);
    return plain;
  };
  let plain = await installPlain('无 manifest 来源');
  await act('无 manifest 来源：卸载', { action: 'plugin.remove', id: plain.id, expectedRevision: plain.revision, confirm: true });
  assert.equal((await claude()).marketplaces.some(item => item.name === plain.marketplace), false, '最后一个插件卸载后 marketplace 一并移除');
  assert.deepEqual(await declared(), [], '用户设置中的声明随之删除');
  plain = await installPlain('再次安装');
  const off = await act('停用 Claude 管理并一并清理', { action: 'agent.setManagement', management: 'read-only', confirm: true });
  assert.match(off.message, /已清理 SkillDock 生成的本地 marketplace/);
  assert.deepEqual([await named('plain-plugin'), await declared()], [undefined, []]);
  await act('重新启用 Claude 管理', { action: 'agent.setManagement', management: 'enabled' });
  const barePreview = (await act('无任何 manifest 来源：预览', { action: 'plugin.previewInstall', sourceType: 'local', source: path.join(root, 'bare-src') })).pluginPreview;
  assert.equal(barePreview.name, 'bare-src');
  await act('无任何 manifest 来源：安装（用户）', { action: 'plugin.installSource', previewId: barePreview.id });
  const bare = await named('bare-src');
  assert.ok(bare?.marketplace.startsWith('skilldock-'), 'Claude 以来源目录名读到它');
  steps.push(`无任何 manifest 来源：Claude 读到 ${bare.name}@${bare.marketplace.slice(0, 18)}…，技能 ${bare.skillCount} 个`);
  await act('无任何 manifest 来源：卸载', { action: 'plugin.remove', id: bare.id, expectedRevision: bare.revision, confirm: true });
  assert.deepEqual(await declared(), [], '卸载后 marketplace 与声明一并删除');
  // Phase 4d: a source with a Claude manifest becomes a skills-directory plugin.
  const dirPreview = (await act('带 manifest 来源：预览', { action: 'plugin.previewInstall', sourceType: 'local', source: path.join(root, 'dir-src') })).pluginPreview;
  await act('带 manifest 来源：放入个人技能目录', { action: 'plugin.installSource', previewId: dirPreview.id });
  const dir = await named('dir-plugin');
  assert.equal(dir?.marketplace, 'skills-dir', 'Claude 识别为技能目录插件');
  steps.push(`带 manifest 来源：Claude 读到 ${dir.name}@${dir.marketplace}，版本 ${dir.version}，可移除 ${dir.canRemove}`);
  await act('带 manifest 来源：移除', { action: 'plugin.remove', id: dir.id, expectedRevision: dir.revision, confirm: true });
  assert.equal(await named('dir-plugin'), undefined);
  const record = (await claude()).activity.find(item => item.agent === 'claude' && item.action === 'plugin.remove' && item.canRestore);
  await act('带 manifest 来源：恢复', { action: 'activity.restore', id: record.id });
  assert.equal((await named('dir-plugin'))?.marketplace, 'skills-dir', '恢复后 Claude 再次读到');
  // Everything Claude wrote stays in the temporary world.
  const written = (await fs.readdir(path.join(home, '.claude'), { recursive: true })).length;
  console.log(steps.join('\n'));
  console.log(`临时配置目录中的条目：${written}；全部步骤通过。`);
} finally {
  await service.close();
  if (!process.env.SKILLDOCK_SMOKE_KEEP) await fs.rm(root, { recursive: true, force: true });
}
