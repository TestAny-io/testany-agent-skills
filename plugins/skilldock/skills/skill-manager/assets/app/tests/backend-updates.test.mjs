import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService, compareVersions, validateAction } from '../server/service.mjs';
import { createScheduler } from '../server/scheduler.mjs';
import { captureDirectoryRoot, inspectTree, readJson, writeJson, identity } from '../server/files.mjs';
import { runProcess, CodexAdapter } from '../server/cli.mjs';
import { parseConfig } from '../server/config.mjs';

const act = (service, action, fields = {}, mode = 'sandbox') => service.action({ mode, action, ...fields });
async function fixture(t, extra = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-updates-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(home, 'project');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir); await fs.writeFile(path.join(codexHome, 'config.toml'), '# local sentinel\n');
  const options = { enableTestSandbox: true, home, codexHome, projectDir, stateDir: path.join(root, 'state'), adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) }, scheduler: false, ...extra };
  const service = await createService(options);
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, options, service };
}
const schedule = (targets, fields = {}) => ({ enabled: true, intervalMinutes: 15, timezone: 'Asia/Shanghai', autoApply: true, targets, ...fields });
const skillTarget = skill => ({ kind: 'skill', id: skill.id });
async function sourceVersion(directory, version, body = version) {
  const manifest = path.join(directory, '.codex-plugin/plugin.json'); const value = await readJson(manifest); value.version = version; await writeJson(manifest, value);
  await fs.appendFile(path.join(directory, 'skills/starter-tools-review/SKILL.md'), `\n${body}\n`);
}

test('existing skills expose tracked, system and unknown provenance; source confirmation checks both fingerprints and later relinking invalidates old updates', async t => {
  const { service } = await fixture(t); const env = service.environments.sandbox; let state = await service.snapshot('sandbox');
  const regular = state.skills.find(s => s.name === 'api-notes'); const system = state.skills.find(s => s.scope === 'system');
  assert.equal(regular.sourceInfo.kind, 'unknown'); assert.equal(system.sourceInfo.kind, 'system'); assert.match(system.sourceInfo.helpUrl, /learn.chatgpt.com/);
  assert.equal(state.schedule.enabled, false); assert.equal(state.updates.find(i => i.target.id === regular.id).route, 'connect-source');
  const source = state.examples.legacySource; const original = await fs.readFile(regular.path, 'utf8');
  let preview = (await act(service, 'skill.previewSource', { id: regular.id, sourceType: 'local', source })).sourcePreview;
  await fs.appendFile(regular.path, '\nnew local edit');
  await assert.rejects(act(service, 'skill.connectSource', { id: regular.id, previewId: preview.id }), { code: 'LOCAL_CHANGES' });
  await fs.writeFile(regular.path, original);
  preview = (await act(service, 'skill.previewSource', { id: regular.id, sourceType: 'local', source })).sourcePreview;
  await fs.appendFile(path.join(source, 'SKILL.md'), '\nsource edit');
  await assert.rejects(act(service, 'skill.connectSource', { id: regular.id, previewId: preview.id }), { code: 'SOURCE_CHANGED' });
  preview = (await act(service, 'skill.previewSource', { id: regular.id, sourceType: 'local', source })).sourcePreview;
  await act(service, 'skill.connectSource', { id: regular.id, previewId: preview.id }); assert.equal(await fs.readFile(regular.path, 'utf8'), original);
  let check = (await act(service, 'update.check', { target: skillTarget(regular) })).updateItem; assert.equal(check.status, 'available'); assert.equal(check.canAutoApply, true);
  const other = path.join(env.root, 'sources/other-api'); await fs.cp(source, other, { recursive: true });
  preview = (await act(service, 'skill.previewSource', { id: regular.id, sourceType: 'local', source: other })).sourcePreview;
  await act(service, 'skill.connectSource', { id: regular.id, previewId: preview.id });
  await assert.rejects(act(service, 'update.apply', { target: skillTarget(regular), previewId: check.previewId }), { code: 'SOURCE_RELINKED' });
  check = (await act(service, 'update.check', { target: skillTarget(regular) })).updateItem;
  await act(service, 'update.apply', { target: skillTarget(regular), previewId: check.previewId });
  assert.equal((await service.snapshot('sandbox')).skills.find(s => s.id === regular.id).sourceInfo.confidence, 'user-confirmed');
  assert.equal((await act(service, 'update.check', { target: skillTarget(regular) })).updateItem.status, 'current');
});

