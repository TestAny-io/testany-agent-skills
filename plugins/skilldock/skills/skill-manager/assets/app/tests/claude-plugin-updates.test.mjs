// SPDX-License-Identifier: AGPL-3.0-only
// Phase 5b: updating a Claude plugin installed from a marketplace (HLD 3.3, 3.3A; DEC-SDX-005, 026).
// Claude's command line is a stand-in that behaves as the 2.1.288 probes showed: the version is the
// manifest's, the entry's, or the source's (a commit, unknown for a local directory); an unchanged
// version is "up to date"; `unknown` is overwritten in place; a new version gets its own directory
// and the old one an `.orphaned_at` marker. Git uses local repositories; npm and archives use stand-in fetchers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { claudeWriteArgs } from '../server/claude-writer.mjs';
import { runProcess } from '../server/cli.mjs';
import { defaultFetchers, entrySourceInfo, entryPlace, pluginSource } from '../server/claude-plugin-updates.mjs';
import { assertTranslated } from './i18n-helper.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const exists = file => fs.lstat(file).then(() => true, () => false);
const plugin = async (directory, name, { version, body = 'v1' } = {}) => {
  await write(path.join(directory, '.claude-plugin/plugin.json'), { name, ...(version ? { version } : {}) });
  await write(path.join(directory, 'skills/s/SKILL.md'), `---\nname: s\ndescription: ${name}\n---\n${body}\n`);
};
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.updateItem?.message, ...(value?.run?.items ?? []).map(item => item.message)]) if (typeof text === 'string') seen.add(text); return value; };
const git = (repo, ...args) => runProcess('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args]);

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-plugin-updates-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project'); const cache = path.join(configDir, 'plugins/cache');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(cache, { recursive: true });
  const market = path.join(root, 'market'); const entries = [];
  const writeMarket = () => write(path.join(market, '.claude-plugin/marketplace.json'), { name: 'm', owner: { name: 'test' }, plugins: entries });
  const claude = { plugins: [], marketplaces: [{ name: 'm', source: 'directory', path: market, installLocation: market }], calls: [], tamper: false, fetched: {} };
  await write(path.join(configDir, 'plugins/known_marketplaces.json'), { m: { source: { source: 'directory', path: market }, installLocation: market } });
  // Stand-in fetchers: an npm registry and an archive host on disk.
  const fetchers = {
    npmPack: async (spec, registry, directory) => { const file = path.join(directory, 'pkg.tgz'); await fs.copyFile(claude.fetched.npm.file, file); return { file, version: claude.fetched.npm.version, integrity: claude.fetched.npm.integrity }; },
    download: async (url, file) => fs.copyFile(claude.fetched.archives[url], file),
  };
  async function candidateOf(entry) {
    const source = entry.source;
    if (typeof source === 'string') return { dir: path.resolve(market, source) };
    if (source.source === 'url') {
      const repo = source.url.replace('file://', ''); const commit = (await git(repo, 'rev-parse', 'HEAD')).stdout.trim();
      const dir = path.join(root, 'claude-fetch', crypto.randomUUID()); await fs.mkdir(dir, { recursive: true });
      await runProcess('/bin/sh', ['-c', `git -C '${repo}' archive HEAD | tar -x -C '${dir}'`]); return { dir, commit };
    }
    if (source.source === 'npm') { const dir = path.join(root, 'claude-fetch', crypto.randomUUID()); await fs.mkdir(dir, { recursive: true }); await runProcess('tar', ['-xzf', claude.fetched.npm.file, '-C', dir]); return { dir: path.join(dir, 'package') }; }
    if (source.source === 'archive') { const dir = path.join(root, 'claude-fetch', crypto.randomUUID()); await fs.mkdir(dir, { recursive: true }); await runProcess('/usr/bin/ditto', ['-x', '-k', claude.fetched.archives[source.url], dir]); const [only] = await fs.readdir(dir); return { dir: path.join(dir, only), sha256: crypto.createHash('sha256').update(await fs.readFile(claude.fetched.archives[source.url])).digest('hex') }; }
  }
  async function versionOf(dir, entry, facts) {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, '.claude-plugin/plugin.json'), 'utf8').catch(() => '{}'));
    return manifest.version ?? entry.version ?? (facts.commit ? facts.commit.slice(0, 12) : facts.sha256 ? facts.sha256.slice(0, 12) : 'unknown');
  }
  async function place(entry, scope, cwd) {
    const facts = await candidateOf(entry); const version = await versionOf(facts.dir, entry, facts);
    const dir = path.join(cache, 'm', entry.name, version);
    await fs.rm(dir, { recursive: true, force: true }); await fs.cp(facts.dir, dir, { recursive: true, filter: file => !file.includes(`${path.sep}.git`) });
    if (claude.tamper) await write(path.join(dir, 'tampered.txt'), 'not what was previewed');
    return { id: `${entry.name}@m`, scope, enabled: true, version, installPath: dir, ...(scope === 'user' ? {} : { projectPath: cwd }) };
  }
  const writer = () => async (args, { cwd }) => {
    claude.calls.push({ command: args.join(' '), cwd }); claudeWriteArgs(args);
    const [, verb, a] = args; const scope = args[args.indexOf('--scope') + 1];
    if (verb === 'update') {
      const install = claude.plugins.find(item => item.id === a && item.scope === scope);
      const catalog = JSON.parse(await fs.readFile(path.join(market, '.claude-plugin/marketplace.json'), 'utf8'));
      const entry = catalog.plugins.find(item => `${item.name}@m` === a);
      const facts = await candidateOf(entry); const version = await versionOf(facts.dir, entry, facts);
      if (version !== 'unknown' && version === install.version) return { command: 'update', outcome: 'ok', updateOutcome: 'up_to_date', oldVersion: version, newVersion: version };
      const next = await place(entry, scope, cwd);
      if (next.installPath !== install.installPath) await write(path.join(install.installPath, '.orphaned_at'), String(Date.now()));
      Object.assign(install, next);
      return { command: 'update', outcome: 'ok', updateOutcome: 'updated', oldVersion: install.version, newVersion: version };
    }
    return { outcome: 'ok' };
  };
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2); let time = Date.parse('2026-10-10T00:00:00Z');
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home }, now: () => time,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => structuredClone(claude.plugins), listMarketplaces: async () => structuredClone(claude.marketplaces) },
    claudeWriter: writer, claudeGit: async () => { throw new Error('not a repository'); }, claudeFetchers: fetchers });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  // Installs an entry as Claude would, without going through SkillDock.
  const install = async (entry, scope = 'user', cwd = project) => { entries.push(entry); await writeMarket(); claude.plugins.push(await place(entry, scope, cwd)); };
  const target = async name => (await snapshot()).updates.find(item => item.target.agent === 'claude' && item.name === name).target;
  const check = async name => act({ action: 'update.check', agent: 'claude', target: await target(name) });
  const apply = async (name, previewId, extra = {}) => act({ action: 'update.apply', agent: 'claude', target: await target(name), previewId, ...extra });
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  // What Claude does on its own (a desktop session's update): the entry's content placed as Claude would.
  const claudeUpdates = async (name, scope = 'user') => { const index = claude.plugins.findIndex(item => item.id === `${name}@m` && item.scope === scope);
    const entry = entries.find(item => item.name === name); const next = await place(entry, scope, claude.plugins[index].projectPath ?? project);
    if (next.installPath !== claude.plugins[index].installPath) await write(path.join(claude.plugins[index].installPath, '.orphaned_at'), '1');
    claude.plugins[index] = next; };
  const advance = minutes => { time += minutes * 60000; };
  return { root, home, configDir, project, cache, market, entries, writeMarket, claude, service, act, snapshot, install, target, check, apply, registry, claudeUpdates, advance };
}

