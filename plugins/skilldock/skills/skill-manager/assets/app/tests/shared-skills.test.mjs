// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4c1: version-2 rules for a skill both Agents see (API-SDX-001 36c §6, AC-003, AC-005):
// one revision for both sides, each side acting on its own discovery path, confirmation before
// a shared real directory moves or the other side's plugin content changes, one leading source,
// and the other side's record kept in step. Every directory lives in a temporary world.
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
const exists = file => fs.lstat(file).then(() => true, () => false);
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason, ...(value?.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text); return value; };

async function world(t, { claudeOwns = false, codexIntoPlugin = false, codexLinkIntoPlugin = false, bothRoots = false, codexReadOnly = false, managed } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-shared-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true });
  if (bothRoots) {
    // Both skills roots link to one directory: both sides find the real directory, neither a link.
    await skillFile(path.join(root, 'common/skills'), 'shared'); await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(configDir, { recursive: true });
    await fs.symlink(path.join(root, 'common/skills'), path.join(codexHome, 'skills')); await fs.symlink(path.join(root, 'common/skills'), path.join(configDir, 'skills'));
  } else await fs.mkdir(path.join(configDir, 'skills'), { recursive: true });
  if (bothRoots) {} else if (codexLinkIntoPlugin) {
    // A Codex skill that is a link into a Claude skills-directory plugin.
    await write(path.join(configDir, 'skills/sd/.claude-plugin/plugin.json'), { name: 'sd', description: 'Skills-dir plugin.' });
    await skillFile(path.join(configDir, 'skills/sd/skills'), 'inner');
    await fs.mkdir(path.join(codexHome, 'skills'), { recursive: true }); await fs.symlink(path.join(configDir, 'skills/sd/skills/inner'), path.join(codexHome, 'skills/inner'));
  } else if (codexIntoPlugin) {
    // Codex's skills root is a link into a Claude skills-directory plugin.
    await write(path.join(configDir, 'skills/sd/.claude-plugin/plugin.json'), { name: 'sd', description: 'Skills-dir plugin.' });
    await skillFile(path.join(configDir, 'skills/sd/skills'), 'inner');
    await fs.mkdir(codexHome, { recursive: true }); await fs.symlink(path.join(configDir, 'skills/sd/skills'), path.join(codexHome, 'skills'));
  } else if (claudeOwns) {
    await skillFile(path.join(configDir, 'skills'), 'shared'); await fs.mkdir(path.join(codexHome, 'skills'), { recursive: true });
    await fs.symlink(path.join(configDir, 'skills/shared'), path.join(codexHome, 'skills/shared'));
  } else {
    await skillFile(path.join(codexHome, 'skills'), 'shared');
    await fs.symlink(path.join(codexHome, 'skills/shared'), path.join(configDir, 'skills/shared'));
  }
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' },
    ...(codexReadOnly ? { codex: { management: 'read-only', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } : {}) } });
  if (managed) await write(path.join(root, 'no-managed/managed-settings.json'), managed);
  const listed = codexIntoPlugin || codexLinkIntoPlugin ? [{ id: 'sd@skills-dir', scope: 'user', enabled: true }] : [];
  // Whether the Claude lock was held each time Claude was read.
  const locks = []; const lockHeld = () => fs.stat(path.join(configDir, '.skilldock-operation.lock')).then(() => true, () => false);
  const service = await createService({ home, codexHome, projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => { locks.push(await lockHeld()); return listed; }, listMarketplaces: async () => [] },
    claudeWriter: () => async () => { throw new Error('no command line'); }, claudeGit: async () => { throw new Error('not a repository'); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const shared = async () => see((await snapshot()).skills.find(item => item.name === 'shared'));
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  const link = async (agent, source) => {
    const skill = await shared();
    const answer = await act({ action: 'skill.previewSource', agent, id: skill.id, expectedRevision: skill.revision, sourceType: 'local', source });
    if (!answer.sourcePreview) return answer;
    const preview = answer.sourcePreview;
    return act({ action: 'skill.connectSource', agent, id: skill.id, expectedRevision: skill.revision, previewId: preview.id });
  };
  return { root, home, codexHome, configDir, project, service, snapshot, shared, act, registry, link, locks };
}

test('the Claude side of a shared skill: a link is removed and restored on its own side; its visibility is its own', async t => {
  const w = await world(t);
  const skill = await w.shared();
  assert.deepEqual([skill.agents.join(), skill.perAgent.claude.removeKind, skill.perAgent.claude.canRemove, skill.perAgent.claude.canToggle], ['codex,claude', 'link', true, true]);
  const removed = await w.act({ action: 'skill.remove', agent: 'claude', id: skill.id, expectedRevision: skill.revision });
  assert.match(removed.message, /已把 Claude 技能 shared 移至可恢复区/);
  assert.equal(await exists(path.join(w.configDir, 'skills/shared')), false);
  assert.ok(await exists(path.join(w.codexHome, 'skills/shared/SKILL.md')), 'Codex 一侧不受影响');
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.remove');
  await w.act({ action: 'activity.restore', id: record.id });
  assert.equal((await fs.lstat(path.join(w.configDir, 'skills/shared'))).isSymbolicLink(), true, '链接恢复');
  // Switching the Claude side writes Claude's own entry; the Codex side stays enabled.
  const again = await w.shared();
  await w.act({ action: 'skill.toggle', agent: 'claude', id: again.id, enabled: false, expectedRevision: again.revision });
  const after = await w.shared();
  assert.deepEqual([after.perAgent.claude.visibility, after.perAgent.codex.enabled], ['disabled', true]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(w.configDir, 'settings.json'), 'utf8')).skillOverrides, { shared: 'off' });
});