test('plugin update preserves disabled state, reports true installed version/path, protects same-version and downgrade changes', async t => {
  const { service } = await fixture(t); const id = 'starter-tools@starter-market'; const target = { kind: 'plugin', id };
  await act(service, 'plugin.install', { id }); await act(service, 'plugin.toggle', { id, enabled: false });
  let state = await service.snapshot('sandbox'); const source = state.plugins.find(p => p.id === id).sourceInfo.source;
  await sourceVersion(source, '2.0.0'); state = await service.snapshot('sandbox');
  assert.equal(state.plugins.find(p => p.id === id).version, '1.0.0');
  assert.ok(state.updates.find(i => i.target.id === id).installedPath.endsWith('/starter-tools/1.0.0'));
  const check = (await act(service, 'update.check', { target })).updateItem; assert.equal(check.status, 'available'); assert.equal(check.canAutoApply, true);
  const diff = (await act(service, 'preview.diff', { previewId: check.previewId, path: 'skills/starter-tools-review/SKILL.md' })).diff;
  assert.equal(diff.status, 'text'); assert.ok(diff.hunks.flatMap(hunk => hunk.lines).some(line => line.kind === 'added' && line.content === '2.0.0'));
  assert.equal((await service.snapshot('sandbox')).plugins.find(p => p.id === id).version, '1.0.0', 'reading diff does not update the plugin');
  await act(service, 'update.apply', { target, previewId: check.previewId }); state = await service.snapshot('sandbox');
  assert.equal(state.plugins.find(p => p.id === id).version, '2.0.0'); assert.equal(state.plugins.find(p => p.id === id).enabled, false);
  assert.equal(parseConfig(await fs.readFile(state.paths.config, 'utf8')).plugins[id].enabled, false);
  assert.equal((await act(service, 'update.check', { target })).updateItem.status, 'current');
  await sourceVersion(source, '2.0.0', 'same version changed');
  assert.equal((await act(service, 'update.check', { target })).updateItem.reasonCode, 'VERSION_UNCHANGED');
  await sourceVersion(source, '1.9.0');
  assert.equal((await act(service, 'update.check', { target })).updateItem.reasonCode, 'DOWNGRADE_BLOCKED');
  await sourceVersion(source, 'release-next');
  const opaque = (await act(service, 'update.check', { target })).updateItem; assert.equal(opaque.canApply, true); assert.equal(opaque.canAutoApply, false);
});

test('scheduler persists static bindings, runs while no browser exists, skips replaced installs and refreshes own update bindings', async t => {
  let time = Date.parse('2026-09-14T00:00:00Z'); const { service, options } = await fixture(t, { now: () => time });
  const writing = (await service.snapshot('sandbox')).skills.find(s => s.name === 'writing-assistant'); const target = skillTarget(writing);
  await act(service, 'schedule.configure', { schedule: schedule([target]) });
  assert.equal((await service.snapshot('local')).schedule.enabled, false);
  time += 16 * 60000; await service.tickScheduler(); let state = await service.snapshot('sandbox');
  assert.equal(state.updateRuns[0].items[0].status, 'updated'); assert.equal(state.schedule.nextRunAt, new Date(time + 15 * 60000).toISOString());
  time += 16 * 60000; await service.tickScheduler(); state = await service.snapshot('sandbox'); assert.equal(state.updateRuns[0].items[0].status, 'current', 'own update refreshes directory binding');
  const held = `${path.dirname(writing.path)}-held`; await fs.rename(path.dirname(writing.path), held); await fs.cp(held, path.dirname(writing.path), { recursive: true });
  time += 16 * 60000; await service.tickScheduler(); state = await service.snapshot('sandbox'); assert.equal(state.updateRuns[0].items[0].reasonCode, 'TARGET_BINDING_CHANGED');
  await service.close(); time += 60 * 60000;
  const restarted = await createService(options); t.after(() => restarted.close()); await restarted.tickScheduler();
  state = await restarted.snapshot('sandbox'); assert.equal(state.updateRuns[0].trigger, 'catch-up'); const count = state.updateRuns.length;
  await restarted.tickScheduler(); assert.equal((await restarted.snapshot('sandbox')).updateRuns.length, count, 'overdue catches up once');
  assert.equal(state.schedule.targets.length, 1);
});