test('a versioned plugin from a local marketplace: current, then a new version applied and read back', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  await w.install({ name: 'alpha', source: './plugins/alpha' });
  const item = (await w.snapshot()).updates.find(entry => entry.name === 'alpha');
  assert.deepEqual([item.route, item.canCheck, item.target.agent], ['claude-plugin', true, 'claude']);
  assert.equal((await w.check('alpha')).updateItem.status, 'current');
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  const checked = (await w.check('alpha')).updateItem;
  assert.deepEqual([checked.status, checked.availableVersion, checked.changes.length > 0], ['available', '1.1.0', true]);
  const applied = await w.apply('alpha', checked.previewId);
  assert.match(applied.message, /已更新 Claude 插件 alpha（1\.0\.0 → 1\.1\.0）/);
  assert.equal(w.claude.calls.at(-1).command, 'plugin update alpha@m --scope user --json');
  assert.ok(await exists(path.join(w.cache, 'm/alpha/1.0.0/.orphaned_at')), '旧版本目录由 Claude 保留并标记');
  assert.equal((await w.snapshot()).updates.find(entry => entry.name === 'alpha').status, 'current');
  assert.ok((await w.snapshot()).activity.some(entry => entry.agent === 'claude' && entry.action === 'plugin.update' && entry.status === 'success'));
});

test('changed content under an unchanged version is blocked: Claude would not update it', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  await w.install({ name: 'alpha', source: './plugins/alpha' });
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0', body: 'v2' });
  const checked = (await w.check('alpha')).updateItem;
  assert.deepEqual([checked.status, checked.reasonCode, checked.canApply], ['blocked', 'VERSION_UNCHANGED', false]);
  assert.match(checked.message, /请维护者递增版本/);
});

test('a plugin without a version is copied, dependencies included, before Claude overwrites it in place', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/beta'), 'beta');
  await w.install({ name: 'beta', source: './plugins/beta' });
  const installPath = w.claude.plugins[0].installPath;
  await write(path.join(installPath, 'node_modules/dep/index.js'), 'module.exports = 1;');
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v2' });
  const checked = (await w.check('beta')).updateItem;
  assert.equal(checked.status, 'available'); assert.match(checked.message, /没有版本号，Claude 会原地覆盖它/, '应用前就说明');
  const applied = await w.apply('beta', checked.previewId);
  assert.match(applied.message, /更新前的内容已复制到 .*latest；Claude 原地覆盖这类插件/);
  const copy = applied.message.match(/复制到 (\S+latest)/)[1];
  assert.match(await fs.readFile(path.join(copy, 'skills/s/SKILL.md'), 'utf8'), /v1/);
  assert.ok(await exists(path.join(copy, 'node_modules/dep/index.js')), '副本保留依赖');
  assert.match(await fs.readFile(path.join(installPath, 'skills/s/SKILL.md'), 'utf8'), /v2/);
});

