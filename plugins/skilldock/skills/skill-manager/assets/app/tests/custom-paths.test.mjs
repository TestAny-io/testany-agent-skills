import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.mjs';
import { CodexAdapter } from '../server/cli.mjs';
import { installationIdentity, sameInstallation } from '../server/installation.mjs';
import { resolveBackgroundSource, runBackground } from '../server/background-worker.mjs';
import { backgroundPaths } from '../server/background.mjs';
import { inspectTree, readJson, writeJson, exists } from '../server/files.mjs';
import { moveObject } from '../server/move.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';

const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
const skill = (directory, name = path.basename(directory), body = 'version one') => write(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Directory compatibility fixture\n---\n${body}\n`);
const empty = { plugins: [], marketplaces: [], diagnostics: [], cli: { available: true } };
const adapter = { list: async () => structuredClone(empty) };
const exdev = async () => { throw Object.assign(new Error('fixture cross-volume rename'), { code: 'EXDEV' }); };
async function fixture(t, { linkedSkills = false, linkedCache = false, crossVolume = false } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock 自定义 ')));
  const home = path.join(root, 'home'), codexHome = path.join(root, 'custom Codex'), stateDir = path.join(root, 'state');
  await fs.mkdir(home); await write(path.join(codexHome, 'config.toml'), '');
  const skills = path.join(codexHome, 'skills'), cache = path.join(codexHome, 'plugins/cache');
  for (const [directory, linked, target] of [[skills, linkedSkills, path.join(root, 'external skills')], [cache, linkedCache, path.join(root, 'external cache')]]) {
    await fs.mkdir(path.dirname(directory), { recursive: true }); await fs.mkdir(linked ? target : directory);
    if (linked) await fs.symlink(target, directory);
  }
  let now = Date.parse('2026-09-29T00:00:00Z');
  const options = { home, codexHome, stateDir, projectDir: home, scheduler: false, adapter, now: () => now, ...(crossVolume ? { moveRename: exdev } : {}) };
  const f = { root, home, codexHome, stateDir, skills, cache, options, services: [] };
  f.open = async () => { const service = await createService(options); f.services.push(service); f.service = service; return service; };
  f.act = (action, fields = {}) => f.service.action({ mode: 'local', action, ...fields });
  f.snapshot = () => f.service.snapshot('local');
  f.install = async (source, name) => { const { preview } = await f.act('skill.previewInstall', { sourceType: 'local', source, ...(name ? { name } : {}) }); await f.act('skill.install', { previewId: preview.id }); return (await f.snapshot()).skills.find(item => item.path === path.join(preview.target, 'SKILL.md')); };
  f.advance = () => { now += 16 * 60000; };
  t.after(async () => { for (const service of f.services) await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}

for (const crossVolume of [false, true]) test(`custom CODEX_HOME and linked skills root: install, toggle, update, remove and restore (${crossVolume ? 'cross-volume' : 'same-volume'})`, async t => {
  const f = await fixture(t, { linkedSkills: true, crossVolume }); await f.open();
  const source = path.join(f.root, 'source'); await skill(source, 'managed');
  const installed = await f.install(source); assert.ok(installed.canUpdate); assert.equal(installed.isLink, false);
  assert.equal(installed.realPath, path.join(f.root, 'external skills/managed/SKILL.md'));
  await f.act('skill.toggle', { id: installed.id, enabled: false });
  assert.equal((await f.snapshot()).skills.find(x => x.id === installed.id).enabled, false);
  assert.match(await fs.readFile(path.join(f.codexHome, 'config.toml'), 'utf8'), /external skills/);
  await skill(source, 'managed', 'version two');
  const { update } = await f.act('skill.checkUpdate', { id: installed.id }); await f.act('skill.update', { id: installed.id, previewId: update.id });
  assert.match(await fs.readFile(installed.path, 'utf8'), /version two/);
  const updateLog = (await f.snapshot()).activity.find(item => item.action === 'skill.update');
  await f.act('activity.restore', { id: updateLog.id }); assert.match(await fs.readFile(installed.path, 'utf8'), /version one/);
  await f.act('skill.remove', { id: installed.id }); assert.equal(await exists(path.dirname(installed.path)), false);
  const removal = (await f.snapshot()).activity.find(item => item.action === 'skill.remove');
  await f.act('activity.restore', { id: removal.id }); assert.match(await fs.readFile(installed.path, 'utf8'), /version one/);
  assert.equal(await exists(path.join(f.home, '.codex')), false, 'default home must not be created');
});

for (const relative of [false, true]) test(`external skill link: canonical toggle, link-only removal and restore (${relative ? 'relative' : 'absolute'})`, async t => {
  const f = await fixture(t, { crossVolume: true }); const target = path.join(f.root, 'shared/linked'); await skill(target, 'linked');
  const alias = path.join(f.skills, 'linked'), link = relative ? path.relative(f.skills, target) : target; await fs.symlink(link, alias);
  await f.open(); const item = (await f.snapshot()).skills.find(x => x.name === 'linked');
  assert.equal(item.removeKind, 'link'); assert.equal(item.realPath, path.join(target, 'SKILL.md')); assert.equal(item.canUpdate, false);
  await f.act('skill.toggle', { id: item.id, enabled: false }); assert.equal((await f.snapshot()).skills.find(x => x.id === item.id).enabled, false);
  const before = await inspectTree(target);
  const update = (await f.act('update.check', { target: { kind: 'skill', id: item.id } })).updateItem; assert.equal(update.route, 'owner-managed');
  await f.act('skill.remove', { id: item.id }); assert.equal(await exists(alias), false); assert.equal((await inspectTree(target)).fingerprint, before.fingerprint);
  const removal = (await f.snapshot()).activity.find(x => x.action === 'skill.remove'); await f.act('activity.restore', { id: removal.id });
  assert.equal(await fs.readlink(alias), link); assert.equal((await inspectTree(target)).fingerprint, before.fingerprint); assert.ok((await f.snapshot()).skills.find(x => x.id === item.id));
});

test('retargeting an already discovered skill link is visible and cannot gain write access', async t => {
  const f = await fixture(t); const a = path.join(f.root, 'a'), b = path.join(f.root, 'b'); await skill(a, 'same'); await skill(b, 'same');
  const alias = path.join(f.skills, 'shortcut'); await fs.symlink(a, alias); await f.open(); const item = (await f.snapshot()).skills.find(x => x.name === 'same');
  await fs.unlink(alias); await fs.symlink(b, alias);
  const state = await f.snapshot(); assert.equal(state.skills.some(x => x.id === item.id), false); assert.ok(state.diagnostics.some(x => x.includes('链接或其目标在运行中发生变化')));
  await assert.rejects(f.act('skill.remove', { id: item.id }), { code: 'NOT_FOUND' }); assert.ok(await exists(path.join(b, 'SKILL.md')));
});

test('linked collections remain visible without making their individual target folders removable', async t => {
  const f = await fixture(t); const collection = path.join(f.root, 'collection'); await skill(path.join(collection, 'nested'), 'nested');
  await fs.symlink(collection, path.join(f.skills, 'collection')); await f.open();
  const item = (await f.snapshot()).skills.find(x => x.name === 'nested'); assert.ok(item.canToggle); assert.equal(item.canRemove, false); assert.equal(item.canUpdate, false);
  await f.act('skill.toggle', { id: item.id, enabled: false }); await assert.rejects(f.act('skill.remove', { id: item.id }), { code: 'PROTECTED_SKILL' });
});

test('skill-file escapes, dangling links and link cycles do not become writable skills', async t => {
  const f = await fixture(t); const outside = path.join(f.root, 'outside'); await skill(outside, 'outside');
  await fs.mkdir(path.join(f.skills, 'entry')); await fs.symlink(path.join(outside, 'SKILL.md'), path.join(f.skills, 'entry/SKILL.md'));
  await fs.symlink('absent', path.join(f.skills, 'broken')); await fs.symlink(f.skills, path.join(f.skills, 'cycle'));
  await f.open(); const state = await f.snapshot(); assert.equal(state.skills.some(x => x.name === 'outside'), false); assert.ok(state.diagnostics.length >= 2);
});

test('moved plugin cache cannot be claimed as a personal root for installation or removal', async t => {
  const f = await fixture(t, { linkedCache: true }); const plugin = path.join(f.cache, 'market/demo/1.0.0'); await skill(path.join(plugin, 'skills/protected'), 'protected');
  await fs.mkdir(path.join(f.home, '.agents'), { recursive: true }); await fs.symlink(path.join(plugin, 'skills'), path.join(f.home, '.agents/skills'));
  await f.open(); const item = (await f.snapshot()).skills.find(x => x.name === 'protected'); assert.equal(item.canRemove, false); assert.equal(item.canUpdate, false);
  await f.service.close(); await fs.rm(f.skills, { recursive: true }); await fs.symlink(path.join(plugin, 'skills'), f.skills); await f.open();
  const source = path.join(f.root, 'source'); await skill(source, 'injected');
  await assert.rejects(f.install(source), { code: 'TARGET_BOUNDARY' }); assert.equal(await exists(path.join(plugin, 'skills/injected')), false);
});

test('project outside home discovers ancestors through Git root, including worktree .git files, but stops there', async t => {
  const f = await fixture(t), parent = path.join(f.root, 'external'), repo = path.join(parent, 'repository'), child = path.join(repo, 'packages/api');
  await fs.mkdir(child, { recursive: true }); await write(path.join(repo, '.git'), 'gitdir: /fixture/worktrees/api\n');
  await skill(path.join(parent, '.agents/skills/too-high'), 'too-high'); await skill(path.join(repo, '.agents/skills/repo'), 'repo'); await skill(path.join(child, '.agents/skills/child'), 'child');
  f.options.projectDir = child; await f.open();
  let names = (await f.snapshot()).skills.map(x => x.name); assert.ok(names.includes('repo') && names.includes('child')); assert.ok(!names.includes('too-high'));
  const other = path.join(parent, 'non-repository'); await fs.mkdir(other); await f.act('project.select', { projectDir: other });
  names = (await f.snapshot()).skills.map(x => x.name); assert.ok(!names.includes('repo') && !names.includes('too-high'));
});

async function pluginFixture(t) {
  const f = await fixture(t, { linkedCache: true }), market = path.join(f.root, 'external marketplace'), source = path.join(market, 'packages/demo');
  await writeJson(path.join(market, '.agents/plugins/marketplace.json'), { name: 'fixture', plugins: [{ name: 'demo', source: './packages/demo' }] });
  await writeJson(path.join(source, '.codex-plugin/plugin.json'), { name: 'demo', version: '1.0.0', skills: './custom-skills' }); await skill(path.join(source, 'custom-skills/example'), 'example');
  const installed = path.join(f.cache, 'fixture/demo/1.0.0'); await fs.mkdir(path.dirname(installed), { recursive: true }); await fs.cp(source, installed, { recursive: true });
  let version = '1.0.0'; let present = true; const commands = [];
  const cli = new CodexAdapter({ codexHome: f.codexHome }); cli.probe = async () => (cli.info = { available: true, path: 'fixture' });
  cli.command = async args => {
    if (args[1] === 'add') { commands.push(args); version = (await readJson(path.join(source, '.codex-plugin/plugin.json'))).version; await fs.cp(source, path.join(f.cache, 'fixture/demo', version), { recursive: true }); present = true; return {}; }
    if (args[1] === 'remove') { commands.push(args); present = false; return {}; }
    if (args[1] === 'marketplace') return { marketplaces: [{ name: 'fixture', root: market, marketplaceSource: { sourceType: 'local', source: market } }] };
    return { installed: present ? [{ name: 'demo', pluginId: 'demo@fixture', marketplaceName: 'fixture', version, enabled: true, source: { source: 'local', path: source } }] : [], available: [] };
  };
  f.options.adapter = cli; await f.open();
  return Object.assign(f, { source, installed, commands, target: { kind: 'plugin', id: 'demo@fixture' } });
}

test('external marketplace and linked cache support package updates and retain individual skill toggles', async t => {
  const f = await pluginFixture(t); const item = (await f.snapshot()).skills.find(x => x.name === 'example'); await f.act('skill.toggle', { id: item.id, enabled: false });
  assert.equal((await f.act('update.check', { target: f.target })).updateItem.status, 'current');
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'demo', version: '1.0.1', skills: './custom-skills' });
  await skill(path.join(f.source, 'custom-skills/example'), 'example', 'version two');
  const preview = (await f.act('update.check', { target: f.target })).updateItem;
  await f.act('update.apply', { target: f.target, previewId: preview.previewId });
  const updated = (await f.snapshot()).skills.find(x => x.pluginId === f.target.id && x.scope === 'plugin'); assert.equal(updated.version, '1.0.1'); assert.equal(updated.enabled, false);
  assert.match(updated.realPath, /external cache/); assert.match(await fs.readFile(updated.path, 'utf8'), /version two/); assert.equal(f.commands.length, 1);
});

test('a cache root retarget after startup stops plugin writes', async t => {
  const f = await pluginFixture(t); const destination = path.join(f.root, 'other-cache'); await fs.mkdir(destination);
  await fs.unlink(f.cache); await fs.symlink(destination, f.cache);
  await assert.rejects(f.act('update.check', { target: f.target }), { code: 'ROOT_BOUNDARY' });
  assert.deepEqual(f.commands, []); assert.deepEqual(await fs.readdir(destination), []);
});

test('headless scheduled update uses saved custom CODEX_HOME and linked skills root after the GUI closes', async t => {
  const f = await fixture(t, { linkedSkills: true }); await f.open(); const source = path.join(f.root, 'source'); await skill(source, 'scheduled'); const item = await f.install(source);
  await f.act('schedule.configure', { schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [{ kind: 'skill', id: item.id }] } });
  const file = path.join(f.stateDir, 'local/updates.json'), saved = await readJson(file); saved.schedule.nextRunAt = new Date(Date.now() - 60000).toISOString(); await writeJson(file, saved);
  await skill(source, 'scheduled', 'headless version two'); await f.service.close();
  const app = fileURLToPath(new URL('../', import.meta.url));
  await runBackground({ ...f.options, projectDir: f.home, source: app, runtime: app, installation: { kind: 'directory', source: app }, digest: (await captureSource(app)).sourceDigest }, { adapter });
  assert.match(await fs.readFile(item.path, 'utf8'), /headless version two/);
  const status = await readJson(backgroundPaths(f.stateDir, f.home).status); assert.equal(status.error, undefined); assert.equal(status.outcome, 'success');
});

test('self-update and background source identity follow a linked cache across versions', async t => {
  const f = await fixture(t, { linkedCache: true });
  const locations = {};
  for (const version of ['0.9.0', '0.9.1']) {
    const plugin = path.join(f.cache, 'fixture/skilldock', version); await writeJson(path.join(plugin, '.codex-plugin/plugin.json'), { name: 'skilldock', version });
    locations[version] = path.join(plugin, 'skills/skill-manager/assets/app'); await fs.mkdir(locations[version], { recursive: true });
  }
  const identity = await installationIdentity(locations['0.9.0'], f.codexHome); assert.equal(identity.kind, 'plugin');
  assert.ok(sameInstallation(identity, await installationIdentity(await fs.realpath(locations['0.9.1']), f.codexHome)));
  const context = { codexHome: f.codexHome, source: await fs.realpath(locations['0.9.0']), installation: identity };
  const catalog = { list: async () => ({ ...empty, plugins: [{ id: 'skilldock@fixture', installed: true, enabled: true, version: '0.9.1' }] }) };
  assert.equal(await resolveBackgroundSource(context, catalog), locations['0.9.1']);
  await fs.rm(path.join(f.cache, 'fixture/skilldock/0.9.0'), { recursive: true });
  assert.ok(sameInstallation(identity, await installationIdentity(context.source, f.codexHome, { expected: identity })));
});

test('cross-volume move does not overwrite an occupied destination or delete a changing source', async t => {
  const f = await fixture(t); const from = path.join(f.root, 'from'), to = path.join(f.root, 'to'); await skill(from, 'from'); await skill(to, 'to');
  await assert.rejects(moveObject(from, to, { rename: exdev }), { code: 'TARGET_EXISTS' });
  assert.match(await fs.readFile(path.join(from, 'SKILL.md'), 'utf8'), /name: from/); assert.match(await fs.readFile(path.join(to, 'SKILL.md'), 'utf8'), /name: to/);
  await fs.rm(to, { recursive: true }); let calls = 0;
  await assert.rejects(moveObject(from, to, { rename: exdev, guard: async () => { if (++calls === 3) await skill(from, 'from', 'concurrent edit'); } }), { code: 'SOURCE_CHANGED' });
  assert.match(await fs.readFile(path.join(from, 'SKILL.md'), 'utf8'), /concurrent edit/); assert.equal(await exists(to), false);
});

test('cross-volume recovery copies include Git metadata, link text and executable permissions', async t => {
  const f = await fixture(t); const from = path.join(f.root, 'from'), to = path.join(f.root, 'to'); await skill(from, 'from');
  await write(path.join(from, '.git/HEAD'), 'ref: refs/heads/main\n');
  await write(path.join(from, 'run.sh'), '#!/bin/sh\n'); await fs.chmod(path.join(from, 'run.sh'), 0o755);
  await fs.symlink('SKILL.md', path.join(from, 'entry'));
  await moveObject(from, to, { rename: exdev });
  assert.equal(await exists(from), false); assert.equal(await fs.readFile(path.join(to, '.git/HEAD'), 'utf8'), 'ref: refs/heads/main\n');
  assert.equal(await fs.readlink(path.join(to, 'entry')), 'SKILL.md'); assert.equal((await fs.stat(path.join(to, 'run.sh'))).mode & 0o777, 0o755);
  await moveObject(to, from, { rename: exdev }); assert.ok(await exists(path.join(from, 'SKILL.md')));
});

test('cross-volume verification detects changes to metadata excluded from import previews', async t => {
  const f = await fixture(t); const from = path.join(f.root, 'from'), to = path.join(f.root, 'to'); await skill(from, 'from');
  await write(path.join(from, '.git/HEAD'), 'ref: refs/heads/main\n'); let calls = 0;
  await assert.rejects(moveObject(from, to, { rename: exdev, guard: async () => { if (++calls === 3) await write(path.join(from, '.git/HEAD'), 'ref: refs/heads/work\n'); } }), { code: 'SOURCE_CHANGED' });
  assert.equal(await fs.readFile(path.join(from, '.git/HEAD'), 'utf8'), 'ref: refs/heads/work\n'); assert.equal(await exists(to), false);
});