test('moving a shared real directory away is confirmed first, against the revision of both sides; version 1 keeps 0.10.2', async t => {
  const w = await world(t);
  const skill = await w.shared();
  assert.equal((await w.act({ action: 'skill.remove', agent: 'codex', id: skill.id })).code, 'SNAPSHOT_STALE', '2 版请求须带两侧共同的修订号');
  const ask = await w.act({ action: 'skill.remove', agent: 'codex', id: skill.id, expectedRevision: skill.revision });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules.map(rule => rule.kind), ['scope']);
  assert.match(ask.nativeRules[0].message, /Codex 与 Claude 中都会失去这个技能/);
  assert.ok(await exists(path.join(w.codexHome, 'skills/shared/SKILL.md')), '确认前不动');
  await w.act({ action: 'skill.remove', agent: 'codex', id: skill.id, expectedRevision: skill.revision, confirm: true });
  assert.equal(await exists(path.join(w.codexHome, 'skills/shared')), false);
  // Version 1: no agent, no revision, no confirmation (MR-SDX-001).
  const v1 = await world(t);
  const plain = (await v1.service.snapshot('local', true)).skills.find(item => item.name === 'shared');
  assert.match((await v1.act({ action: 'skill.remove', id: plain.id })).message, /已将 shared 移至可恢复区/);
  // Claude owns the real directory, Codex links to it: removing from the Claude side asks.
  const owned = await world(t, { claudeOwns: true });
  const own = await owned.shared();
  assert.equal(own.perAgent.claude.removeKind, 'directory');
  assert.equal((await owned.act({ action: 'skill.remove', agent: 'claude', id: own.id, expectedRevision: own.revision })).code, 'CONFIRMATION_REQUIRED');
});