test('failed schedule persistence cannot enable a latent plan when the obstacle is removed', async t => {
  let time = Date.now(); const { service } = await fixture(t, { now: () => time }); const env = service.environments.sandbox;
  const writing = (await service.snapshot('sandbox')).skills.find(s => s.canUpdate); const before = await inspectTree(path.dirname(writing.path));
  const file = path.join(env.root, 'updates.json'); await fs.mkdir(file);
  await assert.rejects(act(service, 'schedule.configure', { schedule: schedule([skillTarget(writing)]) }));
  assert.equal((await service.snapshot('sandbox')).schedule.enabled, false);
  await fs.rm(file, { recursive: true }); time += 16 * 60000; await service.tickScheduler();
  const state = await service.snapshot('sandbox'); assert.equal(state.updateRuns.length, 0); assert.equal((await inspectTree(path.dirname(writing.path))).fingerprint, before.fingerprint);
});

test('source re-association invalidates an already saved schedule target even if installed files are identical', async t => {
  let time = Date.now(); const { service } = await fixture(t, { now: () => time }); let state = await service.snapshot('sandbox');
  const writing = state.skills.find(s => s.canUpdate); const target = skillTarget(writing); await act(service, 'schedule.configure', { schedule: schedule([target]) });
  const preview = (await act(service, 'skill.previewSource', { id: writing.id, sourceType: 'local', source: writing.sourceInfo.source })).sourcePreview;
  await act(service, 'skill.connectSource', { id: writing.id, previewId: preview.id }); time += 16 * 60000; await service.tickScheduler();
  state = await service.snapshot('sandbox'); assert.equal(state.updateRuns[0].items[0].reasonCode, 'TARGET_BINDING_CHANGED');
});

test('a persisted interrupted run is marked unconfirmed and never blindly replays its apply', async t => {
  const { service, options } = await fixture(t); const env = service.environments.sandbox; await service.close();
  await writeJson(path.join(env.root, 'updates.json'), { version: 1, schedule: { ...schedule([], { enabled: false }), running: true }, bindings: {}, observations: {}, activity: [], runs: [{ id: 'interrupted', trigger: 'scheduled', startedAt: new Date().toISOString(), status: 'running', items: [] }] });
  const restarted = await createService(options); t.after(() => restarted.close()); const state = await restarted.snapshot('sandbox');
  assert.equal(state.schedule.running, false); assert.equal(state.updateRuns[0].status, 'error'); assert.equal(state.updateRuns[0].items[0].reasonCode, 'RUN_INTERRUPTED');
  await restarted.tickScheduler(); assert.equal((await restarted.snapshot('sandbox')).updateRuns.length, 1);
});

test('new actions require explicit booleans, bounded intervals, known timezone and static targets', () => {
  for (const invalid of [undefined, null, 'true']) assert.throws(() => validateAction({ mode: 'local', action: 'updates.run', autoApply: invalid }));
  for (const intervalMinutes of [14, 10081, 15.5]) assert.throws(() => validateAction({ mode: 'local', action: 'schedule.configure', schedule: schedule([], { intervalMinutes }) }));
  assert.throws(() => validateAction({ mode: 'local', action: 'schedule.configure', schedule: schedule([], { timezone: 'Mars' }) }));
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1); assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1); assert.equal(compareVersions('release-A', 'release-B'), null);
});

