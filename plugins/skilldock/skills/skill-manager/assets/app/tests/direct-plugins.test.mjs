import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { readJson, writeJson, inspectTree } from '../server/files.mjs';
import { runProcess } from '../server/cli.mjs';

async function fixture(t, extra = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-direct-')));
  const options = { stateDir: root, enableTestSandbox: true, scheduler: false, background: false, home: root, projectDir: root, codexHome: path.join(root, '.codex'), ...extra };
  const service = await createService(options);
  const env = service.environments.sandbox, source = path.join(env.root, 'single-plugin');
  await fs.mkdir(path.join(source, 'skills/hello'), { recursive: true });
  await fs.writeFile(path.join(source, 'skills/hello/SKILL.md'), '---\nname: hello\ndescription: A direct install fixture\n---\nHello\n');
  await writeJson(path.join(source, '.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.0.0', description: 'One plugin, no marketplace.' });
  const act = (action, fields = {}) => service.action({ mode: 'sandbox', action, ...fields });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const preview = (sourceType = 'local', extra = {}) => act('plugin.previewInstall', { sourceType, source, ...extra });
  const install = async (sourceType = 'local', extra) => { const p = (await preview(sourceType, extra)).pluginPreview; await act('plugin.installSource', { previewId: p.id }); return (await service.snapshot('sandbox')).plugins.find(item => item.name === 'single-plugin' && item.installed); };
  return { root, source, service, options, env, act, preview, install };
}

test('direct plugin preview has no install side effects; install includes only the selected plugin and records its source', async t => {
  const f = await fixture(t), before = await f.service.snapshot('sandbox'), sourceTree = await inspectTree(f.source);
  const preview = (await f.preview()).pluginPreview;
  assert.equal(preview.name, 'single-plugin'); assert.deepEqual(preview.skills, ['hello']); assert.equal(preview.version, '1.0.0');
  assert.equal((await f.service.snapshot('sandbox')).marketplaces.length, before.marketplaces.length);
  const plugin = await f.install(); assert.ok(plugin); assert.equal(plugin.directSource.source, f.source); assert.equal(plugin.skillCount, 1);
  assert.equal((await inspectTree(plugin.sourcePath)).fingerprint, sourceTree.fingerprint);
  const registry = await readJson(f.env.registryFile); assert.equal(registry.directPlugins[plugin.marketplace].source, f.source);
  await assert.rejects(f.preview(), { code: 'PLUGIN_ALREADY_INSTALLED' });
  await f.act('plugin.remove', { id: plugin.id }); assert.equal((await f.service.snapshot('sandbox')).plugins.find(item => item.id === plugin.id).installed, false);
});

test('direct local plugin checks refresh the source, preview diffs, update all included skills and preserve disabled state', async t => {
  const f = await fixture(t), plugin = await f.install(), target = { kind: 'plugin', id: plugin.id };
  await f.act('plugin.toggle', { id: plugin.id, enabled: false });
  assert.equal((await f.act('update.check', { target })).updateItem.status, 'current');
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.0.1' });
  await fs.appendFile(path.join(f.source, 'skills/hello/SKILL.md'), 'New content\n');
  const update = (await f.act('update.check', { target })).updateItem; assert.equal(update.status, 'available'); assert.ok(update.changes.some(item => item.path === 'skills/hello/SKILL.md'));
  await f.act('update.apply', { target, previewId: update.previewId });
  const after = (await f.service.snapshot('sandbox')).plugins.find(item => item.id === plugin.id); assert.equal(after.version, '1.0.1'); assert.equal(after.enabled, false);
  assert.match(await fs.readFile(path.join(after.sourcePath, 'skills/hello/SKILL.md'), 'utf8'), /New content/);
});