test('local changes and source changes stop the update; nothing is run', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  await w.install({ name: 'alpha', source: './plugins/alpha' });
  assert.equal((await w.check('alpha')).updateItem.status, 'current', '记下基线');
  const installed = path.join(w.claude.plugins[0].installPath, 'skills/s/SKILL.md');
  await fs.appendFile(installed, 'my edit\n');
  assert.equal((await w.check('alpha')).code, 'LOCAL_CHANGES');
  await plugin(path.join(w.claude.plugins[0].installPath), 'alpha', { version: '1.0.0' });
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  const checked = (await w.check('alpha')).updateItem;
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v3' });
  assert.equal((await w.apply('alpha', checked.previewId)).code, 'SOURCE_CHANGED');
  const again = (await w.check('alpha')).updateItem;
  await fs.appendFile(installed, 'late edit\n');
  assert.equal((await w.apply('alpha', again.previewId)).code, 'LOCAL_CHANGES');
  assert.equal(w.claude.calls.some(call => call.command.startsWith('plugin update')), false);
});

test('a readback that differs from the preview is reported, and automatic applying waits for a new preview', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  await w.install({ name: 'alpha', source: './plugins/alpha' });
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  w.claude.tamper = true;
  const checked = (await w.check('alpha')).updateItem;
  const failed = await w.apply('alpha', checked.previewId);
  assert.equal(failed.code, 'READBACK_CONTENT_CHANGED'); assert.match(failed.message, /装入的内容与预览不同/);
  w.claude.tamper = false;
  // What Claude did install is the baseline now: checking again is not a local change (5a/5b review P1-02).
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.2.0', body: 'v3' });
  const next = (await w.check('alpha')).updateItem;
  assert.deepEqual([next.status, next.canAutoApply], ['available', false]); assert.match(next.message, /自动应用已暂停/);
  const batch = await w.act({ action: 'updates.run', agent: 'codex', targets: [await w.target('alpha')], autoApply: true });
  assert.equal(batch.run.items[0].status, 'available', '批量自动应用不越过它');
  // A person applies it: automatic applying comes back.
  const manual = (await w.check('alpha')).updateItem;
  assert.match((await w.apply('alpha', manual.previewId)).message, /已更新 Claude 插件 alpha/);
  assert.equal((await w.registry()).claudePluginReview?.[(await w.target('alpha')).id], undefined);
});

test('a Git source updates to the new commit; a newer commit after the preview stops it', async t => {
  const w = await world(t);
  const repo = path.join(w.root, 'repo'); await plugin(repo, 'gamma');
  await git(repo, 'init', '-q', '-b', 'main'); await git(repo, 'add', '.'); await git(repo, 'commit', '-qm', 'v1');
  await w.install({ name: 'gamma', source: { source: 'url', url: `file://${repo}` } });
  assert.equal((await w.check('gamma')).updateItem.status, 'current');
  await plugin(repo, 'gamma', { body: 'v2' }); await git(repo, 'commit', '-qam', 'v2');
  const second = (await git(repo, 'rev-parse', 'HEAD')).stdout.trim();
  const checked = (await w.check('gamma')).updateItem;
  assert.deepEqual([checked.status, checked.availableVersion], ['available', second.slice(0, 12)]);
  await plugin(repo, 'gamma', { body: 'v3' }); await git(repo, 'commit', '-qam', 'v3');
  assert.equal((await w.apply('gamma', checked.previewId)).code, 'SOURCE_CHANGED');
  const again = (await w.check('gamma')).updateItem;
  assert.match((await w.apply('gamma', again.previewId)).message, /已更新 Claude 插件 gamma/);
});

test('npm and archive sources stage what Claude would install', async t => {
  const w = await world(t);
  const pack = async (version, body) => {
    const dir = path.join(w.root, `npm-${version}`); await plugin(path.join(dir, 'package'), 'delta', { version }); await write(path.join(dir, 'package/package.json'), { name: '@t/delta', version });
    await write(path.join(dir, 'package/skills/s/SKILL.md'), `---\nname: s\ndescription: delta\n---\n${body}\n`);
    const file = path.join(dir, 'pkg.tgz'); await runProcess('tar', ['-czf', file, '-C', dir, 'package']);
    w.claude.fetched.npm = { file, version, integrity: `sha512-${crypto.createHash('sha512').update(await fs.readFile(file)).digest('base64')}` };
  };
  await pack('1.0.0', 'v1');
  await w.install({ name: 'delta', source: { source: 'npm', package: '@t/delta' } });
  await pack('1.1.0', 'v2');
  const npmChecked = (await w.check('delta')).updateItem;
  assert.deepEqual([npmChecked.status, npmChecked.availableVersion], ['available', '1.1.0']);
  assert.match((await w.apply('delta', npmChecked.previewId)).message, /（1\.0\.0 → 1\.1\.0）/);
  const zip = async (name, body) => {
    const dir = path.join(w.root, `zip-${name}`); await plugin(path.join(dir, 'epsilon-main'), 'epsilon', { body });
    const file = path.join(w.root, `${name}.zip`); await runProcess('/usr/bin/ditto', ['-c', '-k', '--keepParent', path.join(dir, 'epsilon-main'), file]);
    w.claude.fetched.archives ??= {}; w.claude.fetched.archives[`https://example.invalid/${name}.zip`] = file; return `https://example.invalid/${name}.zip`;
  };
  const first = await zip('one', 'v1');
  await w.install({ name: 'epsilon', source: { source: 'archive', url: first } });
  assert.equal((await w.check('epsilon')).updateItem.status, 'current');
  const second = await zip('two', 'v2');
  w.entries.find(entry => entry.name === 'epsilon').source.url = second; await w.writeMarket();
  const archiveChecked = (await w.check('epsilon')).updateItem;
  assert.equal(archiveChecked.status, 'available');
  assert.match((await w.apply('epsilon', archiveChecked.previewId)).message, /已更新 Claude 插件 epsilon/);
});