test('schedule disable lets one in-flight item finish, prevents later items, and manual/background work cannot overlap', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-scheduler-'))); let time = Date.now(); let release; let started;
  const gate = new Promise(resolve => { release = resolve; }); const reached = new Promise(resolve => { started = resolve; });
  const targets = [{ kind: 'skill', id: 'a' }, { kind: 'skill', id: 'b' }]; const environments = {};
  for (const mode of ['local', 'sandbox']) { const directory = path.join(root, mode); await fs.mkdir(directory); environments[mode] = { root: directory, stateBoundary: await captureDirectoryRoot(directory) }; }
  const calls = []; const current = { skills: [], plugins: [], updates: targets.map(target => ({ target, name: target.id, canCheck: true })) };
  const scheduler = await createScheduler({ environments, snapshot: async () => current, signature: async (mode, target) => ({ owner: 'test', id: target.id }), hasPreview: () => true, coreBusy: () => false, clock: () => time, startTimer: false,
    perform: async request => { calls.push(request); if (request.action === 'update.apply') { started(); await gate; return {}; } return { updateItem: { status: 'available', canAutoApply: true, canApply: true, previewId: request.target.id } }; } });
  t.after(async () => { release(); await scheduler.close(); await fs.rm(root, { recursive: true, force: true }); });
  await scheduler.configure('sandbox', schedule(targets)); time += 16 * 60000;
  const run = scheduler.tick(); await reached;
  await assert.rejects(scheduler.run('local', { autoApply: false }), { code: 'BUSY' });
  await scheduler.tick(); assert.equal(calls.length, 2);
  await scheduler.configure('sandbox', schedule(targets, { enabled: false })); release(); await run;
  const disk = await readJson(path.join(environments.sandbox.root, 'updates.json'));
  assert.equal(disk.schedule.enabled, false); assert.equal(disk.schedule.running, false); assert.equal(disk.runs[0].status, 'partial'); assert.equal(calls.length, 2);
});

test('Git provenance distinguishes a skill subdirectory from a repository root and preserves all Git metadata during confirmed subdirectory updates', async t => {
  const { service } = await fixture(t); const env = service.environments.sandbox; const repo = path.join(env.skills, 'git-workspace'); const directory = path.join(repo, 'nested-skill');
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), '---\nname: nested-skill\ndescription: Git fixture\n---\nold\n');
  for (const args of [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', 'first']]) await runProcess('git', ['-C', repo, ...args]);
  let state = await service.snapshot('sandbox'); const nested = state.skills.find(s => s.name === 'nested-skill');
  assert.ok(nested); assert.equal(nested.sourceInfo.kind, 'git-checkout'); assert.equal(nested.sourceInfo.subpath, 'nested-skill');
  assert.equal(state.updates.find(i => i.target.id === nested.id).route, 'connect-source');
  const head = await fs.readFile(path.join(repo, '.git/HEAD'), 'utf8'); const source = state.examples.legacySource;
  const preview = (await act(service, 'skill.previewSource', { id: nested.id, sourceType: 'local', source })).sourcePreview;
  await act(service, 'skill.connectSource', { id: nested.id, previewId: preview.id });
  const check = (await act(service, 'update.check', { target: skillTarget(nested) })).updateItem;
  await act(service, 'update.apply', { target: skillTarget(nested), previewId: check.previewId });
  assert.equal(await fs.readFile(path.join(repo, '.git/HEAD'), 'utf8'), head);
  const rootSkill = path.join(repo, 'SKILL.md'); await fs.writeFile(rootSkill, '---\nname: repository-root\ndescription: Root fixture\n---\n');
  state = await service.snapshot('sandbox'); const record = state.skills.find(s => s.name === 'repository-root');
  assert.equal(state.updates.find(i => i.target.id === record.id).route, 'owner-managed');
  await assert.rejects(act(service, 'skill.previewSource', { id: record.id, sourceType: 'local', source }), { code: 'GIT_OWNER_MANAGED' });
});

