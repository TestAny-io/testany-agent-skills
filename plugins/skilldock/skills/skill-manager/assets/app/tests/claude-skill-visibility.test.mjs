// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4b1: Claude skill visibility (HLD 3.4, DEC-SDX-006; API-SDX-001 36c §7.3): one entry
// of one settings file, patched in place. Claude's lists are stand-ins; settings files live in
// a temporary world.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { patchClaudeSetting } from '../server/claude-settings.mjs';
import { assertTranslated } from './i18n-helper.mjs';

const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason, ...(value?.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text); return value; };

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skill = (directory, name) => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`);
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-skills-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project'); const managedDir = path.join(root, 'managed');
  for (const name of ['u1', 'u2', 'u3', 'm1']) await skill(path.join(configDir, 'skills'), name);
  await skill(path.join(project, '.claude/skills'), 'p1');
  // The user's own settings: other keys and four-space indentation must survive a patch.
  await write(path.join(configDir, 'settings.json'), `{\n    "env": { "KEEP": "1" },\n    "skillOverrides": { "u2": "name-only" }\n}\n`);
  await write(path.join(managedDir, 'managed-settings.json'), { skillOverrides: { m1: 'off' } });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: false, error: 'stand-in' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir, listPlugins: async () => [], listMarketplaces: async () => [] },
    claudeWriter: () => async () => { throw new Error('no command line for skills'); },
    claudeGit: async () => { throw new Error('not a repository'); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const skills = async () => (await service.snapshot('local', true, { multiAgent: true })).skills.filter(item => item.agents?.includes('claude')).map(see);
  const find = async name => (await skills()).find(item => item.name === name);
  const act = request => service.action({ mode: 'local', agent: 'claude', ...request }).then(see, see);
  return { root, home, configDir, project, managedDir, service, skills, find, act };
}

test('a personal skill is switched in the user settings: only its entry changes, the file keeps its form', async t => {
  const w = await world(t);
  const u1 = await w.find('u1');
  assert.deepEqual([u1.canToggle, u1.visibility], [true, 'enabled']);
  assert.equal((await w.act({ action: 'skill.toggle', id: u1.id, enabled: false })).code, 'SNAPSHOT_STALE');
  const result = await w.act({ action: 'skill.toggle', id: u1.id, enabled: false, expectedRevision: u1.revision });
  assert.match(result.message, /已在用户设置中把 Claude 技能 u1 设为关闭/); assert.deepEqual([result.agent, result.needsReload], ['claude', true]);
  const text = await fs.readFile(path.join(w.configDir, 'settings.json'), 'utf8');
  assert.deepEqual(JSON.parse(text), { env: { KEEP: '1' }, skillOverrides: { u2: 'name-only', u1: 'off' } });
  assert.match(text, /^\{\n {4}"env"/); assert.ok(text.endsWith('}\n'), '保留缩进与结尾换行');
  assert.deepEqual([(await w.find('u1')).visibility, (await w.find('u1')).enabled], ['disabled', false]);
  const activity = (await w.service.snapshot('local', true, { multiAgent: true })).activity.find(item => item.agent === 'claude' && item.action === 'skill.toggle');
  assert.equal(activity.status, 'success'); assert.equal('restore' in activity, false, '撤销所需的旧值不进入快照');
});

test('a middle visibility is confirmed before it is replaced; a project skill goes to the local settings', async t => {
  const w = await world(t);
  const u2 = await w.find('u2');
  const ask = await w.act({ action: 'skill.toggle', id: u2.id, enabled: true, expectedRevision: u2.revision });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules.map(rule => rule.kind), ['visibility', 'reload']);
  assert.match(ask.nativeRules[0].message, /仅显示名称/);
  await w.act({ action: 'skill.toggle', id: u2.id, enabled: true, confirm: true, expectedRevision: u2.revision });
  assert.equal((await json(path.join(w.configDir, 'settings.json'))).skillOverrides.u2, 'on');
  const p1 = await w.find('p1');
  assert.equal(p1.scope, 'project');
  await w.act({ action: 'skill.toggle', id: p1.id, enabled: false, expectedRevision: p1.revision });
  assert.deepEqual(await json(path.join(w.project, '.claude/settings.local.json')), { skillOverrides: { p1: 'off' } });
  assert.equal((await w.find('p1')).visibility, 'disabled');
  // The shared project settings need confirmation.
  const again = await w.find('p1');
  assert.equal((await w.act({ action: 'skill.toggle', id: again.id, enabled: true, scope: 'project', expectedRevision: again.revision })).code, 'CONFIRMATION_REQUIRED');
});

test('when the project decides a personal skill, the local settings are written; managed settings lock it', async t => {
  const w = await world(t);
  await write(path.join(w.project, '.claude/settings.json'), { skillOverrides: { u3: 'off' } });
  const u3 = await w.find('u3');
  assert.deepEqual([u3.visibility, u3.enablement.decidedBy], ['disabled', 'project']);
  await w.act({ action: 'skill.toggle', id: u3.id, enabled: true, expectedRevision: u3.revision });
  assert.deepEqual(await json(path.join(w.project, '.claude/settings.local.json')), { skillOverrides: { u3: 'on' } });
  assert.deepEqual(await json(path.join(w.project, '.claude/settings.json')), { skillOverrides: { u3: 'off' } }, '共享设置不变');
  assert.equal((await w.find('u3')).visibility, 'enabled');
  // Asked to write the user settings anyway: the project still decides, and the readback says so.
  const now = await w.find('u3');
  const result = await w.act({ action: 'skill.toggle', id: now.id, enabled: false, scope: 'user', expectedRevision: now.revision });
  assert.equal(result.code, 'READBACK_FAILED');
  const m1 = await w.find('m1');
  assert.deepEqual([m1.canToggle, m1.protection], [false, 'managed']); assert.match(m1.reason, /组织托管设置决定/);
  assert.equal((await w.act({ action: 'skill.toggle', id: m1.id, enabled: true, expectedRevision: m1.revision })).code, 'HOST_MANAGED');
});

test('the settings patch: written through a link, refused for invalid JSON, stopped when the file changed meanwhile', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-settings-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const real = path.join(root, 'dotfiles/settings.json'); await write(real, '{\n  "a": 1\n}\n');
  const link = path.join(root, '.claude/settings.json'); await fs.mkdir(path.dirname(link)); await fs.symlink(real, link);
  const result = await patchClaudeSetting(link, 'skillOverrides', 'x', 'off');
  assert.deepEqual([result.previous, result.created, (await fs.lstat(link)).isSymbolicLink()], [undefined, false, true]);
  assert.deepEqual(await json(real), { a: 1, skillOverrides: { x: 'off' } });
  assert.equal((await patchClaudeSetting(link, 'skillOverrides', 'x', 'on')).previous, 'off');
  const broken = path.join(root, 'broken.json'); await write(broken, '{ not json');
  await assert.rejects(patchClaudeSetting(broken, 'skillOverrides', 'x', 'off'), error => see(error).code === 'SETTINGS_FORMAT');
  assert.equal(await fs.readFile(broken, 'utf8'), '{ not json');
  await assert.rejects(patchClaudeSetting(real, 'skillOverrides', 'x', 'off', { beforeCommit: () => fs.writeFile(real, '{"changed":true}') }), error => see(error).code === 'SNAPSHOT_STALE');
  assert.equal(await fs.readFile(real, 'utf8'), '{"changed":true}', 'Claude 的写入保留');
  assert.deepEqual((await fs.readdir(path.dirname(real))).filter(name => name.endsWith('.tmp')), [], '临时文件已清理');
  await assert.rejects(patchClaudeSetting(path.join(root, 'new.json'), 'skillOverrides', '__proto__', 'off'), { code: 'INVALID_SETTING' });
  const created = await patchClaudeSetting(path.join(root, 'new/settings.local.json'), 'skillOverrides', 'y', 'off');
  assert.equal(created.created, true); assert.equal(await fs.readFile(path.join(root, 'new/settings.local.json'), 'utf8'), '{\n  "skillOverrides": {\n    "y": "off"\n  }\n}\n');
});

test('every message, rule and reason seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 8, `${messages.length}`);
  await assertTranslated(messages);
});
