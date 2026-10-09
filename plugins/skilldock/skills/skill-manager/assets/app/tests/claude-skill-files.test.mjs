// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4b2: Claude skills reuse the file transactions (HLD 3.4; API-SDX-001 36c §6–7):
// install, recoverable removal, restore, source links and updates inside Claude's own skill
// roots, with Claude's source records in a partition keyed by real path. Claude's lists are
// stand-ins; every directory lives in a temporary world.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { assertTranslated } from './i18n-helper.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skillFile = (directory, name, body = '') => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n${body}`);
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason]) if (typeof text === 'string') seen.add(text); return value; };

async function world(t, { claude = 'enabled', codex } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-files-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(configDir, { recursive: true });
  await skillFile(path.join(codexHome, 'skills'), 'shared'); await fs.mkdir(path.join(configDir, 'skills'), { recursive: true });
  await fs.symlink(path.join(codexHome, 'skills/shared'), path.join(configDir, 'skills/shared'));
  await skillFile(path.join(configDir, 'skills'), 'kept');
  // A Claude skill that is a link to a directory elsewhere: removing it removes only the link.
  await skillFile(path.join(root, 'elsewhere'), 'linked'); await fs.symlink(path.join(root, 'elsewhere/linked'), path.join(configDir, 'skills/linked'));
  const source = path.join(root, 'source'); await skillFile(source, 'fresh', 'v1\n');
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: claude, origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' }, ...(codex ? { codex: { management: codex, origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } : {}) } });
  const service = await createService({ home, codexHome, projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] },
    claudeWriter: () => async () => { throw new Error('no command line for skill files'); },
    claudeGit: async () => { throw new Error('not a repository'); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const claudeSkill = async name => see((await snapshot()).skills.find(item => item.agents?.join() === 'claude' && item.name === name));
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  return { root, home, codexHome, configDir, project, source, service, snapshot, claudeSkill, act, registry };
}

test('installing into Claude: a personal skill or one in the project, recorded in the Claude partition only', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'skill.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.source, 'fresh') })).preview;
  assert.equal(preview.target, path.join(w.configDir, 'skills/fresh'));
  assert.equal((await w.act({ action: 'skill.install', previewId: preview.id })).code, 'STALE_PREVIEW', 'Claude 的预览不能被 Codex 请求使用');
  const result = await w.act({ action: 'skill.install', agent: 'claude', previewId: preview.id });
  assert.match(result.message, /已在 Claude 中安装技能 fresh/); assert.equal(result.agent, 'claude');
  assert.equal(await fs.readFile(path.join(w.configDir, 'skills/fresh/SKILL.md'), 'utf8'), '---\nname: fresh\ndescription: fresh skill.\n---\nv1\n');
  const fresh = await w.claudeSkill('fresh');
  assert.deepEqual([fresh.canRemove, fresh.removeKind, fresh.canUpdate, fresh.reason], [true, 'directory', true, undefined]);
  const registry = await w.registry();
  assert.deepEqual(Object.keys(registry.claudeSources), [await fs.realpath(path.join(w.configDir, 'skills/fresh'))], '按真实路径记在 Claude 分区');
  assert.equal(Object.values(registry.sources ?? {}).some(item => item.directory?.includes('.claude')), false, 'Codex 的来源记录不变');
  assert.equal(registry.activity[0].agent, 'claude');
  const project = (await w.act({ action: 'skill.previewInstall', agent: 'claude', scope: 'project', sourceType: 'local', source: path.join(w.source, 'fresh'), name: 'fresh-project' })).preview;
  assert.equal(project.target, path.join(w.project, '.claude/skills/fresh-project'));
  await w.act({ action: 'skill.install', agent: 'claude', previewId: project.id });
  assert.equal((await w.snapshot()).skills.find(item => item.path === path.join(w.project, '.claude/skills/fresh-project/SKILL.md'))?.scope, 'project', '名称取自 SKILL.md，目录名为 fresh-project');
  assert.equal((await w.act({ action: 'skill.previewInstall', agent: 'claude', scope: 'local', sourceType: 'local', source: path.join(w.source, 'fresh') })).code, 'INVALID_ACTION');
});

