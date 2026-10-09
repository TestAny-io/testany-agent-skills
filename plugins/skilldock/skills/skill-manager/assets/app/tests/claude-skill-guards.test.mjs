// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4b review (43-cross-agent-phase4b-code-review.md P2-02, P2-03, P2-04): each guard of
// the Claude skill file transactions, pinned on the Claude side. Claude's lists are stand-ins;
// every directory lives in a temporary world.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skillFile = (directory, name, body = '') => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n${body}`);
const exists = file => fs.lstat(file).then(() => true, () => false);

async function world(t, { linkProject = false, projectInRepo = false, rootIntoPluginCache = false } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-guards-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude');
  let project = path.join(root, 'project'); await fs.mkdir(project, { recursive: true });
  if (projectInRepo) { await fs.mkdir(path.join(root, 'repo/.git'), { recursive: true }); project = path.join(root, 'repo/sub'); await fs.mkdir(project, { recursive: true }); await skillFile(path.join(root, 'repo/.claude/skills'), 'anc'); }
  if (linkProject) { await fs.symlink(project, path.join(root, 'project-link')); project = path.join(root, 'project-link'); }
  if (rootIntoPluginCache) { await skillFile(path.join(configDir, 'plugins/cache/x/skills'), 'cached'); await fs.symlink(path.join(configDir, 'plugins/cache/x/skills'), path.join(configDir, 'skills')); }
  else await skillFile(path.join(configDir, 'skills'), 'kept');
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const agentsFile = path.join(state, 'settings/agents.json');
  const setClaude = management => write(agentsFile, { format: 1, agents: { claude: { management, origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  await setClaude('enabled');
  const hooks = { rename: null };
  const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: false, error: 'stand-in' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] },
    claudeWriter: () => async () => { throw new Error('no command line'); }, claudeGit: async () => { throw new Error('not a repository'); },
    moveRename: async (from, to) => { await hooks.rename?.(from, to); return fs.rename(from, to); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const claudeSkill = async (name, predicate = () => true) => (await snapshot()).skills.find(item => item.agents?.join() === 'claude' && item.name === name && predicate(item));
  const act = request => service.action({ mode: 'local', ...request }).then(result => result, error => error);
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  // Links a local source to a skill and returns the refreshed skill.
  const link = async (skill, source) => {
    const preview = (await act({ action: 'skill.previewSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, sourceType: 'local', source })).sourcePreview;
    await act({ action: 'skill.connectSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, previewId: preview.id });
    return claudeSkill(skill.name, item => item.path === skill.path);
  };
  return { root, home, configDir, project, state, hooks, service, snapshot, claudeSkill, act, registry, link, setClaude };
}

test('removing a link to a skill with a source keeps that source; restoring the link does not rewrite it (P2-03)', async t => {
  const w = await world(t);
  await skillFile(path.join(w.root, 'upstream'), 'kept');
  const kept = await w.link(await w.claudeSkill('kept'), path.join(w.root, 'upstream/kept'));
  await fs.mkdir(path.join(w.project, '.claude/skills'), { recursive: true });
  await fs.symlink(path.join(w.configDir, 'skills/kept'), path.join(w.project, '.claude/skills/kept'));
  const linked = await w.claudeSkill('kept', item => item.scope === 'project');
  assert.deepEqual([linked.removeKind, linked.canUpdate], ['link', false]);
  await w.act({ action: 'skill.remove', agent: 'claude', id: linked.id, expectedRevision: linked.revision });
  assert.equal(Object.keys((await w.registry()).claudeSources).length, 1, '目录技能的来源记录保留');
  assert.equal((await w.claudeSkill('kept', item => item.scope === 'user')).canUpdate, true);
  // Relink the directory elsewhere, then restore the link: the new record stays.
  await skillFile(path.join(w.root, 'other-upstream'), 'kept');
  await w.link(kept, path.join(w.root, 'other-upstream/kept'));
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.remove');
  await w.act({ action: 'activity.restore', id: record.id });
  assert.equal(Object.values((await w.registry()).claudeSources)[0].source, path.join(w.root, 'other-upstream/kept'));
});

test('file diffs of a Claude update preview and a Claude source preview load (P2-02)', async t => {
  const w = await world(t);
  await skillFile(path.join(w.root, 'upstream'), 'kept');
  let kept = await w.claudeSkill('kept');
  const sourcePreview = (await w.act({ action: 'skill.previewSource', agent: 'claude', id: kept.id, expectedRevision: kept.revision, sourceType: 'local', source: path.join(w.root, 'upstream/kept') })).sourcePreview;
  // The installed copy and the source are the same: the preview exists, and no file differs.
  assert.equal((await w.act({ action: 'preview.diff', previewId: sourcePreview.id, path: 'SKILL.md' })).code, 'DIFF_FILE_NOT_FOUND', '来源预览按它自己的一侧通过核对');
  await w.act({ action: 'skill.connectSource', agent: 'claude', id: kept.id, expectedRevision: kept.revision, previewId: sourcePreview.id });
  kept = await w.claudeSkill('kept');
  await skillFile(path.join(w.root, 'upstream'), 'kept', 'v2\n');
  const update = (await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: kept.id, expectedRevision: kept.revision })).update;
  for (const agent of [undefined, 'codex', 'claude']) {
    const result = await w.act({ action: 'preview.diff', previewId: update.id, path: 'SKILL.md', ...(agent ? { agent } : {}) });
    assert.ok(result.diff, `差异按预览的一侧加载（请求带 ${agent ?? '无'}）：${result.code}`);
  }
});

test('guards of removal, updates and restore on the Claude side', async t => {
  const w = await world(t);
  await skillFile(path.join(w.root, 'upstream'), 'kept');
  let kept = await w.link(await w.claudeSkill('kept'), path.join(w.root, 'upstream/kept'));
  // A Git working tree is never replaced.
  await fs.mkdir(path.join(w.configDir, 'skills/kept/.git'));
  const repository = await w.claudeSkill('kept');
  assert.equal(repository.canUpdate, false);
  assert.equal((await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: repository.id, expectedRevision: repository.revision })).code, 'PROTECTED_SKILL');
  await fs.rm(path.join(w.configDir, 'skills/kept/.git'), { recursive: true });
  // The source relinked after the update check: the update stops.
  kept = await w.claudeSkill('kept');
  await skillFile(path.join(w.root, 'upstream'), 'kept', 'v2\n');
  const update = (await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: kept.id, expectedRevision: kept.revision })).update;
  await skillFile(path.join(w.root, 'second'), 'kept');
  const relinked = await w.link(kept, path.join(w.root, 'second/kept'));
  assert.equal((await w.act({ action: 'skill.update', agent: 'claude', id: relinked.id, expectedRevision: relinked.revision, previewId: update.id })).code, 'SOURCE_RELINKED');
  // Update, then change it locally: restoring the update does not overwrite the change.
  await skillFile(path.join(w.root, 'second'), 'kept', 'v3\n');
  const again = await w.claudeSkill('kept');
  const second = (await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: again.id, expectedRevision: again.revision })).update;
  // The Claude lock is held while files move.
  let lockHeld = null;
  w.hooks.rename = async () => { lockHeld ??= await exists(path.join(w.configDir, '.skilldock-operation.lock')); };
  await w.act({ action: 'skill.update', agent: 'claude', id: again.id, expectedRevision: again.revision, previewId: second.id });
  assert.equal(lockHeld, true);
  w.hooks.rename = null;
  await write(path.join(w.configDir, 'skills/kept/local.md'), 'mine');
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.update');
  assert.equal((await w.act({ action: 'activity.restore', id: record.id })).code, 'LOCAL_CHANGES');
  // A failed move is undone and journaled as an error for Claude.
  w.hooks.rename = async () => { throw Object.assign(new Error('stand-in I/O failure'), { code: 'EIO' }); };
  const current = await w.claudeSkill('kept');
  assert.equal((await w.act({ action: 'skill.remove', agent: 'claude', id: current.id, expectedRevision: current.revision })).code, 'EIO');
  w.hooks.rename = null;
  assert.ok(await exists(path.join(w.configDir, 'skills/kept/SKILL.md')), '原目录仍在');
  assert.equal((await w.registry()).activity[0].status, 'error'); assert.equal((await w.registry()).activity[0].agent, 'claude');
});