async function fakeCliUpdater(t, behavior = 'success', marketplace = 'local-market') {
  const { service: original, options, root } = await fixture(t); const template = path.join(original.environments.sandbox.root, 'sources/starter-market');
  const market = path.join(root, 'market'); await fs.cp(template, market, { recursive: true });
  const catalogFile = path.join(market, '.agents/plugins/marketplace.json'); const catalog = await readJson(catalogFile); catalog.name = marketplace; await writeJson(catalogFile, catalog);
  const source = path.join(market, 'plugins/starter-tools'); const id = `starter-tools@${marketplace}`;
  const installed = path.join(options.codexHome, 'plugins/cache', marketplace, 'starter-tools/1.0.0'); await fs.mkdir(path.dirname(installed), { recursive: true }); await fs.cp(source, installed, { recursive: true });
  await fs.writeFile(path.join(options.codexHome, 'config.toml'), `[plugins.${JSON.stringify(id)}]\nenabled = false\n`);
  await writeJson(path.join(options.codexHome, 'fake-installed.json'), { version: '1.0.0' });
  const executable = path.join(root, 'fake-codex.mjs');
  await fs.writeFile(executable, `#!${process.execPath}\nimport fs from 'node:fs/promises'; import path from 'node:path';\nconst args=process.argv.slice(2), home=process.env.CODEX_HOME, source=${JSON.stringify(source)}, market=${JSON.stringify(market)}, id=${JSON.stringify(id)}, marketplace=${JSON.stringify(marketplace)}, behavior=${JSON.stringify(behavior)};\nawait fs.appendFile(path.join(home,'argv.jsonl'), JSON.stringify(args)+'\\n');\nconst send=value=>process.stdout.write(JSON.stringify(value));\nif(args[0]==='--version') process.stdout.write('codex fixture 1.0');\nelse if(args[1]==='--help') process.stdout.write('plugin list add remove marketplace');\nelse if(args[1]==='marketplace' && args[2]==='list') send({marketplaces:[{name:marketplace,root:market,marketplaceSource:{sourceType:'local',source:market}}]});\nelse if(args[1]==='list') { const state=JSON.parse(await fs.readFile(path.join(home,'fake-installed.json'),'utf8')); const config=await fs.readFile(path.join(home,'config.toml'),'utf8'); send({installed:[{pluginId:id,name:'starter-tools',marketplaceName:marketplace,version:state.version,enabled:!config.includes('enabled = false'),source:{source:'local',path:source}}],available:[]}); }\nelse if(args[1]==='add') { const manifest=JSON.parse(await fs.readFile(path.join(source,'.codex-plugin/plugin.json'),'utf8')); await fs.cp(source,path.join(home,'plugins/cache',marketplace,'starter-tools',manifest.version),{recursive:true}); await fs.writeFile(path.join(home,'fake-installed.json'),JSON.stringify({version:behavior==='readback-fail'?'1.0.0':manifest.version})); await fs.writeFile(path.join(home,'config.toml'),behavior==='restore-fail'?'notes = """unsupported multiline"""\\n':'[plugins.'+JSON.stringify(id)+']\\nenabled = true\\n'); if(behavior==='invalid-json') process.stdout.write('not-json'); else send({ok:true}); }\nelse { process.stderr.write('unexpected argv'); process.exitCode=2; }\n`, { mode: 0o755 });
  await original.close(); const adapter = new CodexAdapter({ codexHome: options.codexHome, codexBin: executable });
  const service = await createService({ ...options, adapter }); t.after(() => service.close()); await sourceVersion(source, '2.0.0');
  return { service, options, id, root };
}