test('removal goes to the restorable area; restore follows the side of the record, not of the request', async t => {
  const w = await world(t, { codex: 'read-only' });
  const kept = await w.claudeSkill('kept');
  assert.equal((await w.act({ action: 'skill.remove', agent: 'claude', id: kept.id })).code, 'SNAPSHOT_STALE');
  const removed = await w.act({ action: 'skill.remove', agent: 'claude', id: kept.id, expectedRevision: kept.revision });
  assert.match(removed.message, /已把 Claude 技能 kept 移至可恢复区/);
  assert.equal(await fs.stat(path.join(w.configDir, 'skills/kept')).then(() => true, () => false), false);
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.remove');
  assert.deepEqual([record.canRestore, 'restore' in record], [true, false]);
  // Codex is read-only here; the record is Claude's, so Claude's management decides.
  const restored = await w.act({ action: 'activity.restore', agent: 'codex', id: record.id });
  assert.match(restored.message, /已恢复 Claude 技能 kept/);
  assert.ok(await fs.stat(path.join(w.configDir, 'skills/kept/SKILL.md')));
  assert.equal((await w.snapshot()).activity.find(item => item.id === record.id).canRestore, false);
  // A link is removed as a link; its target stays.
  const linked = await w.claudeSkill('linked');
  assert.equal(linked.removeKind, 'link');
  await w.act({ action: 'skill.remove', agent: 'claude', id: linked.id, expectedRevision: linked.revision });
  assert.equal(await fs.lstat(path.join(w.configDir, 'skills/linked')).then(() => true, () => false), false);
  assert.ok(await fs.stat(path.join(w.root, 'elsewhere/linked/SKILL.md')), '链接指向的目录保留');
});

test('a read-only Claude cannot have its skills removed or restored', async t => {
  const w = await world(t, { claude: 'read-only' });
  const kept = await w.claudeSkill('kept');
  assert.deepEqual([kept.canRemove, kept.canToggle], [false, false]);
  assert.equal((await w.act({ action: 'skill.remove', agent: 'claude', id: kept.id, expectedRevision: kept.revision })).code, 'AGENT_READ_ONLY');
});

test('linking a source, checking for an update, updating and restoring the update', async t => {
  const w = await world(t);
  const kept = await w.claudeSkill('kept');
  assert.equal(kept.canUpdate, false, '没有来源记录时不能更新');
  await skillFile(path.join(w.root, 'upstream'), 'kept');
  const link = (await w.act({ action: 'skill.previewSource', agent: 'claude', id: kept.id, expectedRevision: kept.revision, sourceType: 'local', source: path.join(w.root, 'upstream/kept') })).sourcePreview;
  assert.equal(link.matchesInstalled, true);
  await w.act({ action: 'skill.connectSource', agent: 'claude', id: kept.id, expectedRevision: kept.revision, previewId: link.id });
  const linked = await w.claudeSkill('kept'); assert.equal(linked.canUpdate, true);
  await skillFile(path.join(w.root, 'upstream'), 'kept', 'v2\n');
  const check = (await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: linked.id, expectedRevision: linked.revision })).update;
  assert.equal(check.available, true);
  const updated = await w.act({ action: 'skill.update', agent: 'claude', id: linked.id, expectedRevision: linked.revision, previewId: check.id });
  assert.match(updated.message, /已更新 Claude 技能 kept/);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/kept/SKILL.md'), 'utf8'), /v2/);
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.update');
  await w.act({ action: 'activity.restore', id: record.id });
  assert.doesNotMatch(await fs.readFile(path.join(w.configDir, 'skills/kept/SKILL.md'), 'utf8'), /v2/, '恢复到更新前');
});

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 6, `${messages.length}`);
  await assertTranslated(messages);
});