test('direct Git plugin keeps source identity through scheduled updates and service restart', async t => {
  let time = Date.parse('2026-09-24T00:00:00Z');
  const f = await fixture(t, { now: () => time }), repo = path.join(f.env.root, 'plugin-repo');
  await fs.mkdir(repo); await fs.cp(f.source, path.join(repo, 'plugins/single-plugin'), { recursive: true });
  const git = args => runProcess('git', ['-C', repo, ...args]);
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']); await git(['add', '.']); await git(['commit', '-m', 'initial']);
  const plugin = await f.install('git', { source: repo, subpath: 'plugins/single-plugin', ref: 'main' });
  assert.equal(plugin.directSource.ref, 'main'); assert.equal(plugin.directSource.subpath, 'plugins/single-plugin'); assert.match(plugin.directSource.commit, /^[a-f0-9]{40}$/);
  await writeJson(path.join(repo, 'plugins/single-plugin/.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.1.0' }); await git(['add', '.']); await git(['commit', '-m', 'update']);
  assert.equal(plugin.sourceInfo.sourceType, 'git'); assert.equal(plugin.sourceInfo.source, repo);
  await f.act('schedule.configure', { schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [{ kind: 'plugin', id: plugin.id }] } });
  time += 16 * 60000; await f.service.tickScheduler();
  let state = await f.service.snapshot('sandbox');
  assert.equal(state.updateRuns[0].status, 'success'); assert.equal(state.plugins.find(item => item.id === plugin.id).version, '1.1.0');
  await f.service.close();
  const restarted = await createService(f.options);
  try {
    await writeJson(path.join(repo, 'plugins/single-plugin/.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.2.0' }); await git(['add', '.']); await git(['commit', '-m', 'next update']);
    time += 16 * 60000; await restarted.tickScheduler(); state = await restarted.snapshot('sandbox');
    assert.equal(state.updateRuns[0].status, 'success'); assert.equal(state.plugins.find(item => item.id === plugin.id).version, '1.2.0');
    time += 16 * 60000; await restarted.tickScheduler(); state = await restarted.snapshot('sandbox');
    assert.equal(state.updateRuns[0].items[0].status, 'current');
  } finally { await restarted.close(); }
});

test('source mutations, missing manifests, multiple authorities and external symlinks cannot install', async t => {
  const f = await fixture(t), preview = (await f.preview()).pluginPreview;
  await fs.appendFile(path.join(f.source, 'skills/hello/SKILL.md'), 'edited');
  await assert.rejects(f.act('plugin.installSource', { previewId: preview.id }), { code: 'SOURCE_CHANGED' });
  await writeJson(path.join(f.source, '.claude-plugin/plugin.json'), { name: 'other', version: '1.0.0' }); await assert.rejects(f.preview(), { code: 'PLUGIN_MANIFEST_REQUIRED' });
  await fs.rm(path.join(f.source, '.claude-plugin'), { recursive: true }); await fs.symlink(f.env.root, path.join(f.source, 'outside')); await assert.rejects(f.preview(), { code: 'OUTSIDE_SOURCE' });
  await fs.rm(path.join(f.source, 'outside')); await fs.rm(path.join(f.source, '.codex-plugin'), { recursive: true }); await assert.rejects(f.preview(), { code: 'PLUGIN_MANIFEST_REQUIRED' });
});

test('a removed direct plugin can be installed again after its source publishes a new version', async t => {
  const f = await fixture(t), first = await f.install();
  await f.act('plugin.remove', { id: first.id });
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.1.0' });
  const reinstalled = await f.install();
  assert.equal(reinstalled.id, first.id); assert.equal(reinstalled.version, '1.1.0');
});

test('direct plugin preview lists declared components outside default directories without running them', async t => {
  const f = await fixture(t);
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'single-plugin', version: '1.0.0', commands: './actions/', agents: './assistants/', hooks: './my-hooks.json', mcpServers: './servers.json', apps: './connections.json' });
  const preview = (await f.preview()).pluginPreview;
  assert.deepEqual(preview.components, ['commands', 'agents', 'hooks', 'mcp', 'apps']);
  assert.equal((await f.service.snapshot('sandbox')).plugins.some(item => item.name === 'single-plugin' && item.installed), false);
});