test('updates: Codex leads; the other side follows the new content and the restore', async t => {
  const w = await world(t, { bothRoots: true });
  await skillFile(path.join(w.root, 'upstream'), 'shared');
  await w.link('codex', path.join(w.root, 'upstream/shared'));
  // Claude may record the same source; Codex still leads.
  await w.link('claude', path.join(w.root, 'upstream/shared'));
  let skill = await w.shared();
  assert.deepEqual([skill.perAgent.codex.canUpdate, skill.perAgent.claude.canUpdate], [true, false]);
  assert.match(skill.perAgent.claude.reason, /由 Codex 侧的来源记录管理/);
  await skillFile(path.join(w.root, 'upstream'), 'shared', 'v2\n');
  const check = await w.act({ action: 'skill.checkUpdate', agent: 'codex', id: skill.id, expectedRevision: skill.revision });
  assert.deepEqual(check.nativeRules.map(rule => rule.kind), ['scope'], '预览说明两侧都会变');
  const updated = await w.act({ action: 'skill.update', agent: 'codex', id: skill.id, expectedRevision: skill.revision, previewId: check.update.id });
  assert.match(updated.message, /已更新 shared/); assert.deepEqual(updated.nativeRules.map(rule => rule.kind), ['scope']);
  const real = await fs.realpath(path.join(w.root, 'common/skills/shared'));
  let registry = await w.registry();
  assert.equal(registry.claudeSources[real].fingerprint, registry.sources[skill.id].fingerprint, 'Claude 一侧的同源记录跟上新内容');
  const before = registry.claudeSources[real].fingerprint;
  const record = (await w.snapshot()).activity.find(item => item.action === 'skill.update');
  await w.act({ action: 'activity.restore', id: record.id });
  registry = await w.registry();
  assert.notEqual(registry.claudeSources[real].fingerprint, before, '恢复更新时 Claude 一侧的记录一并还原');
  assert.equal(registry.claudeSources[real].fingerprint, registry.sources[skill.id].fingerprint);
});

test('different sources on the two sides leave neither side able to update; linking a different source is a conflict', async t => {
  const w = await world(t, { bothRoots: true });
  await skillFile(path.join(w.root, 'first'), 'shared'); await skillFile(path.join(w.root, 'second'), 'shared');
  await w.link('codex', path.join(w.root, 'first/shared'));
  const conflict = await w.link('claude', path.join(w.root, 'second/shared'));
  assert.equal(conflict.code, 'SOURCE_CONFLICT'); assert.match(conflict.message, /另一侧（Codex）已关联到不同的来源/);
  // A record made otherwise (for example by a version-1 client) still leaves both unable, and says why.
  const registry = await w.registry(); const real = await fs.realpath(path.join(w.root, 'common/skills/shared'));
  registry.claudeSources = { [real]: { ...Object.values(registry.sources)[0], source: path.join(w.root, 'second/shared') } };
  await fs.writeFile(w.service.environments.local.registryFile, JSON.stringify(registry));
  const skill = await w.shared();
  assert.deepEqual([skill.canUpdate, skill.perAgent.codex.canUpdate, skill.perAgent.claude.canUpdate], [false, false, false]);
  assert.match(skill.reason, /不同的来源/);
});

test('a standalone skill whose content lies inside a plugin of the other side is confirmed with that plugin named', async t => {
  const w = await world(t, { codexIntoPlugin: true });
  const inner = (await w.snapshot()).skills.find(item => item.name === 'inner' && item.agents?.includes('codex'));
  assert.ok(inner, 'Codex 发现了插件目录中的技能');
  const ask = await w.act({ action: 'skill.remove', agent: 'codex', id: inner.id });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules[0].items, ['sd']);
  // Version 1 keeps 0.10.2: no prompt.
  assert.match((await w.act({ action: 'skill.remove', id: inner.id })).message, /已将 inner 移至可恢复区/);
});