test('official CLI adapter update uses safe add argv, verifies final content/version and restores previously disabled bundled state', async t => {
  const { service, options, id } = await fakeCliUpdater(t, 'success', 'openai-bundled'); const target = { kind: 'plugin', id };
  const check = (await act(service, 'update.check', { target }, 'local')).updateItem; assert.equal(check.status, 'available');
  await act(service, 'update.apply', { target, previewId: check.previewId }, 'local');
  const plugin = (await service.snapshot('local')).plugins.find(p => p.id === id); assert.equal(plugin.version, '2.0.0'); assert.equal(plugin.enabled, false);
  const args = (await fs.readFile(path.join(options.codexHome, 'argv.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(args.filter(a => a[1] === 'add'), [['plugin', 'add', id, '--json']]);
  assert.equal((await fs.readdir(service.environments.local.root)).filter(f => f.startsWith('pending-plugin')).length, 0);
});

test('CLI update restoration/readback/JSON failures never report complete success and retain recovery evidence', async t => {
  for (const [behavior, code] of [['restore-fail', 'STATE_RESTORE_FAILED'], ['readback-fail', 'READBACK_FAILED'], ['invalid-json', 'CLI_JSON']]) await t.test(behavior, async subtest => {
    const { service, id } = await fakeCliUpdater(subtest, behavior); const target = { kind: 'plugin', id };
    const check = (await act(service, 'update.check', { target }, 'local')).updateItem;
    await assert.rejects(act(service, 'update.apply', { target, previewId: check.previewId }, 'local'), { code });
    const state = await service.snapshot('local'); assert.ok(state.diagnostics.some(message => message.includes('pending-plugin-update')));
    assert.equal(state.activity.find(event => event.action === 'plugin.update').status, 'error');
  });
});

test('Git marketplace staging refresh preserves stable bindings for multiple packages across consecutive scheduled rounds', async t => {
  let time = Date.now(); const { service } = await fixture(t, { now: () => time }); const env = service.environments.sandbox;
  const source = path.join(env.root, 'sources/community-market'); const first = path.join(source, 'plugins/community-tools'); const second = path.join(source, 'plugins/second-tools');
  await fs.cp(first, second, { recursive: true }); const manifest = await readJson(path.join(second, '.codex-plugin/plugin.json')); manifest.name = 'second-tools'; await writeJson(path.join(second, '.codex-plugin/plugin.json'), manifest);
  const catalogPath = path.join(source, '.agents/plugins/marketplace.json'); const catalog = await readJson(catalogPath); catalog.plugins.push({ name: 'second-tools', source: './plugins/second-tools' }); await writeJson(catalogPath, catalog);
  const git = args => runProcess('git', ['-C', source, ...args]);
  await git(['init', '--quiet']); await git(['add', '.']); await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', 'v1']);
  await act(service, 'marketplace.add', { sourceType: 'git', source });
  const targets = ['community-tools', 'second-tools'].map(name => ({ kind: 'plugin', id: `${name}@community-market` }));
  for (const target of targets) await act(service, 'plugin.install', { id: target.id });
  await act(service, 'schedule.configure', { schedule: schedule(targets) });
  for (const version of ['1.1.0', '1.2.0']) {
    for (const directory of [first, second]) { const file = path.join(directory, '.codex-plugin/plugin.json'); const value = await readJson(file); value.version = version; await writeJson(file, value); }
    await git(['add', '.']); await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', version]);
    time += 16 * 60000; await service.tickScheduler(); const state = await service.snapshot('sandbox');
    assert.deepEqual(state.updateRuns[0].items.map(item => item.status), ['updated', 'updated']);
    assert.ok(state.plugins.filter(p => p.marketplace === 'community-market').every(p => p.version === version));
  }
  time += 16 * 60000; await service.tickScheduler();
  assert.deepEqual((await service.snapshot('sandbox')).updateRuns[0].items.map(item => item.status), ['current', 'current']);
  time += 16 * 60000; await service.tickScheduler();
  assert.deepEqual((await service.snapshot('sandbox')).updateRuns[0].items.map(item => item.status), ['current', 'current'], 'a current observation must not change the content-binding shape');
  assert.ok((await fs.readdir(path.join(env.root, 'marketplace-sources'))).length <= 3, 'retain current marketplace root plus at most two unreferenced roots');
});

test('temporary Git checkouts are reclaimed for current, consumed, expired and abandoned previews without touching backups or user sources', async t => {
  let time = Date.now(); const { service } = await fixture(t, { now: () => time }); const env = service.environments.sandbox; let state = await service.snapshot('sandbox');
  const source = state.examples.gitSource; const sourceBefore = (await inspectTree(source)).fingerprint;
  const stagingRoot = path.join(env.root, 'staging');
  const count = async () => (await fs.readdir(stagingRoot).catch(() => [])).length;
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'git', source })).preview;
  assert.equal(await count(), 1); await act(service, 'skill.install', { previewId: preview.id }); assert.equal(await count(), 0, 'consumed Git clone removed');
  const installed = (await service.snapshot('sandbox')).skills.find(s => s.name === 'git-workflow');
  for (let i = 0; i < 3; i += 1) { assert.equal((await act(service, 'update.check', { target: skillTarget(installed) })).updateItem.status, 'current'); assert.equal(await count(), 0, 'no-change checks do not retain repositories'); }
  const writing = (await service.snapshot('sandbox')).skills.find(s => s.name === 'writing-assistant');
  const check = (await act(service, 'update.check', { target: skillTarget(writing) })).updateItem; assert.equal(await count(), 1);
  time += 31 * 60000; await service.snapshot('sandbox'); assert.equal(await count(), 0, 'expired previews reclaimed');
  await assert.rejects(act(service, 'update.apply', { target: skillTarget(writing), previewId: check.previewId }), { code: 'STALE_PREVIEW' });
  const fresh = (await act(service, 'update.check', { target: skillTarget(writing) })).updateItem; await act(service, 'update.apply', { target: skillTarget(writing), previewId: fresh.previewId });
  const quarantine = path.join(env.root, 'quarantine'); const backupNames = await fs.readdir(quarantine); assert.ok(backupNames.length);
  const abandoned = path.join(stagingRoot, '11111111-1111-1111-1111-111111111111'); await fs.mkdir(abandoned); await fs.writeFile(path.join(abandoned, 'orphan'), 'discard');
  const old = new Date(Date.now() - 31 * 60000); await fs.utimes(abandoned, old, old); await service.snapshot('sandbox');
  assert.equal(await count(), 0); assert.deepEqual(await fs.readdir(quarantine), backupNames); assert.equal((await inspectTree(source)).fingerprint, sourceBefore);
});

