import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { fingerprint, launch, probe } from '../../../scripts/launch.mjs';
import { ROOT_FILES } from '../scripts/source-bundle.mjs';

const MARKET = 'testany-agent-skills';
const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
// Launches never see this session's HOME, Codex or Claude variables.
const isolated = home => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDE|CODEX_|SKILLDOCK_|ANTHROPIC_)|^PORT$/.test(key))), HOME: home });

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock launcher '));
  const sourceRoot = path.join(root, 'software source');
  const appDir = path.join(sourceRoot, 'assets/app');
  const stateDir = path.join(root, 'app state');
  const projectDir = path.join(root, 'project');
  const home = path.join(root, 'home');
  await fs.mkdir(home);
  for (const folder of ['src', 'server', 'shared', 'scripts', 'tests']) await fs.mkdir(path.join(appDir, folder), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, 'scripts'), { recursive: true });
  for (const file of ROOT_FILES) await fs.copyFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), path.join(sourceRoot, file));
  await fs.copyFile(fileURLToPath(new URL('../scripts/source-bundle.mjs', import.meta.url)), path.join(appDir, 'scripts/source-bundle.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../server/installation.mjs', import.meta.url)), path.join(appDir, 'server/installation.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../server/toolchain.mjs', import.meta.url)), path.join(appDir, 'server/toolchain.mjs'));
  for (const file of ['codex-runtime.mjs', 'project-context.mjs']) await fs.copyFile(fileURLToPath(new URL(`../server/${file}`, import.meta.url)), path.join(appDir, `server/${file}`));
  await fs.mkdir(projectDir);
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'skilldock-launcher-fixture', version: '0.0.0', type: 'module',
    scripts: { build: 'node scripts/source-bundle.mjs --stage && node scripts/source-bundle.mjs' },
  }));
  await fs.writeFile(path.join(appDir, 'package-lock.json'), JSON.stringify({
    name: 'skilldock-launcher-fixture', version: '0.0.0', lockfileVersion: 3,
    packages: { '': { name: 'skilldock-launcher-fixture', version: '0.0.0' } },
  }));
  for (const file of ['tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'playwright.config.ts']) await fs.writeFile(path.join(appDir, file), 'fixture');
  await fs.writeFile(path.join(appDir, 'server/index.mjs'), `
    import http from 'node:http';
    const server = http.createServer((req,res) => {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({app:'skilldock',pid:process.pid,project:process.env.SKILLDOCK_PROJECT_DIR,state:process.env.SKILLDOCK_STATE_DIR}));
    });
    server.listen(Number(process.env.PORT),'127.0.0.1');
    process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
  `);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, sourceRoot, appDir, stateDir, projectDir, home, env: isolated(home), codexBin: path.join(root, 'absent-cli') };
}

async function listen() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('fingerprint includes distributed sources and license but excludes verification records and installed dependencies', async t => {
  const options = await fixture(t);
  const a = await fingerprint(options.appDir);
  await fs.mkdir(path.join(options.sourceRoot, 'references'));
  await fs.writeFile(path.join(options.sourceRoot, 'references/local-report.md'), 'user notes');
  await fs.mkdir(path.join(options.appDir, 'node_modules'));
  await fs.writeFile(path.join(options.appDir, 'node_modules/local-state.json'), 'private dependency data');
  assert.equal(await fingerprint(options.appDir), a);
  await fs.appendFile(path.join(options.sourceRoot, 'LICENSE'), '\nfixture change');
  const licensed = await fingerprint(options.appDir);
  assert.notEqual(licensed, a);
  await fs.writeFile(path.join(options.appDir, 'src/main.tsx'), 'changed interface');
  assert.notEqual(await fingerprint(options.appDir), licensed);
  await fs.symlink('/etc', path.join(options.appDir, 'src/escape'));
  await assert.rejects(fingerprint(options.appDir), /符号链接/);
});

test('status is read-only and a launcher lock refuses concurrent start', async t => {
  const options = await fixture(t);
  assert.equal((await launch('status', options)).status, 'stopped');
  await assert.rejects(fs.stat(options.stateDir), { code: 'ENOENT' });
  await fs.mkdir(options.stateDir);
  await fs.writeFile(path.join(options.stateDir, 'launcher.lock'), '');
  await assert.rejects(launch('start', options), /另一个启动/);
});

test('occupied ports are rejected without disturbing the listening service', async t => {
  const options = await fixture(t);
  const { server, port } = await listen();
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(launch('start', { ...options, port }), /已占用/);
  assert.equal(server.listening, true);
});