test('batch removal of copies of a name: Claude copies in version 2, a shared directory confirmed first', async t => {
  const w = await world(t);
  // A Claude-only copy of the same name in the project.
  await skillFile(path.join(w.project, '.claude/skills'), 'shared');
  const group = (await w.snapshot()).skills.filter(item => item.name === 'shared');
  const shared = group.find(item => item.agents.length === 2); const copy = group.find(item => item.agents.join() === 'claude');
  assert.ok(shared && copy);
  // Version 1 cannot name a Claude object.
  assert.equal((await w.act({ action: 'skill.previewRemoval', groupName: 'shared', ids: [copy.id] })).code, 'INVALID_SELECTION');
  const preview = await w.act({ action: 'skill.previewRemoval', agent: 'codex', groupName: 'shared', ids: [copy.id] });
  assert.equal(preview.removalPreview.remove[0].id, copy.id); assert.equal(preview.nativeRules, undefined, '只移除 Claude 副本，不涉及另一侧');
  const done = await w.act({ action: 'skill.removeSelected', agent: 'codex', previewId: preview.removalPreview.id });
  assert.match(done.message, /已移除选中的 1 份同名技能/);
  assert.equal(await exists(path.join(w.project, '.claude/skills/shared')), false);
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.remove');
  assert.ok(record?.canRestore);
  await w.act({ action: 'activity.restore', id: record.id });
  assert.ok(await exists(path.join(w.project, '.claude/skills/shared/SKILL.md')), '按 Claude 一侧恢复');
  // Selecting the shared skill moves its real directory: the batch is confirmed first.
  const again = await w.act({ action: 'skill.previewRemoval', agent: 'codex', groupName: 'shared', ids: [shared.id] });
  assert.deepEqual(again.nativeRules.map(rule => rule.kind), ['scope']);
  const ask = await w.act({ action: 'skill.removeSelected', agent: 'codex', previewId: again.removalPreview.id });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED');
  assert.ok(await exists(path.join(w.codexHome, 'skills/shared/SKILL.md')), '确认前不动');
  await w.act({ action: 'skill.removeSelected', agent: 'codex', previewId: again.removalPreview.id, confirm: true });
  assert.equal(await exists(path.join(w.codexHome, 'skills/shared')), false);
});

test('the updates page meets the same rules as the card: the note, the revision, a conflict, the cross-side confirmation', async t => {
  const w = await world(t, { bothRoots: true });
  await skillFile(path.join(w.root, 'upstream'), 'shared');
  await w.link('codex', path.join(w.root, 'upstream/shared'));
  await skillFile(path.join(w.root, 'upstream'), 'shared', 'v2\n');
  let skill = await w.shared(); const target = { kind: 'skill', id: skill.id };
  const check = await w.act({ action: 'update.check', agent: 'codex', target, expectedRevision: skill.revision });
  assert.deepEqual(check.nativeRules?.map(rule => rule.kind), ['scope'], '更新页的检查同样说明两侧都会变');
  const previewId = check.updateItem.previewId;
  assert.equal((await w.act({ action: 'update.apply', agent: 'codex', target, previewId, expectedRevision: 'ffff' })).code, 'SNAPSHOT_STALE');
  assert.match((await w.act({ action: 'update.apply', agent: 'codex', target, previewId, expectedRevision: skill.revision })).message, /已更新 shared/);
  // Different sources on the two sides: neither the card nor the updates page checks or updates (4c review P2-02).
  const registry = await w.registry(); const real = await fs.realpath(path.join(w.root, 'common/skills/shared'));
  const own = { ...registry.claudeSources?.[real] ?? registry.sources[skill.id], source: path.join(w.root, 'elsewhere/shared') };
  registry.claudeSources = { [real]: own };
  await fs.writeFile(w.service.environments.local.registryFile, JSON.stringify(registry));
  skill = await w.shared();
  assert.equal((await w.act({ action: 'skill.checkUpdate', agent: 'codex', id: skill.id })).code, 'SOURCE_CONFLICT');
  assert.equal((await w.act({ action: 'update.check', agent: 'codex', target })).code, 'SOURCE_CONFLICT');
  // Version 1 keeps 0.10.2, and its update leaves the other side's different record alone.
  await skillFile(path.join(w.root, 'upstream'), 'shared', 'v3\n');
  const plain = await w.act({ action: 'skill.checkUpdate', id: skill.id });
  assert.equal(plain.update?.available, true);
  await w.act({ action: 'skill.update', id: skill.id, previewId: plain.update.id });
  assert.deepEqual((await w.registry()).claudeSources[real], own, '来源不同时不同步另一侧的记录');
  // Cross-side content from the updates page is confirmed with the plugin named.
  const v = await world(t, { codexIntoPlugin: true });
  const inner = (await v.snapshot()).skills.find(item => item.name === 'inner' && item.agents?.includes('codex'));
  await skillFile(path.join(v.root, 'up'), 'inner');
  const source = await v.act({ action: 'skill.previewSource', agent: 'codex', id: inner.id, sourceType: 'local', source: path.join(v.root, 'up/inner') });
  await v.act({ action: 'skill.connectSource', agent: 'codex', id: inner.id, previewId: source.sourcePreview.id });
  await skillFile(path.join(v.root, 'up'), 'inner', 'v2\n');
  const innerCheck = await v.act({ action: 'update.check', agent: 'codex', target: { kind: 'skill', id: inner.id } });
  const ask = await v.act({ action: 'update.apply', agent: 'codex', target: { kind: 'skill', id: inner.id }, previewId: innerCheck.updateItem.previewId });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules[0].items, ['sd']);
});