test('a command source or a credential helper is left to Claude; a project installation updates from its project', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  // Installed for another project: Claude is run from that project, not the current one.
  const other = path.join(w.root, 'other-project'); await fs.mkdir(other);
  await w.install({ name: 'alpha', source: './plugins/alpha' }, 'local', other);
  w.entries.push({ name: 'cmd', source: { source: 'command', command: 'my-tool path' } }, { name: 'auth', headersHelper: 'helper', strict: false, source: { source: 'archive', url: 'https://example.invalid/a.zip' } });
  await w.writeMarket();
  w.claude.plugins.push({ id: 'cmd@m', scope: 'user', enabled: true, version: 'abc', installPath: path.join(w.cache, 'm/cmd/abc') }, { id: 'auth@m', scope: 'user', enabled: true, version: 'abc', installPath: path.join(w.cache, 'm/auth/abc') });
  await plugin(path.join(w.cache, 'm/cmd/abc'), 'cmd'); await plugin(path.join(w.cache, 'm/auth/abc'), 'auth');
  for (const name of ['cmd', 'auth']) { const item = (await w.check(name)).updateItem; assert.deepEqual([item.status, item.reasonCode], ['blocked', 'OWNER_MANAGED'], name); }
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  const checked = (await w.check('alpha')).updateItem;
  await w.apply('alpha', checked.previewId);
  assert.deepEqual([w.claude.calls.at(-1).command, w.claude.calls.at(-1).cwd], ['plugin update alpha@m --scope local --json', other]);
});

test('SkillDock itself on Claude\'s side is an ordinary plan target, like Codex\'s (phase 5d)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/skilldock'), 'skilldock', { version: '0.11.0' });
  await w.install({ name: 'skilldock', source: './plugins/skilldock' });
  const target = await w.target('skilldock');
  assert.equal((await w.snapshot()).updates.find(entry => entry.name === 'skilldock').canCheck, true);
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 60, timezone: 'UTC', autoApply: true, targets: [target] } });
  assert.deepEqual((await w.snapshot()).schedule.targets, [target]);
  await plugin(path.join(w.market, 'plugins/skilldock'), 'skilldock', { version: '0.11.1', body: 'v2' });
  const run = await w.act({ action: 'updates.run', agent: 'claude', targets: [target], autoApply: true });
  assert.equal(run.run.items[0].status, 'updated');
  assert.equal(w.claude.plugins.find(item => item.id === 'skilldock@m').version, '0.11.1');
});

test('a Git ref resolves to what a checkout gets: an annotated tag by its commit, a branch by its exact name (5c review P3-02)', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-git-ref-'))); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); await fs.mkdir(repo);
  await runProcess('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  await write(path.join(repo, 'a'), 'one'); await git(repo, 'add', '.'); await git(repo, 'commit', '-qm', 'one');
  const one = (await git(repo, 'rev-parse', 'HEAD')).stdout.trim();
  await git(repo, 'tag', '-a', 'v1.0', '-m', 'tag'); await git(repo, 'branch', 'feature/main');
  await write(path.join(repo, 'a'), 'two'); await git(repo, 'commit', '-qam', 'two');
  const two = (await git(repo, 'rev-parse', 'HEAD')).stdout.trim();
  const { resolve } = defaultFetchers({ env: { PATH: process.env.PATH, HOME: root } });
  assert.equal(await resolve(repo, 'v1.0'), one, '附注标签取它指向的提交');
  assert.equal(await resolve(repo, 'main'), two, '不被 feature/main 干扰');
  assert.equal(await resolve(repo, undefined), two);
  assert.equal(await resolve(repo, 'refs/heads/feature/main'), one);
  await assert.rejects(resolve(repo, 'missing'), { code: 'GIT_REPOSITORY_UNAVAILABLE' });
});

