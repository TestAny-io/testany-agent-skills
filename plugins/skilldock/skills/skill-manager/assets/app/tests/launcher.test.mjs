import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fingerprint, launch, probe } from '../../../scripts/launch.mjs';
import { fixture, listen, installedVersion } from './helpers/launcher-fixture.mjs';
import { acquireFileLock, operationLock } from '../server/process-lock.mjs';

const readRecordFile = async state => JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8'));
async function freePort() { const { server, port } = await listen(); await new Promise(resolve => server.close(resolve)); return port; }

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
  // The fresh data directory was migrated first; its record stays in the stopped form.
  assert.equal(JSON.parse(await fs.readFile(path.join(options.stateDir, 'launcher.json'), 'utf8')).status, 'stopped');
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

for (const held of ['instance', 'codex']) test(`a busy ${held} lock fails a restart before the old instance stops (HLD 3.7)`, async t => {
  const f = await fixture(t); const codexHome = path.join(f.root, 'codex home'); await fs.mkdir(codexHome);
  const options = { ...f, codexHome, port: await freePort() };
  const first = await launch('start', options);
  const release = acquireFileLock(held === 'instance' ? path.join(first.state, 'instance.lock') : operationLock(await fs.realpath(codexHome)));
  try {
    await assert.rejects(launch('restart', { ...options, lockWait: 300 }), /未停止现有服务/);
    assert.equal((await probe(first.url)).pid, first.pid, '旧实例仍在运行');
    assert.deepEqual([(await readRecordFile(first.state)).pid, (await readRecordFile(first.state)).status], [first.pid, 'running']);
  } finally { release(); await launch('stop', options); }
});

test('stop with busy locks still stops the process; the record follows on a later run', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options);
  const release = acquireFileLock(path.join(first.state, 'instance.lock'));
  try { assert.equal((await launch('stop', options)).status, 'stopped'); } finally { release(); }
  assert.equal(await probe(first.url), null);
  assert.equal((await launch('status', options)).status, 'stopped');
  const again = await launch('start', options);
  try { assert.notEqual(again.pid, first.pid); } finally { await launch('stop', options); }
});

test('a restart job that fails before the old instance stops is closed as failed without restored (G-12)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options); const appDir = await fs.realpath(f.appDir);
  try {
    await fs.writeFile(path.join(first.state, 'restart.json'), JSON.stringify({ id: 'job', source: appDir, sourceDigest: 'x', previousPid: first.pid, url: first.url, status: 'preparing' }));
    const file = path.join(f.appDir, 'package.json'); const value = JSON.parse(await fs.readFile(file, 'utf8'));
    value.scripts.build = 'node -e "process.exit(9)"'; await fs.writeFile(file, JSON.stringify(value));
    await assert.rejects(launch('restart', { ...options, restartJob: 'job' }), /失败（9）/);
    const job = JSON.parse(await fs.readFile(path.join(first.state, 'restart.json'), 'utf8'));
    assert.deepEqual([job.status, job.restored, typeof job.executor.pid], ['failed', undefined, 'number']);
    assert.equal((await probe(first.url)).pid, first.pid);
  } finally { await launch('stop', options); }
});

test('leftover jobs are closed as ready when the instance runs their source; a closed job is still accepted (G-17)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options); const appDir = await fs.realpath(f.appDir);
  const restartFile = path.join(first.state, 'restart.json');
  let last = first;
  try {
    await fs.writeFile(restartFile, JSON.stringify({ id: 'j1', source: appDir, sourceDigest: 'x', previousPid: first.pid, url: first.url, status: 'preparing' }));
    assert.equal((await launch('start', options)).reused, true);
    const closed = JSON.parse(await fs.readFile(restartFile, 'utf8'));
    assert.deepEqual([closed.status, closed.pid], ['ready', first.pid]);
    // Its own launcher arrives after the window and runs it (36b 7.4).
    last = await launch('restart', { ...options, restartJob: 'j1' });
    const ran = JSON.parse(await fs.readFile(restartFile, 'utf8'));
    assert.deepEqual([ran.status, ran.pid, typeof ran.executor.pid], ['ready', last.pid, 'number']);
  } finally { await launch('stop', options); }
});

test('a stopped record of a live instance is corrected by start and still stopped by stop (36b 6.3)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options);
  const write = async status => fs.writeFile(path.join(first.state, 'launcher.json'), JSON.stringify({ ...await readRecordFile(first.state), status }));
  await write('stopped');
  const again = await launch('start', options);
  assert.deepEqual([again.reused, (await readRecordFile(first.state)).status], [true, 'running']);
  await write('stopped');
  await launch('stop', options);
  assert.equal(await probe(first.url), null, '进程确实已停止');
  assert.equal((await readRecordFile(first.state)).status, 'stopped');
});

test('a version switch keeps the running project unless one is given explicitly (36b 6.3)', async t => {
  const f = await fixture(t); const port = await freePort();
  const other = path.join(f.root, 'other'); await fs.mkdir(other);
  const oldOptions = { ...await installedVersion(f, '0.11.0'), port, projectDir: other };
  const first = await launch('start', oldOptions);
  const { projectDir, ...nextOptions } = { ...await installedVersion(f, '0.11.1'), port };
  try {
    const next = await launch('start', nextOptions);
    assert.notEqual(next.pid, first.pid);
    assert.equal(next.project, await fs.realpath(other));
    assert.equal((await readRecordFile(next.state)).actualProject, await fs.realpath(other));
  } finally { await launch('stop', nextOptions); }
  assert.ok(projectDir);
});

test('every run on migrated data restores the fixed legacy directory and keeps the saved Codex home', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const custom = path.join(f.root, 'custom codex'); await fs.mkdir(custom);
  const first = await launch('start', { ...options, codexHome: custom });
  try {
    await fs.rm(path.join(first.state, 'compat/legacy-project'), { recursive: true });
    assert.equal((await launch('status', options)).status, 'running');
    assert.ok((await fs.stat(path.join(first.state, 'compat/legacy-project'))).isDirectory(), '36a 第 7 节：缺失即重建');
    const next = await launch('restart', options);
    assert.equal((await readRecordFile(next.state)).codexHome, await fs.realpath(custom), '没有 CODEX_HOME 时沿用记录中的值');
  } finally { await launch('stop', options); }
});