test('sources: a preview names the other side\'s source early; a link to the same directory is the same; a different subpath is not; a revision is needed', async t => {
  const w = await world(t, { bothRoots: true });
  await skillFile(path.join(w.root, 'first'), 'shared'); await skillFile(path.join(w.root, 'second'), 'shared');
  await fs.symlink(path.join(w.root, 'first'), path.join(w.root, 'alias'));
  await w.link('codex', path.join(w.root, 'first/shared'));
  const skill = await w.shared();
  const early = await w.act({ action: 'skill.previewSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, sourceType: 'local', source: path.join(w.root, 'second/shared') });
  assert.match(early.nativeRules?.[0]?.message ?? '', /另一侧（Codex）已关联到来源/);
  const sub = await w.act({ action: 'skill.previewSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, sourceType: 'local', source: path.join(w.root, 'first'), subpath: 'shared' });
  assert.equal((await w.act({ action: 'skill.connectSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, previewId: sub.sourcePreview.id })).code, 'SOURCE_CONFLICT', '子目录不同即冲突');
  const alias = await w.act({ action: 'skill.previewSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, sourceType: 'local', source: path.join(w.root, 'alias/shared') });
  assert.equal(alias.nativeRules, undefined, '经链接指向同一目录不算不同');
  const codexSide = await w.act({ action: 'skill.previewSource', agent: 'codex', id: skill.id, sourceType: 'local', source: path.join(w.root, 'first/shared') });
  assert.equal((await w.act({ action: 'skill.connectSource', agent: 'codex', id: skill.id, previewId: codexSide.sourcePreview.id })).code, 'SNAPSHOT_STALE', '共用技能的关联须带修订号');
  assert.match((await w.act({ action: 'skill.connectSource', agent: 'claude', id: skill.id, expectedRevision: skill.revision, previewId: alias.sourcePreview.id })).message, /已/);
});

test('removing a link that points into the other side\'s plugin needs no confirmation; a managed Claude side is not removed here', async t => {
  const w = await world(t, { codexLinkIntoPlugin: true });
  const inner = (await w.snapshot()).skills.find(item => item.name === 'inner' && item.agents?.includes('codex'));
  assert.equal(inner.removeKind, 'link');
  assert.match((await w.act({ action: 'skill.remove', agent: 'codex', id: inner.id })).message, /已将 inner 移至可恢复区/);
  assert.ok(await exists(path.join(w.configDir, 'skills/sd/skills/inner/SKILL.md')), '插件内容不变');
  const v = await world(t, { managed: { skillOverrides: { shared: 'off' } } });
  const skill = await v.shared();
  assert.deepEqual([skill.perAgent.claude.protection, skill.perAgent.claude.canRemove, skill.perAgent.claude.canUpdate], ['managed', false, false]);
});

test('Claude skill installation refuses the local scope before the source is staged', async t => {
  const w = await world(t);
  await skillFile(path.join(w.root, 'bad name'), 'bad name');
  assert.equal((await w.act({ action: 'skill.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'bad name/bad name'), scope: 'local' })).code, 'INVALID_ACTION');
});

test('batch removal checks each copy by its side, holds the Claude lock, and stops when a copy became shared after the preview', async t => {
  // Codex read-only; only Claude copies are removed (4c review P2-03).
  const w = await world(t, { codexReadOnly: true });
  await skillFile(path.join(w.configDir, 'skills'), 'dup'); await skillFile(path.join(w.project, '.claude/skills'), 'dup');
  const group = (await w.snapshot()).skills.filter(item => item.name === 'dup');
  const projectCopy = group.find(item => item.path.startsWith(w.project));
  // A source on the Claude copy is dropped with it and comes back with it.
  await skillFile(path.join(w.root, 'src'), 'dup');
  const source = await w.act({ action: 'skill.previewSource', agent: 'claude', id: projectCopy.id, expectedRevision: projectCopy.revision, sourceType: 'local', source: path.join(w.root, 'src/dup') });
  await w.act({ action: 'skill.connectSource', agent: 'claude', id: projectCopy.id, expectedRevision: projectCopy.revision, previewId: source.sourcePreview.id });
  const real = await fs.realpath(path.join(w.project, '.claude/skills/dup'));
  assert.ok((await w.registry()).claudeSources[real]);
  const preview = await w.act({ action: 'skill.previewRemoval', agent: 'codex', groupName: 'dup', ids: [projectCopy.id] });
  w.locks.length = 0;
  assert.match((await w.act({ action: 'skill.removeSelected', agent: 'codex', previewId: preview.removalPreview.id })).message, /已移除选中的 1 份同名技能/);
  assert.equal(w.locks.at(-1), true, '移动前在 Claude 锁下重读');
  assert.equal((await w.registry()).claudeSources[real], undefined);
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.remove');
  await w.act({ action: 'activity.restore', id: record.id });
  assert.ok((await w.registry()).claudeSources[real], '恢复时来源记录还原');
  // A copy that became shared after the preview stops the batch (4c review P2-04).
  const v = await world(t);
  await skillFile(path.join(v.codexHome, 'skills'), 'dup2'); await skillFile(path.join(v.configDir, 'skills'), 'dup2');
  const codexCopy = (await v.snapshot()).skills.find(item => item.name === 'dup2' && item.agents.join() === 'codex');
  const before = await v.act({ action: 'skill.previewRemoval', agent: 'codex', groupName: 'dup2', ids: [codexCopy.id] });
  assert.equal(before.nativeRules, undefined);
  await fs.mkdir(path.join(v.project, '.claude/skills'), { recursive: true });
  await fs.symlink(path.join(v.codexHome, 'skills/dup2'), path.join(v.project, '.claude/skills/dup2'));
  assert.equal((await v.snapshot()).skills.find(item => item.id === codexCopy.id).agents.join(), 'codex,claude', '预览之后变成共用');
  assert.equal((await v.act({ action: 'skill.removeSelected', agent: 'codex', previewId: before.removalPreview.id })).code, 'REMOVAL_CHANGED');
  assert.ok(await exists(path.join(v.codexHome, 'skills/dup2/SKILL.md')));
});

test('batch removal: content inside the other side\'s plugin is confirmed; version 1 asks nothing for a shared directory', async t => {
  const w = await world(t, { codexIntoPlugin: true });
  await skillFile(path.join(w.project, '.claude/skills'), 'inner');
  const inner = (await w.snapshot()).skills.find(item => item.name === 'inner' && item.agents?.includes('codex'));
  const preview = await w.act({ action: 'skill.previewRemoval', agent: 'codex', groupName: 'inner', ids: [inner.id] });
  assert.deepEqual(preview.nativeRules?.map(rule => rule.kind), ['affected-plugins']);
  assert.equal((await w.act({ action: 'skill.removeSelected', agent: 'codex', previewId: preview.removalPreview.id })).code, 'CONFIRMATION_REQUIRED');
  const v = await world(t);
  await skillFile(path.join(v.project, '.codex/skills'), 'shared');
  const shared = (await v.service.snapshot('local', true)).skills.find(item => item.name === 'shared' && item.path.startsWith(v.codexHome));
  const plain = await v.act({ action: 'skill.previewRemoval', groupName: 'shared', ids: [shared.id] });
  assert.equal(plain.nativeRules, undefined);
  assert.match((await v.act({ action: 'skill.removeSelected', previewId: plain.removalPreview.id })).message, /已移除选中的 1 份同名技能/);
});

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 5, `${messages.length}`);
  await assertTranslated(messages);
});