test('a plugin without a version that Claude updated itself is not a local change; content equal to the source resumes a paused applying (5a/5b review P1-02, P3-02)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/beta'), 'beta');
  await w.install({ name: 'beta', source: './plugins/beta' });
  assert.equal((await w.check('beta')).updateItem.status, 'current');
  // Claude overwrote it in place (still `unknown`): the same content as the source, so current.
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v2' }); await w.claudeUpdates('beta');
  const after = (await w.check('beta')).updateItem;
  assert.deepEqual([after.status, after.reasonCode], ['current', undefined]);
  // A change of SkillDock's own making is said so, with a way out.
  await fs.appendFile(path.join(w.claude.plugins[0].installPath, 'skills/s/SKILL.md'), 'edited\n');
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v3' });
  const edited = await w.check('beta');
  assert.equal(edited.code, 'LOCAL_CHANGES'); assert.match(edited.message, /可能是 Claude 自己更新过.*卸载后重新安装/);
  await w.claudeUpdates('beta');
  assert.equal((await w.check('beta')).updateItem.status, 'current', '重新装入来源的内容后照常');
  // A readback pause clears once the installation equals the source again.
  const registryFile = w.service.environments.local.registryFile; const registry = await w.registry();
  registry.claudePluginReview = { [(await w.target('beta')).id]: true }; await write(registryFile, registry);
  assert.equal((await w.check('beta')).updateItem.status, 'current');
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v4' });
  assert.equal((await w.check('beta')).updateItem.canAutoApply, true, '暂停已解除');
});

test('a source with node_modules compares as the installation does: unchanged is current (5a/5b review P2-01)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/gamma'), 'gamma', { version: '1.0.0' });
  await write(path.join(w.market, 'plugins/gamma/node_modules/dep/index.js'), 'module.exports = 1;');
  await w.install({ name: 'gamma', source: './plugins/gamma' });
  const item = (await w.check('gamma')).updateItem;
  assert.deepEqual([item.status, item.reasonCode], ['current', undefined]);
});

test('the updates page shows a Claude plugin preview file by file; another plugin\'s preview is left for it (5a/5b review P2-03, P3-04)', async t => {
  const w = await world(t);
  for (const name of ['alpha', 'zeta']) { await plugin(path.join(w.market, `plugins/${name}`), name, { version: '1.0.0' }); await w.install({ name, source: `./plugins/${name}` }); }
  for (const name of ['alpha', 'zeta']) await plugin(path.join(w.market, `plugins/${name}`), name, { version: '1.1.0', body: 'v2' });
  const alpha = (await w.check('alpha')).updateItem; const zeta = (await w.check('zeta')).updateItem;
  const changed = alpha.changes.find(change => change.path.endsWith('SKILL.md'));
  const diff = await w.act({ action: 'preview.diff', previewId: alpha.previewId, path: changed.path });
  assert.equal(diff.code, undefined, diff.message); assert.ok(diff.diff);
  assert.equal((await w.apply('alpha', zeta.previewId)).code, 'PREVIEW_MISMATCH');
  assert.match((await w.apply('zeta', zeta.previewId)).message, /已更新 Claude 插件 zeta/, '它的预览没有被消耗');
});

test('a source SkillDock never runs, or an installation whose project is gone, is not offered for checking; the plan pauses it (5a/5b review P2-04)', async t => {
  const w = await world(t);
  w.entries.push({ name: 'cmd', source: { source: 'command', command: 'make plugin' } }, { name: 'dash', source: { source: 'npm', package: '-x' } }); await w.writeMarket();
  w.claude.plugins.push({ id: 'cmd@m', scope: 'user', enabled: true, version: '1.0.0', installPath: path.join(w.cache, 'm/cmd/1.0.0') }, { id: 'dash@m', scope: 'user', enabled: true, version: '1.0.0', installPath: path.join(w.cache, 'm/dash/1.0.0') });
  await write(path.join(w.cache, 'm/cmd/1.0.0/.claude-plugin/plugin.json'), { name: 'cmd' }); await write(path.join(w.cache, 'm/dash/1.0.0/.claude-plugin/plugin.json'), { name: 'dash' });
  const items = (await w.snapshot()).updates;
  for (const name of ['cmd', 'dash']) { const item = items.find(entry => entry.name === name); assert.deepEqual([item.canCheck, item.reasonCode], [false, 'OWNER_MANAGED'], name); }
  assert.equal((await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 60, timezone: 'UTC', autoApply: true, targets: [items.find(entry => entry.name === 'cmd').target] } })).code, 'TARGET_NOT_READY');
  // A local installation whose project goes away.
  const other = path.join(w.root, 'other'); await fs.mkdir(other);
  await plugin(path.join(w.market, 'plugins/near'), 'near', { version: '1.0.0' }); await w.install({ name: 'near', source: './plugins/near' }, 'local', other);
  const near = await w.target('near');
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 60, timezone: 'UTC', autoApply: true, targets: [near] } });
  await fs.rm(other, { recursive: true });
  const gone = (await w.snapshot()).updates.find(entry => entry.target.id === near.id);
  assert.deepEqual([gone.canCheck, gone.reasonCode], [false, 'PROJECT_PATH_MISSING']);
  w.advance(61); await w.service.tickScheduler();
  const run = (await w.snapshot()).updateRuns[0].items[0];
  assert.deepEqual([run.status, run.reasonCode], ['skipped', 'AGENT_PAUSED']); assert.match(run.message, /项目目录不存在，计划中的这一项暂停/);
});