test('isolated runtime builds, reuses a matching process, and refuses an unverified PID', async t => {
  const options = await fixture(t);
  const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const startOptions = { ...options, port };
  const first = await launch('start', startOptions);
  const recordFile = path.join(options.stateDir, 'launcher.json');
  const recordText = await fs.readFile(recordFile, 'utf8');
  try {
    assert.equal(first.reused, false);
    assert.equal((await probe(first.url)).app, 'skilldock');
    const again = await launch('start', startOptions);
    assert.equal(again.reused, true);
    assert.equal(again.pid, first.pid);
    const record = JSON.parse(recordText);
    await fs.writeFile(recordFile, JSON.stringify({ ...record, pid: process.pid }));
    await assert.rejects(launch('stop', startOptions), /无法核实/);
    assert.equal((await probe(first.url)).pid, first.pid);
    await assert.rejects(fs.stat(path.join(options.appDir, 'node_modules')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(options.appDir, 'dist')), { code: 'ENOENT' });
  } finally {
    await fs.writeFile(recordFile, recordText);
    assert.equal((await launch('stop', startOptions)).status, 'stopped');
  }
  assert.equal((await launch('status', startOptions)).status, 'stopped');
});

test('a failed ownership-record write does not leave an unmanaged background service', async t => {
  const options = await fixture(t);
  const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  await fs.mkdir(path.join(options.stateDir, 'launcher.json.tmp'), { recursive: true });
  await assert.rejects(launch('start', { ...options, port }), { code: 'EISDIR' });
  assert.equal(await probe(`http://127.0.0.1:${port}`), null);
  await assert.rejects(fs.stat(path.join(options.stateDir, 'launcher.json')), { code: 'ENOENT' });
  const tester = net.createServer();
  await new Promise((resolve, reject) => { tester.once('error', reject); tester.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => tester.close(resolve));
});

test('stop waits for graceful process exit before allowing another instance to use its state', async t => {
  const options = await fixture(t);
  const entry = path.join(options.appDir, 'server/index.mjs');
  await fs.writeFile(entry, (await fs.readFile(entry, 'utf8')).replace('server.close(()=>process.exit(0))', 'server.close(()=>setTimeout(()=>process.exit(0),500))'));
  const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const running = await launch('start', { ...options, port });
  await launch('stop', options);
  assert.throws(() => process.kill(running.pid, 0), { code: 'ESRCH' });
});

test('start rebuilds a corrupted generated runtime instead of serving mismatched source', async t => {
  const options = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const startOptions = { ...options, port }; const first = await launch('start', startOptions);
  try {
    const record = JSON.parse(await fs.readFile(path.join(options.stateDir, 'launcher.json'), 'utf8'));
    await fs.appendFile(path.join(record.runtime, 'server/index.mjs'), '\n// unbuilt local edit\n');
    const second = await launch('start', startOptions);
    assert.equal(second.reused, false); assert.notEqual(second.pid, first.pid);
    assert.deepEqual(await fs.readFile(path.join(record.runtime, 'server/index.mjs')), await fs.readFile(path.join(options.appDir, 'server/index.mjs')));
    assert.deepEqual(await fs.readFile(path.join(record.runtime, 'dist/skilldock-source.tar.gz')), await fs.readFile(path.join(record.runtime, '.source-snapshot/skilldock-source.tar.gz')));
  } finally { await launch('stop', startOptions); }
});

async function installedVersion(options, version, { plugin = 'skilldock' } = {}) {
  const codexHome = path.join(options.root, 'codex');
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nsource_type = "git"\nsource = "${SOURCE}"\n`);
  const packageRoot = path.join(codexHome, 'plugins/cache', MARKET, plugin, version);
  const skill = path.join(packageRoot, 'skills/skill-manager');
  await fs.cp(options.sourceRoot, skill, { recursive: true });
  await fs.mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, '.codex-plugin/plugin.json'), JSON.stringify({ name: plugin, version }));
  await fs.writeFile(path.join(skill, 'scripts/launch.sh'), '#!/bin/sh\nexit 1\n');
  for (const file of ['package.json', 'package-lock.json']) {
    const target = path.join(skill, 'assets/app', file); const value = JSON.parse(await fs.readFile(target, 'utf8'));
    value.name = 'skilldock'; value.version = version; if (value.packages) value.packages[''] = { name: 'skilldock', version };
    await fs.writeFile(target, JSON.stringify(value));
  }
  await fs.appendFile(path.join(skill, 'assets/app/README.md'), `\n${version}`);
  return { ...options, codexHome, appDir: path.join(skill, 'assets/app') };
}

test('a newer installation of the same product family takes over the data; other plugins are refused', async t => {
  const f = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const firstOptions = { ...await installedVersion(f, '0.11.0'), port };
  const unrelated = { ...await installedVersion(f, '0.11.0', { plugin: 'other-plugin' }), port };
  const first = await launch('start', firstOptions);
  const sentinel = path.join(first.state, 'saved-plan-and-history.json');
  await fs.writeFile(sentinel, '{"plan":"every day","history":["kept"]}');
  let nextOptions;
  try {
    await assert.rejects(launch('start', unrelated), /另一个安装来源/);
    assert.equal((await probe(first.url)).pid, first.pid);
    nextOptions = { ...await installedVersion(f, '0.11.1'), port };
    // DEC-SDX-008: the older launcher hands over to the newer installation.
    await assert.rejects(launch('start', firstOptions), error => error.code === 'SKILLDOCK_DELEGATE' && error.target.version === '0.11.1');
    assert.equal((await launch('status', firstOptions)).pid, first.pid, 'status 与 stop 不转交');
    await fs.rm(path.resolve(firstOptions.appDir, '../../../..'), { recursive: true, force: true });
    const next = await launch('start', nextOptions);
    assert.notEqual(next.pid, first.pid);
    assert.equal(next.state, first.state);
    assert.equal(await fs.readFile(sentinel, 'utf8'), '{"plan":"every day","history":["kept"]}');
    const record = JSON.parse(await fs.readFile(path.join(next.state, 'launcher.json'), 'utf8'));
    const nextApp = await fs.realpath(nextOptions.appDir);
    assert.deepEqual([record.format, record.generation, record.status], [2, 2, 'running']);
    assert.deepEqual([record.running.appPath, record.running.version, record.running.sourceKey], [nextApp, '0.11.1', 'github.com/testany-io/testany-agent-skills']);
    assert.equal(record.source, nextApp); assert.equal(record.installation.plugin, 'skilldock');
    assert.equal(record.project, path.join(next.state, 'compat/legacy-project'));
    assert.equal(record.actualProject, await fs.realpath(f.projectDir));
    assert.equal(JSON.parse(await fs.readFile(path.join(next.state, 'generation.json'), 'utf8')).generation, 2);
    assert.equal((await launch('status', nextOptions)).pid, next.pid);
  } finally { await launch('stop', nextOptions ?? firstOptions); }
  const stopped = JSON.parse(await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8'));
  assert.equal(stopped.status, 'stopped', '0.11 停止后保留“已停止”形态的记录');
});

test('failed new-version builds leave the old service and ownership record intact', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '0.11.0'), port };
  const first = await launch('start', oldOptions);
  const nextOptions = { ...await installedVersion(fixtureOptions, '0.11.1'), port };
  const packageFile = path.join(nextOptions.appDir, 'package.json');
  const metadata = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  metadata.scripts.build = 'node -e "process.exit(9)"';
  await fs.writeFile(packageFile, JSON.stringify(metadata));
  const ownership = await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8');
  try {
    await assert.rejects(launch('start', nextOptions), /失败（9）/);
    assert.equal((await probe(first.url)).pid, first.pid);
    assert.equal(await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8'), ownership);
  } finally { await launch('stop', nextOptions); }
});

test('failed new-version startup restores the verified old runtime without replacing saved plans', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '0.11.0'), port };
  const first = await launch('start', oldOptions);
  const nextOptions = { ...await installedVersion(fixtureOptions, '0.11.1'), port };
  await fs.writeFile(path.join(nextOptions.appDir, 'server/index.mjs'), 'process.exit(7);');
  const oldRecord = JSON.parse(await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8'));
  const sentinel = path.join(first.state, 'updates.json'); await fs.writeFile(sentinel, '{"targets":["skilldock"]}');
  await fs.rm(path.resolve(oldOptions.appDir, '../../../..'), { recursive: true, force: true });
  try {
    await assert.rejects(launch('start', nextOptions), /已恢复上一运行版本/);
    const running = await launch('status', nextOptions);
    assert.equal(running.status, 'running');
    assert.notEqual(running.pid, first.pid);
    const restored = JSON.parse(await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8'));
    assert.equal(restored.source, oldRecord.source); assert.equal(restored.digest, oldRecord.digest);
    assert.deepEqual(restored.running, oldRecord.running);
    assert.equal(await fs.readFile(sentinel, 'utf8'), '{"targets":["skilldock"]}');
  } finally { await launch('stop', nextOptions); }
});

test('an explicit stop during preparation cancels the automatic replacement instead of restarting later', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '0.11.0'), port };
  const old = await launch('start', oldOptions);
  const nextOptions = { ...await installedVersion(fixtureOptions, '0.11.1'), port };
  const marker = path.join(fixtureOptions.root, 'build-started');
  await fs.writeFile(path.join(nextOptions.appDir, 'tests/delayed-build.mjs'), `import fs from 'node:fs/promises'; await fs.writeFile(${JSON.stringify(marker)}, 'started'); await new Promise(resolve => setTimeout(resolve, 1500));`);
  const file = path.join(nextOptions.appDir, 'package.json'); const value = JSON.parse(await fs.readFile(file, 'utf8'));
  value.scripts.build = 'node scripts/source-bundle.mjs --stage && node tests/delayed-build.mjs && node scripts/source-bundle.mjs';
  await fs.writeFile(file, JSON.stringify(value));
  const upgrading = assert.rejects(launch('start', nextOptions), /运行实例已变化/);
  for (let i = 0; i < 100; i++) { if (await fs.stat(marker).catch(() => null)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(await fs.stat(marker));
  await launch('stop', oldOptions); await upgrading;
  assert.equal(await probe(old.url), null);
  assert.equal((await launch('status', nextOptions)).status, 'stopped');
});

test.skip('explicit migration from testany-eng to independent skilldock retains data and rejects unrelated identities（阶段 1c：0.10.x 数据迁移实现后改写）', () => {});

test('a 0.10.x restart job is accepted with an executor mark and always closed; leftovers are closed by the next start', async t => {
  const f = await fixture(t); const { server, port } = await listen(); await new Promise(resolve => server.close(resolve));
  const options = { ...f, port }; const appDir = await fs.realpath(f.appDir);
  const first = await launch('start', options);
  const restartFile = path.join(first.state, 'restart.json');
  try {
    // The digest of a 0.10.x job is not compared (36b §7.4).
    const job = { id: 'job-1', source: appDir, sourceDigest: 'from-0.10.x', previousPid: first.pid, url: first.url, status: 'preparing', requestedAt: new Date().toISOString() };
    await fs.writeFile(restartFile, JSON.stringify(job));
    const next = await launch('restart', { ...options, restartJob: 'job-1' });
    const done = JSON.parse(await fs.readFile(restartFile, 'utf8'));
    assert.deepEqual([done.status, done.pid, done.executor.pid], ['ready', next.pid, process.pid]);
    // A job left in progress by another source is closed as failed by a successful start.
    await fs.writeFile(restartFile, JSON.stringify({ ...job, id: 'job-2', source: path.join(f.root, 'elsewhere'), previousPid: next.pid }));
    assert.equal((await launch('start', options)).reused, true);
    assert.equal(JSON.parse(await fs.readFile(restartFile, 'utf8')).status, 'failed');
    // A mismatched job is refused before anything is written.
    await fs.writeFile(restartFile, JSON.stringify({ ...job, id: 'job-3', previousPid: 1 }));
    await assert.rejects(launch('restart', { ...options, restartJob: 'job-3' }), /不匹配/);
    assert.equal(JSON.parse(await fs.readFile(restartFile, 'utf8')).executor, undefined);
  } finally { await launch('stop', options); }
});

test('newer data stops every action with exit code 3 before anything is written', async t => {
  const f = await fixture(t); await fs.mkdir(f.stateDir, { recursive: true });
  await fs.writeFile(path.join(f.stateDir, 'generation.json'), JSON.stringify({ format: 1, generation: 3, minimumCompatibleGeneration: 3 }));
  for (const action of ['start', 'status', 'stop']) {
    await assert.rejects(launch(action, f), error => error.exitCode === 3 && error.output.status === 'update-required');
  }
  assert.deepEqual((await fs.readdir(f.stateDir)).sort(), ['generation.json']);
});

test('status and stop keep identifying a service after its scan project changes', async t => {
  const f = await fixture(t); let other = path.join(f.root, 'other project'); await fs.mkdir(other); other = await fs.realpath(other);
  const entry = path.join(f.appDir, 'server/index.mjs');
  let source = await fs.readFile(entry, 'utf8');
  source = source.replace('const server = http.createServer', 'let selected = process.env.SKILLDOCK_PROJECT_DIR; const server = http.createServer');
  source = source.replace("res.setHeader('Content-Type'", `if(req.url==='/switch') selected=${JSON.stringify(other)}; res.setHeader('Content-Type'`);
  source = source.replace('project:process.env.SKILLDOCK_PROJECT_DIR', 'project:selected,launchProject:process.env.SKILLDOCK_PROJECT_DIR');
  await fs.writeFile(entry, source);
  const { server, port } = await listen(); await new Promise(resolve => server.close(resolve));
  const options = { ...f, port }; const first = await launch('start', options);
  try {
    await fetch(first.url + '/switch');
    assert.equal((await launch('status', options)).project, other);
    assert.equal((await launch('start', { ...options, projectDir: other })).pid, first.pid);
  } finally { assert.equal((await launch('stop', options)).status, 'stopped'); }
});