test('a restore record whose place is outside Claude skill roots is refused; a read-only Claude refuses restores', async t => {
  const w = await world(t);
  const kept = await w.claudeSkill('kept');
  await w.act({ action: 'skill.remove', agent: 'claude', id: kept.id, expectedRevision: kept.revision });
  const registry = await w.registry(); const entry = registry.activity.find(item => item.agent === 'claude' && item.canRestore);
  // Point the record at a directory outside any Claude skill root (parent identity kept consistent).
  const outside = path.join(w.root, 'outside'); await fs.mkdir(outside);
  const stat = await fs.stat(outside);
  Object.assign(entry.restore, { directory: path.join(outside, 'kept'), parentReal: outside, parentDev: String(stat.dev), parentIno: String(stat.ino) });
  await fs.writeFile(w.service.environments.local.registryFile, JSON.stringify(registry));
  assert.equal((await w.act({ action: 'activity.restore', id: entry.id })).code, 'RESTORE_BOUNDARY');
  await w.setClaude('read-only');
  assert.equal((await w.act({ action: 'activity.restore', id: entry.id })).code, 'AGENT_READ_ONLY');
});

test('only the personal skills directory and the current project are changed; a root inside a plugin cache is refused', async t => {
  const nested = await world(t, { projectInRepo: true });
  const anc = await nested.claudeSkill('anc');
  assert.deepEqual([anc.scope, anc.canRemove], ['project', false], '仓库根的技能不由子目录项目移除');
  const cache = await world(t, { rootIntoPluginCache: true });
  await skillFile(path.join(cache.root, 'source'), 'fresh');
  const preview = (await cache.act({ action: 'skill.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(cache.root, 'source/fresh') })).preview;
  assert.equal((await cache.act({ action: 'skill.install', agent: 'claude', previewId: preview.id })).code, 'TARGET_BOUNDARY');
  assert.equal(await exists(path.join(cache.configDir, 'plugins/cache/x/skills/fresh')), false);
  const cached = await cache.claudeSkill('cached');
  assert.equal((await cache.act({ action: 'skill.remove', agent: 'claude', id: cached.id, expectedRevision: cached.revision })).code, 'TARGET_BOUNDARY', '插件缓存中的技能不被移走');
  assert.ok(await exists(path.join(cache.configDir, 'plugins/cache/x/skills/cached/SKILL.md')));
});

test('a source record is keyed by the real directory, also when the project path is a link', async t => {
  const w = await world(t, { linkProject: true });
  await skillFile(path.join(w.root, 'source'), 'fresh');
  const preview = (await w.act({ action: 'skill.previewInstall', agent: 'claude', scope: 'project', sourceType: 'local', source: path.join(w.root, 'source/fresh') })).preview;
  await w.act({ action: 'skill.install', agent: 'claude', previewId: preview.id });
  const key = Object.keys((await w.registry()).claudeSources)[0];
  assert.equal(key, path.join(w.root, 'project/.claude/skills/fresh'), '键是真实目录，不是经过链接的路径');
  const fresh = await w.claudeSkill('fresh');
  assert.equal(fresh.canUpdate, true);
  assert.equal((await w.act({ action: 'skill.checkUpdate', agent: 'claude', id: fresh.id, expectedRevision: fresh.revision })).update.available, false, '检查更新按同一个键找到来源');
});

test('SkillDock itself, seen as a Claude skill, is not offered for removal', async t => {
  const w = await world(t);
  const own = fileURLToPath(new URL('../../../', import.meta.url));
  await fs.symlink(own, path.join(w.configDir, 'skills/own-skilldock'));
  const self = (await w.snapshot()).skills.find(item => item.path === path.join(w.configDir, 'skills/own-skilldock/SKILL.md'));
  assert.ok(self, 'SkillDock 的技能被 Claude 发现');
  assert.equal(self.canRemove, false);
});