test('a plan keeps a versioned Claude plugin that Claude updated itself; an installation changed after the preview stops the update (5a/5b review P2-05, M02)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' }); await w.install({ name: 'alpha', source: './plugins/alpha' });
  const target = await w.target('alpha');
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 60, timezone: 'UTC', autoApply: true, targets: [target] } });
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' }); await w.claudeUpdates('alpha');
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.2.0', body: 'v3' });
  w.advance(61); await w.service.tickScheduler();
  const run = (await w.snapshot()).updateRuns[0].items[0];
  assert.deepEqual([run.status, run.reasonCode], ['updated', undefined], '不是 TARGET_BINDING_CHANGED');
  // Checked, then Claude moved on before applying: refused, nothing run.
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.3.0', body: 'v4' });
  const checked = (await w.check('alpha')).updateItem; await w.claudeUpdates('alpha'); const calls = w.claude.calls.length;
  assert.equal((await w.apply('alpha', checked.previewId)).code, 'INSTALLATION_CHANGED'); assert.equal(w.claude.calls.length, calls);
});

test('hardening: a linked plugin directory outside the marketplace, and archive downloads by redirect, size and host (5a/5b review P3-06)', async t => {
  const w = await world(t);
  const outside = path.join(w.root, 'outside'); await plugin(outside, 'linky', { version: '1.0.0' });
  await fs.mkdir(path.join(w.market, 'plugins'), { recursive: true }); await fs.symlink(outside, path.join(w.market, 'plugins/linky'));
  await w.install({ name: 'linky', source: './plugins/linky' });
  assert.equal((await w.check('linky')).code, 'SOURCE_BOUNDARY');
  // Downloads, with a stand-in network.
  const routes = { 'https://a.example/x.zip': [302, 'https://b.example/x.zip'], 'https://b.example/x.zip': [200, 'zip-bytes'], 'https://c.example/x.zip': [302, 'http://b.example/x.zip'],
    'https://d.example/x.zip': [302, 'https://localhost/x.zip'], 'https://e.example/x.zip': [200, 'x'.repeat(64)] };
  const fetchImpl = async url => { const [status, value] = routes[url]; return status === 302 ? new Response(null, { status, headers: { location: value } }) : new Response(value, { status }); };
  const { download } = defaultFetchers({ env: {}, fetchImpl, archiveLimit: 32 });
  const file = path.join(w.root, 'got.zip');
  await download('https://a.example/x.zip', file); assert.equal(await fs.readFile(file, 'utf8'), 'zip-bytes');
  await assert.rejects(download('https://c.example/x.zip', file), { code: 'INVALID_SOURCE' }, '重定向到 http');
  await assert.rejects(download('https://d.example/x.zip', file), { code: 'INVALID_SOURCE' }, '重定向到本机');
  await assert.rejects(download('https://e.example/x.zip', file), { code: 'SOURCE_LIMIT' });
});

// Phase 5 re-review (52).
async function npmPacker(w) {
  return async (version, body = `v${version}`, name = '@t/delta') => {
    const dir = path.join(w.root, `npm-${version}-${crypto.randomUUID()}`); await plugin(path.join(dir, 'package'), 'delta', { version }); await write(path.join(dir, 'package/package.json'), { name, version });
    await write(path.join(dir, 'package/skills/s/SKILL.md'), `---\nname: s\ndescription: delta\n---\n${body}\n`);
    const file = path.join(dir, 'pkg.tgz'); await runProcess('tar', ['-czf', file, '-C', dir, 'package']);
    w.claude.fetched.npm = { file, version, integrity: `sha512-${crypto.createHash('sha512').update(await fs.readFile(file)).digest('base64')}` };
  };
}

test('a local plugin whose source has node_modules applies and reads back (re-review N14, N15)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/gamma'), 'gamma', { version: '1.0.0' }); await write(path.join(w.market, 'plugins/gamma/node_modules/dep/index.js'), 'module.exports = 1;');
  await w.install({ name: 'gamma', source: './plugins/gamma' });
  await plugin(path.join(w.market, 'plugins/gamma'), 'gamma', { version: '1.1.0', body: 'v2' });
  const checked = (await w.check('gamma')).updateItem;
  assert.equal(checked.status, 'available'); assert.equal(checked.changes.some(change => change.path.startsWith('node_modules')), false);
  assert.match((await w.apply('gamma', checked.previewId)).message, /已更新 Claude 插件 gamma（1\.0\.0 → 1\.1\.0）/);
});

test('a plan follows a pinned entry to its next version; another package is another source (phase 5 re-review P2-01, N21)', async t => {
  const w = await world(t); const pack = await npmPacker(w);
  await pack('1.0.0');
  await w.install({ name: 'delta', source: { source: 'npm', package: '@t/delta', version: '1.0.0' } });
  const target = await w.target('delta');
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 60, timezone: 'UTC', autoApply: true, targets: [target] } });
  const due = async () => { w.advance(61); await w.service.tickScheduler(); return (await w.snapshot()).updateRuns[0].items[0]; };
  // The maintainer releases by changing the pinned version in the entry.
  await pack('1.1.0'); w.entries.find(entry => entry.name === 'delta').source.version = '1.1.0'; await w.writeMarket();
  let run = await due(); assert.deepEqual([run.status, run.reasonCode], ['updated', undefined]);
  run = await due(); assert.equal(run.status, 'current');
  // Another package under the same name is a new object for the plan.
  w.entries.find(entry => entry.name === 'delta').source.package = '@other/delta'; await w.writeMarket();
  run = await due(); assert.deepEqual([run.status, run.reasonCode], ['skipped', 'TARGET_BINDING_CHANGED']);
});