test('CLI refresh can advance a saved installation binding, but cannot adopt a different source', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-owner-refresh-')));
  const target = { kind: 'plugin', id: 'tools@market' };
  let actual = { target, sourceIdentity: { source: 'https://example.invalid/original.git' }, real: '/cache/tools/1.0.0' };
  const scheduler = await createScheduler({
    environments: { local: { root, stateBoundary: await captureDirectoryRoot(root) } },
    snapshot: async () => ({ updates: [{ target, canCheck: true }] }), perform: async () => {},
    signature: async () => structuredClone(actual), hasPreview: () => false, coreBusy: () => false, startTimer: false,
  });
  t.after(async () => { await scheduler.close(); await fs.rm(root, { recursive: true, force: true }); });
  await scheduler.configure('local', schedule([target]));
  let original = await scheduler.beforeOwnUpdate('local', target);
  actual.real = '/cache/tools/2.0.0';
  await scheduler.afterOwnerRefresh('local', target, original);
  assert.equal((await readJson(path.join(root, 'updates.json'))).bindings['plugin:tools@market'].real, '/cache/tools/2.0.0');
  original = await scheduler.beforeOwnUpdate('local', target);
  actual = { ...actual, sourceIdentity: { source: 'https://example.invalid/different.git' }, real: '/cache/tools/3.0.0' };
  await scheduler.afterOwnerRefresh('local', target, original);
  assert.equal((await readJson(path.join(root, 'updates.json'))).bindings['plugin:tools@market'].real, '/cache/tools/2.0.0');
});