test('after a readback mismatch, a plugin without a version is checked again without a local change (re-review N11)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/beta'), 'beta'); await w.install({ name: 'beta', source: './plugins/beta' });
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v2' });
  w.claude.tamper = true;
  const checked = (await w.check('beta')).updateItem;
  assert.equal((await w.apply('beta', checked.previewId)).code, 'READBACK_CONTENT_CHANGED');
  w.claude.tamper = false;
  const again = await w.check('beta');
  assert.equal(again.code, undefined, again.message); assert.deepEqual([again.updateItem.status, again.updateItem.canAutoApply], ['available', false]);
});

test('what changed after the preview stops the update before any command: the entry, an npm package, an archive (re-review A-M05, M08, M09); a remote marketplace is refreshed first (M19)', async t => {
  const w = await world(t); const pack = await npmPacker(w);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' }); await w.install({ name: 'alpha', source: './plugins/alpha' });
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  let checked = (await w.check('alpha')).updateItem; let calls = w.claude.calls.length;
  w.entries.find(entry => entry.name === 'alpha').description = 'changed'; await w.writeMarket();
  assert.equal((await w.apply('alpha', checked.previewId)).code, 'SOURCE_CHANGED'); assert.equal(w.claude.calls.length, calls, '条目变化');
  await pack('1.0.0'); await w.install({ name: 'delta', source: { source: 'npm', package: '@t/delta' } }); await pack('1.1.0');
  checked = (await w.check('delta')).updateItem; await pack('1.2.0'); calls = w.claude.calls.length;
  assert.equal((await w.apply('delta', checked.previewId)).code, 'SOURCE_CHANGED'); assert.equal(w.claude.calls.length, calls, 'npm 包变化');
  const zip = async (name, body) => {
    const dir = path.join(w.root, `zip-${name}`); await plugin(path.join(dir, 'epsilon-main'), 'epsilon', { body });
    const file = path.join(w.root, `${name}.zip`); await fs.rm(file, { force: true }); await runProcess('/usr/bin/ditto', ['-c', '-k', '--keepParent', path.join(dir, 'epsilon-main'), file]);
    w.claude.fetched.archives ??= {}; w.claude.fetched.archives['https://example.invalid/e.zip'] = file;
  };
  await zip('one', 'v1'); await w.install({ name: 'epsilon', source: { source: 'archive', url: 'https://example.invalid/e.zip' } });
  await zip('two', 'v2'); checked = (await w.check('epsilon')).updateItem; await zip('three', 'v3'); calls = w.claude.calls.length;
  assert.equal((await w.apply('epsilon', checked.previewId)).code, 'SOURCE_CHANGED'); assert.equal(w.claude.calls.length, calls, '压缩包变化');
  // A marketplace Claude fetched from a remote: refreshed before the check.
  w.claude.marketplaces[0].source = 'github'; calls = w.claude.calls.length;
  await w.check('alpha');
  assert.ok(w.claude.calls.slice(calls).some(call => call.command === 'plugin marketplace update m --json'));
});

test('a plugin without a version: a copy that fails stops the update; the copy before a readback mismatch is kept, and goes after a later success (re-review A-M11, M15, M16)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/beta'), 'beta'); await w.install({ name: 'beta', source: './plugins/beta' });
  await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v2' });
  // The place for copies cannot be written: the update stops before Claude is asked.
  const copies = path.join(w.service.environments.local.root, 'claude-plugin-copies');
  let checked = (await w.check('beta')).updateItem; let calls = w.claude.calls.length;
  await write(copies, 'not a directory');
  const failed = await w.apply('beta', checked.previewId);
  assert.ok(failed.code, '复制失败即中止'); assert.equal(w.claude.calls.length, calls, '没有运行 plugin update');
  await fs.rm(copies);
  w.claude.tamper = true; checked = (await w.check('beta')).updateItem;
  assert.equal((await w.apply('beta', checked.previewId)).code, 'READBACK_CONTENT_CHANGED');
  const [slot] = await fs.readdir(copies);
  assert.ok(await fs.stat(path.join(copies, slot, 'baseline')).then(() => true, () => false), '读回不一致时保留更新前的副本');
  w.claude.tamper = false; await plugin(path.join(w.market, 'plugins/beta'), 'beta', { body: 'v3' });
  checked = (await w.check('beta')).updateItem;
  assert.match((await w.apply('beta', checked.previewId)).message, /已更新 Claude 插件 beta/);
  assert.equal(await fs.stat(path.join(copies, slot, 'baseline')).then(() => true, () => false), false, '成功后删除');
});

test('archive hosts: a name that merely starts with localhost is fine; this computer by any spelling is not (re-review P3-05)', async () => {
  const fetchImpl = async () => new Response('zip', { status: 200 });
  const { download } = defaultFetchers({ env: {}, fetchImpl });
  const file = path.join(os.tmpdir(), `skilldock-host-${crypto.randomUUID()}.zip`);
  try {
    await download('https://localhost.example.com/x.zip', file);
    for (const url of ['https://localhost/x.zip', 'https://127.0.0.2/x.zip', 'https://[::1]/x.zip', 'https://[::ffff:127.0.0.1]/x.zip'])
      await assert.rejects(download(url, file), error => error.code === 'INVALID_SOURCE' && /不能指向本机/.test(error.message), url);
  } finally { await fs.rm(file, { force: true }); }
});

test('the list and the preview say where a Claude plugin is installed and what its entry points at, without credentials (UAT 2026-10-10)', async t => {
  const w = await world(t);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.0.0' });
  await w.install({ name: 'alpha', source: './plugins/alpha' });
  const listed = (await w.snapshot()).updates.find(entry => entry.name === 'alpha');
  const installed = path.join(w.cache, 'm/alpha/1.0.0');
  assert.deepEqual([listed.installedPath, listed.sourceInfo.source, listed.sourceInfo.owner], [installed, 'marketplace m · ./plugins/alpha', 'Claude']);
  await plugin(path.join(w.market, 'plugins/alpha'), 'alpha', { version: '1.1.0', body: 'v2' });
  const checked = (await w.check('alpha')).updateItem;
  assert.deepEqual([checked.status, checked.installedPath, checked.sourceInfo.source], ['available', installed, 'marketplace m · ./plugins/alpha']);
  seen.add(checked.sourceInfo.evidence);
  const remote = entrySourceInfo(pluginSource({ source: { source: 'git-subdir', url: 'https://someone:secret@example.com/r.git', path: 'plugins/p', sha: 'abc123' } }, { source: 'github' }), 'm');
  assert.deepEqual([remote.source, remote.subpath, remote.ref], ['https://example.com/r.git', 'plugins/p', 'abc123']);
  assert.doesNotMatch(JSON.stringify(remote), /secret|someone/);
});

test('the plan binds where an entry lies, not the version it pins; a marketplace moved elsewhere is another place (HLD r24 P3-05, P3-06)', () => {
  const place = (entry, market) => entryPlace(pluginSource(entry, market));
  const git = ref => place({ source: { source: 'git-subdir', url: 'https://example.com/r.git', path: 'p', ...(ref ? { sha: ref } : {}) } }, { source: 'github' });
  assert.deepEqual(git('abc'), git('def')); assert.deepEqual(git('abc'), { kind: 'git', url: 'https://example.com/r.git', subpath: 'p' });
  assert.deepEqual(place({ source: { source: 'archive', url: 'https://dl.example.com/v1/p.zip' } }, {}), place({ source: { source: 'archive', url: 'https://dl.example.com/v2/p.zip?x=1' } }, {}));
  assert.notDeepEqual(place({ source: { source: 'archive', url: 'https://dl.example.com/p.zip' } }, {}), place({ source: { source: 'archive', url: 'https://other.example.com/p.zip' } }, {}));
  assert.deepEqual(place({ source: { source: 'npm', package: '@t/p', version: '1.0.0' } }, {}), place({ source: { source: 'npm', package: '@t/p', version: '2.0.0' } }, {}));
  assert.deepEqual(place({ source: { source: 'npm', package: 'https://registry.example.com/p-1.0.0.tgz' } }, {}).package, 'https://registry.example.com');
  const local = (marketSource) => entryPlace({ ...pluginSource({ source: './plugins/p' }, { source: 'github' }), marketSource });
  assert.deepEqual(local({ source: 'github', repo: 'owner/repo', ref: 'v1' }), local({ source: 'github', repo: 'owner/repo', ref: 'v2' }), '所固定的版本不进绑定');
  assert.notDeepEqual(local({ source: 'github', repo: 'owner/repo' }), local({ source: 'github', repo: 'someone/else' }), '换了仓库是另一个来源');
  assert.doesNotMatch(JSON.stringify(local({ source: 'git', url: 'https://user:secret@example.com/m.git' })), /secret/);
});

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 5, `${messages.length}`);
  // The refusals and network failures the cases above do not reach.
  await assertTranslated([...messages, '这个插件由 marketplace 声明的命令生成；SkillDock 不代为运行这个命令。可在 Claude Code 中用 /plugin 更新。', '无法识别这个插件的来源；可在 Claude Code 中用 /plugin 更新。',
    '这个 Claude 插件已不在，请刷新后重试。', '未找到这个插件的安装目录，请刷新后重试。', '这个插件的 marketplace 已不在 Claude 中，请刷新后重试。', '更新预览不属于这个插件。', '插件安装在预览后发生变化，请重新检查。',
    'marketplace 中这个插件的条目在预览后发生变化，请重新检查。', 'npm 包在预览后发生变化，请重新检查。', '压缩包在预览后发生变化，请重新检查。', '无法读取这个插件所在 marketplace 的本机副本；请刷新 marketplace 后再检查。',
    '这个插件已不在它的 marketplace 中；请刷新 marketplace 后再检查。', '插件来源越出 marketplace 根目录。', '无法解析来源的 Git 提交。', '无法下载这个 npm 包。', '压缩包来源只接受 https 地址。', '下载压缩包失败：HTTP 404。',
    '压缩包超过 100 MB。', '插件子目录越出仓库。', '下载的压缩包摘要与 marketplace 条目声明的不一致，已中止。', 'Claude 命令行列表的输出形状未知。',
    'Claude 命令行已返回，但装入的内容与预览不同；请重新检查。更新前的内容保留在 /tmp/x。']);
});
