import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fingerprint, launch, probe, refused, processCommand as readCommand } from '../../../scripts/launch.mjs';
import { fixture, listen, installedVersion, installedClaudeVersion } from './helpers/launcher-fixture.mjs';
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

// A service of 0.11.2 or before, told to stop, could close its listener and stay: a connection a page kept
// using held it (real machine, 2026-10-13). The stand-in closes its listener and never exits.
const staysAfterClosing = async options => {
  const entry = path.join(options.appDir, 'server/index.mjs');
  await fs.writeFile(entry, (await fs.readFile(entry, 'utf8')).replace("import http from 'node:http';", "import http from 'node:http'; import { appendFileSync } from 'node:fs';")
    .replace('server.close(()=>process.exit(0))', "(appendFileSync(process.env.SKILLDOCK_STATE_DIR + '/told', 'x'),(server.close(),setInterval(()=>{},1000)))"));
};
// How many times the stand-in was told to stop.
const told = async state => (await fs.readFile(path.join(state, 'told'), 'utf8').catch(() => '')).length;
// Told to stop, this one keeps its listener and answers too late for a health check: a write under way
// on a machine too busy to answer in time.
const slowOnceToldToStop = async options => {
  const entry = path.join(options.appDir, 'server/index.mjs'); const source = await fs.readFile(entry, 'utf8');
  const changed = source.replace('const server =', 'let slow = 0; const server =').replace('res.end(JSON.stringify(', 'const body = JSON.stringify(')
    .replace('SKILLDOCK_STATE_DIR}));', 'SKILLDOCK_STATE_DIR}); setTimeout(() => res.end(body), slow);').replace('server.close(()=>process.exit(0))', '(slow = 4000)');
  assert.ok(changed.includes('slow = 4000') && changed.includes('setTimeout(() => res.end(body), slow)'), 'the stand-in was rewritten');
  await fs.writeFile(entry, changed);
};
// A record as 0.10.x wrote it for the same running process: no format, and the project its health check reports.
const asLegacyRecord = async state => {
  const file = path.join(state, 'launcher.json'); const { format, ...record } = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...record, project: record.actualProject }));
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async condition => { for (let i = 0; i < 100; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); } assert.fail('condition not reached'); };

test('nothing listens at an address only when a connection there is refused', async t => {
  const port = await freePort(); assert.equal(await refused(`http://127.0.0.1:${port}`), true);
  // A listener that accepts and never answers is a listener.
  const silent = net.createServer(socket => socket.on('error', () => {})); await new Promise(resolve => silent.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => silent.close(resolve)));
  assert.equal(await refused(`http://127.0.0.1:${port}`), false);
  // An address that cannot be tried says nothing.
  for (const url of ['not a url', 'http://localhost', 'http://skilldock.invalid:1', 'http://127.0.0.1']) assert.equal(await refused(url), false, url);
  // Nor does a connection that gets no answer in time, or fails in any other way (a sandbox that lets
  // nothing connect answers with a permission error): only the refusal itself counts.
  const failing = code => () => { const socket = new net.Socket(); setImmediate(() => socket.emit('error', Object.assign(new Error(code), { code }))); return socket; };
  assert.equal(await refused('http://127.0.0.1:9', { connect: () => new net.Socket(), wait: 50 }), false);
  for (const [code, expected] of [['EPERM', false], ['EACCES', false], ['ETIMEDOUT', false], ['EHOSTUNREACH', false], ['ECONNREFUSED', true]])
    assert.equal(await refused('http://127.0.0.1:9', { connect: failing(code) }), expected, code);
});

test('a verified service that closed its listener and stayed is ended by the stop that told it to; one that still answers is left to finish', async t => {
  const options = await fixture(t); await staysAfterClosing(options);
  const first = await launch('start', { ...options, port: await freePort() });
  t.after(() => { try { process.kill(first.pid, 'SIGKILL'); } catch { /* gone */ } });
  assert.equal((await launch('stop', { ...options, stopWait: 10 })).status, 'stopped');
  assert.equal(alive(first.pid), false); assert.equal((await readRecordFile(first.state)).status, 'stopped');
  // Still listening after ten seconds (here one): it is finishing a write, and nothing is forced.
  const entry = path.join(options.appDir, 'server/index.mjs');
  await fs.writeFile(entry, (await fs.readFile(entry, 'utf8')).replace('(server.close(),setInterval(()=>{},1000))', '0'));
  const second = await launch('start', { ...options, port: await freePort() });
  t.after(() => { try { process.kill(second.pid, 'SIGKILL'); } catch { /* gone */ } });
  await assert.rejects(launch('stop', { ...options, stopWait: 10 }), /服务尚未停止/);
  assert.equal(alive(second.pid), true); assert.equal((await probe(second.url)).pid, second.pid); assert.equal((await readRecordFile(second.state)).status, 'running');
});

test('a service that still listens is never ended, however late it answers: neither by the stop that told it to nor by a later start', { timeout: 60000 }, async t => {
  const options = await fixture(t); await slowOnceToldToStop(options); const port = await freePort();
  const first = await launch('start', { ...options, port }); const record = await readRecordFile(first.state);
  t.after(() => { try { process.kill(first.pid, 'SIGKILL'); } catch { /* gone */ } });
  // Verified, told to stop, and from then on too slow for the health check: it is in a write.
  await assert.rejects(launch('stop', { ...options, stopWait: 10 }), /服务尚未停止/);
  assert.equal(await probe(first.url), null, 'no health answer in time');
  assert.equal(alive(first.pid), true); assert.equal((await readRecordFile(first.state)).status, 'running');
  // A start then finds it alive, unanswering, and by the process table the record's runtime serving: still not ended.
  const processCommand = async () => `${process.execPath} ${path.join(record.runtime, 'server/index.mjs')}`;
  await assert.rejects(launch('start', { ...options, port, processCommand }), /无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。/);
  assert.equal(alive(first.pid), true);
});

test('a 0.10.x record\'s service is not ended by either rule: it is not presumed to close its listener after its writes', async t => {
  const options = await fixture(t); await staysAfterClosing(options);
  const first = await launch('start', { ...options, port: await freePort() }); const record = await readRecordFile(first.state);
  t.after(() => { try { process.kill(first.pid, 'SIGKILL'); } catch { /* gone */ } });
  await asLegacyRecord(first.state);
  // Verified and told to stop; its listener closes and it stays.
  await assert.rejects(launch('stop', { ...options, stopWait: 10 }), /服务尚未停止/);
  assert.equal(alive(first.pid), true); assert.equal(await probe(first.url), null);
  // Alive, nothing listening, the command line the launcher started: refused all the same.
  const processCommand = async () => `${process.execPath} ${path.join(record.runtime, 'server/index.mjs')}`;
  await assert.rejects(launch('stop', { ...options, stopWait: 10, processCommand }), /无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。/);
  assert.equal(alive(first.pid), true);
});

test('a start finds the record\'s service alive and answering nobody: known by what it runs, it is ended; anything else is refused with what to do', async t => {
  const options = await fixture(t); await staysAfterClosing(options); const port = await freePort();
  const first = await launch('start', { ...options, port }); const record = await readRecordFile(first.state);
  t.after(() => { try { process.kill(first.pid, 'SIGKILL'); } catch { /* gone */ } });
  // What a launcher of 0.11.2 left: told to stop, the listener closed, the process and the record as they were.
  process.kill(first.pid, 'SIGTERM'); await until(async () => !(await probe(first.url)));
  assert.equal(alive(first.pid), true);
  const serving = `${process.execPath} ${path.join(record.runtime, 'server/index.mjs')}`;
  // The process table cannot be asked (a sandbox, Windows), or names something else: refused, nothing ended.
  const entry = path.join(record.runtime, 'server/index.mjs');
  for (const processCommand of [async () => null, async () => { throw new Error('no ps'); }, async () => '/usr/bin/node /somewhere/else/server/index.mjs', async () => `${serving} --more`,
    // Another program on that file, another Node, the record's Node with more before the file.
    async () => `/usr/bin/vim ${entry}`, async () => `/somewhere/else/bin/node ${entry}`, async () => `${process.execPath} --inspect ${entry}`]) {
    await assert.rejects(launch('start', { ...options, port, processCommand }), /无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。若刚更新过 SkillDock/);
    assert.equal(alive(first.pid), true);
  }
  // The Node is the record's, not the launcher's own: a record that names another one does not match this command line.
  const recordFile = path.join(first.state, 'launcher.json');
  await fs.writeFile(recordFile, JSON.stringify({ ...record, execution: { ...record.execution, node: '/somewhere/else/bin/node' } }));
  await assert.rejects(launch('start', { ...options, port, processCommand: async () => serving }), /无法核实/); assert.equal(alive(first.pid), true);
  await fs.writeFile(recordFile, JSON.stringify(record));
  // Something else listens at its address, whatever it answers: not this case either.
  for (const answer of [response => response.end('{"app":"other"}'), response => { response.statusCode = 404; response.end('not found'); }, response => response.end('<html>')]) {
    const other = http.createServer((request, response) => { response.setHeader('Connection', 'close'); answer(response); });
    await new Promise(resolve => other.listen(port, '127.0.0.1', resolve));
    try { await assert.rejects(launch('start', { ...options, port, processCommand: async () => serving }), /无法核实/); assert.equal(alive(first.pid), true); }
    finally { other.closeAllConnections(); await new Promise(resolve => other.close(resolve)); }
  }
  // It is the record's runtime serving, and nothing answers: ended, and the start goes on.
  const asked = []; const processCommand = async pid => { asked.push(pid); return serving; };
  const next = await launch('start', { ...options, port, processCommand });
  t.after(() => { try { process.kill(next.pid, 'SIGKILL'); } catch { /* gone */ } });
  assert.deepEqual([asked, alive(first.pid), next.pid !== first.pid, (await probe(next.url)).pid], [[first.pid], false, true, next.pid]);
  // It was told once more before it was forced.
  assert.equal(await told(first.state), 2);
});

test('a recorded service that goes on its own while it is being looked at is a stopped one, not an error', async t => {
  const options = await fixture(t); await staysAfterClosing(options);
  const first = await launch('start', { ...options, port: await freePort() }); const record = await readRecordFile(first.state);
  t.after(() => { try { process.kill(first.pid, 'SIGKILL'); } catch { /* gone */ } });
  process.kill(first.pid, 'SIGTERM'); await until(async () => !(await probe(first.url)));
  // Gone between the look at the process table and the signal.
  const processCommand = async pid => { process.kill(pid, 'SIGKILL'); await until(() => !alive(pid)); return `${process.execPath} ${path.join(record.runtime, 'server/index.mjs')}`; };
  assert.equal((await launch('stop', { ...options, processCommand })).status, 'stopped');
  assert.equal((await readRecordFile(first.state)).status, 'stopped');
});

// Where the process table can be asked (not in a sandbox, where the answer is null): the command line of a
// process started as the launcher starts a service, exactly, from a path with spaces and non-ASCII
// letters and with no locale set (a desktop app's environment has none).
test('the process table gives a service\'s command line as it was started, whatever the path and the locale', async t => {
  const options = await fixture(t); const entry = path.join(options.root, '运行 目录', 'server/index.mjs');
  await fs.mkdir(path.dirname(entry), { recursive: true }); await fs.writeFile(entry, 'setTimeout(() => {}, 60000);');
  const child = spawn(process.execPath, [entry], { stdio: 'ignore' }); t.after(() => child.kill('SIGKILL'));
  await new Promise(resolve => child.once('spawn', resolve));
  const locale = ['LANG', 'LC_ALL', 'LC_CTYPE'].map(key => [key, process.env[key]]); for (const [key] of locale) delete process.env[key];
  try { const read = await readCommand(child.pid); assert.ok(read === null || read === `${process.execPath} ${entry}`, String(read)); }
  finally { for (const [key, value] of locale) if (value !== undefined) process.env[key] = value; }
  assert.equal(await readCommand(0), null);
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
    // A failed build is not a failed download: only dependency installation names the network (41 UI-15).
    await assert.rejects(launch('start', nextOptions), error => /失败（9）/.test(error.message) && !error.message.includes('联网'));
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
    // Generation 2 too: the failed target is recorded, so restart jobs into it are refused (5d review P2-01).
    const failure = JSON.parse(await fs.readFile(path.join(first.state, 'compat/migration-failure.json'), 'utf8'));
    assert.deepEqual([failure.version, await fs.realpath(failure.appDir)], ['0.11.1', await fs.realpath(nextOptions.appDir)]);
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
    // A job that failed while its target runs after all is ready too; one that failed for another source stays failed
    // (real machine, 2026-10-13: the notice of a failed restart stayed on a page the new version itself served).
    const failed = { id: 'j2', source: appDir, sourceDigest: 'x', previousPid: 1, url: first.url, status: 'failed', message: '服务尚未停止；保留启动记录，请稍后检查状态。' };
    await fs.writeFile(restartFile, JSON.stringify(failed)); await launch('start', options);
    assert.deepEqual([JSON.parse(await fs.readFile(restartFile, 'utf8'))].map(job => [job.status, job.pid, job.message]), [['ready', last.pid, undefined]]);
    const elsewhere = { ...failed, source: `${appDir}-other` };
    await fs.writeFile(restartFile, JSON.stringify(elsewhere)); await launch('start', options);
    assert.deepEqual(JSON.parse(await fs.readFile(restartFile, 'utf8')), elsewhere, 'left exactly as it failed');
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
    const { result: next, stderr } = await stderrOf(() => launch('start', nextOptions));
    assert.equal(stderr.match(/最终扫描目录 /g)?.length, 1, stderr);
    assert.ok(stderr.includes(`最终扫描目录 ${await fs.realpath(other)}（沿用运行实例的项目）`), stderr);
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

async function stderrOf(run) {
  const write = process.stderr.write; let text = '';
  process.stderr.write = (chunk, ...rest) => { text += String(chunk); return write.call(process.stderr, chunk, ...rest); };
  try { return { result: await run(), stderr: text }; } finally { process.stderr.write = write; }
}

test('a skipped --project is noted on stderr only, and the final directory is the one scanned (36b 6.3; UAT 2026-10-10)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options);
  const legacy = path.join(first.state, 'compat/legacy-project');
  await launch('stop', options);
  // The native entry passes the record's legacy directory: the fallback chain picks the project, no notice.
  const { result: next, stderr } = await stderrOf(() => launch('start', { ...options, projectDir: legacy }));
  try {
    assert.equal(next.reused, false);
    assert.deepEqual(next.projectContext.warnings, [], '不另弹提示');
    assert.deepEqual(Object.keys(next.projectContext).sort(), ['effective', 'requested', 'source', 'warnings', 'workingDirectory'], 'skipped 不进入服务');
    assert.match(stderr, /已跳过无效的项目目录 .*legacy-project（--project）/);
    assert.equal(stderr.match(/最终扫描目录 /g)?.length, 1, stderr);
    // Without an explicit project the running instance keeps its own; stderr says which.
    const { projectDir, ...implicit } = options;
    const elsewhere = path.join(f.root, 'elsewhere'); await fs.mkdir(elsewhere);
    const cwd = process.cwd(); process.chdir(elsewhere);
    let reused;
    try { reused = await stderrOf(() => launch('start', implicit)); } finally { process.chdir(cwd); }
    assert.deepEqual([reused.result.reused, reused.result.project], [true, next.project]);
    assert.ok(reused.stderr.includes(`最终扫描目录 ${next.project}（沿用运行实例的项目）`), reused.stderr);
    assert.equal(reused.stderr.match(/最终扫描目录 /g)?.length, 1, reused.stderr);
  } finally { await launch('stop', options); }
});

test('the saved-project note is written only for a caller directory: not in a 0.10.3 handover, not from the native entry (62 UF-P3-01, r3 UF3-P3-02)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const first = await launch('start', options);
  await launch('stop', options);
  await fs.writeFile(path.join(first.state, 'project.json'), JSON.stringify({ path: f.projectDir }));
  const { projectDir, ...implicit } = options;
  const elsewhere = path.join(f.root, 'elsewhere'); await fs.mkdir(elsewhere);
  const cwd = process.cwd();
  let handover; let native; let caller; let switched; let strayHandover; let atProject; let explicit;
  const legacy = path.join(first.state, 'compat/legacy-project'); await fs.mkdir(legacy, { recursive: true });
  const other = path.join(f.root, 'other-project'); await fs.mkdir(other);
  try {
    // 36b 6.2: a 0.10.3 handover runs in the data directory and takes the saved project.
    process.chdir(first.state);
    handover = await stderrOf(() => launch('start', { ...implicit, env: { ...options.env, SKILLDOCK_HANDOVER: '1' } }));
    // The 0.10.2 native entry passes the fixed legacy directory as --project and runs in it.
    process.chdir(legacy);
    native = await stderrOf(() => launch('start', { ...options, projectDir: legacy }));
    process.chdir(elsewhere);
    caller = await stderrOf(() => launch('start', implicit));
    // A handover that does not run in the data directory is still not a caller (67 IF-P3-01).
    strayHandover = await stderrOf(() => launch('start', { ...implicit, env: { ...options.env, SKILLDOCK_HANDOVER: '1' } }));
    // Nor is the note written from the saved project itself, or for a project given explicitly (67 IF-P3-02).
    process.chdir(f.projectDir);
    atProject = await stderrOf(() => launch('start', implicit));
    process.chdir(elsewhere);
    explicit = await stderrOf(() => launch('start', { ...options, projectDir: f.projectDir }));
    // The instance switched to another project: an implicit run keeps it and says nothing of the saved one.
    await launch('start', { ...options, projectDir: other });
    switched = await stderrOf(() => launch('start', implicit));
  } finally { process.chdir(cwd); await launch('stop', options); }
  const saved = await fs.realpath(f.projectDir);
  assert.deepEqual([handover.result.project, caller.result.project, caller.result.reused], [saved, saved, true]);
  assert.ok(!handover.stderr.includes('使用界面保存的项目'), handover.stderr);
  assert.deepEqual([native.result.project, native.result.reused], [saved, true]);
  assert.match(native.stderr, /已跳过无效的项目目录 .*legacy-project（--project）/);
  assert.ok(!native.stderr.includes('使用界面保存的项目'), native.stderr);
  assert.ok(caller.stderr.includes('使用界面保存的项目'), caller.stderr);
  for (const [name, run] of Object.entries({ strayHandover, atProject, explicit })) {
    assert.deepEqual([run.result.project, run.result.reused], [saved, true], name);
    assert.ok(!run.stderr.includes('使用界面保存的项目'), `${name}: ${run.stderr}`);
  }
  const kept = await fs.realpath(other);
  assert.deepEqual([switched.result.reused, switched.result.project], [true, kept]);
  assert.ok(switched.stderr.includes(`最终扫描目录 ${kept}（沿用运行实例的项目）`), switched.stderr);
  assert.ok(!switched.stderr.includes('使用界面保存的项目'), switched.stderr);
});

test('the symlink note is written with the final directory, and only when that is the requested project (62 r3 UF3-P3-02)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const link = path.join(f.root, 'link'); await fs.symlink(f.projectDir, link);
  const other = path.join(f.root, 'other-project'); await fs.mkdir(other);
  const { projectDir, ...implicit } = options;
  const note = '请求目录包含符号链接，扫描使用解析后的真实目录。';
  let first; let kept;
  try {
    first = await stderrOf(() => launch('start', { ...options, projectDir: link }));
    await fs.writeFile(path.join(first.result.state, 'project.json'), JSON.stringify({ path: link }));
    // The saved project is the link, but the instance keeps the project it was switched to.
    await launch('start', { ...options, projectDir: other });
    kept = await stderrOf(() => launch('start', implicit));
  } finally { await launch('stop', options); }
  const real = await fs.realpath(f.projectDir);
  assert.equal(first.result.project, real);
  assert.equal(first.stderr.split(note).length, 2, first.stderr);
  assert.ok(first.stderr.indexOf(note) > first.stderr.indexOf(`最终扫描目录 ${real}\n`) && first.stderr.includes(`最终扫描目录 ${real}\n`), first.stderr);
  assert.deepEqual([kept.result.reused, kept.result.project], [true, await fs.realpath(other)]);
  assert.ok(kept.stderr.includes(`请求项目目录 ${link}（saved）`), kept.stderr);
  assert.ok(!kept.stderr.includes(note), kept.stderr);
});

test('dependency and build output goes to build.log, which starts over past 1 MiB (36b 6.3)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  await fs.mkdir(f.stateDir, { recursive: true });
  const log = path.join(f.stateDir, 'build.log'); await fs.writeFile(log, 'x'.repeat(1024 * 1024 + 1));
  const first = await launch('start', options);
  try {
    assert.equal((await fs.stat(`${log}.1`)).size, 1024 * 1024 + 1, '上一份日志保留为 .1');
    assert.match(await fs.readFile(log, 'utf8'), /source-bundle/, '本次构建输出写入 build.log');
  } finally { await launch('stop', options); }
  assert.ok(first.pid);
});

test('the launch says dependencies need the network, before preparing and when their installation fails (41 UI-15)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  // An unreadable lockfile fails `npm ci` at once, with no network access.
  await fs.writeFile(path.join(f.appDir, 'package-lock.json'), '{');
  let failure;
  const { stderr } = await stderrOf(() => launch('start', options).catch(error => { failure = error; }));
  assert.match(stderr, /准备隔离运行目录与锁定的依赖（[^）]*需要联网）/);
  // It names the step and does not claim the cause: this very failure has nothing to do with the network (67 IF-P3-07).
  assert.match(failure?.message ?? '', /失败（\d+）；这一步是安装依赖，需要联网：若本机离线，请联网后重试，详见 .*build\.log$/);
  assert.equal((await launch('status', options)).status, 'stopped');
});

test('the service inherits only allowed variables; the command line of a Claude session is recorded, its variables are not passed on (DEC-SDX-024)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const entry = path.join(f.appDir, 'server/index.mjs');
  await fs.writeFile(entry, (await fs.readFile(entry, 'utf8')).replace("server.listen(", "(await import('node:fs')).writeFileSync(process.env.SKILLDOCK_STATE_DIR + '/service-env.json', JSON.stringify(Object.keys(process.env))); server.listen("));
  // The Codex command-line probe and the dependency build record what they receive too.
  const seen = path.join(f.root, 'seen'); await fs.mkdir(seen);
  const codexBin = path.join(f.root, 'codex-stand-in');
  await fs.writeFile(codexBin, `#!/bin/sh\n/usr/bin/env | /usr/bin/cut -d= -f1 > "${seen}/codex-$1"\ncase "$1" in --version) echo "codex-cli 0.1.0" ;; plugin) echo "marketplace list" ;; esac\n`, { mode: 0o755 });
  const manifest = path.join(f.appDir, 'package.json'); const pkg = JSON.parse(await fs.readFile(manifest, 'utf8'));
  pkg.scripts.build = `node -e "require('fs').writeFileSync('${path.join(seen, 'build')}', Object.keys(process.env).join(String.fromCharCode(10)))" && ${pkg.scripts.build}`;
  await fs.writeFile(manifest, JSON.stringify(pkg));
  const session = path.join(f.root, 'claude-cli');
  const env = { ...f.env, CLAUDECODE: '1', CLAUDE_CODE_EXECPATH: session, CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', ANTHROPIC_API_KEY: 'not-a-real-key',
    CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token', CODEX_THREAD_ID: 'thread', npm_config_loglevel: 'warn', SKILLDOCK_TEST_MARK: 'launch-env' };
  const selection = { SKILLDOCK_NODE_SOURCE: 'nvm', SKILLDOCK_SELECTED_NPM_CLI: path.join(f.root, 'npm-cli.js'), SKILLDOCK_SELECTED_NPM_VERSION: '11.0.0' };
  const first = await launch('start', { ...options, env: { ...env, ...selection }, codexBin });
  try {
    // The launcher saves the bootstrap's selection once the data directory is known to be its own.
    const saved = JSON.parse(await fs.readFile(path.join(first.state, 'settings/runtime.json'), 'utf8'));
    assert.deepEqual([saved.node, saved.nodeVersion, saved.npmCli, saved.npmVersion, saved.source], [process.execPath, process.version, selection.SKILLDOCK_SELECTED_NPM_CLI, '11.0.0', 'nvm']);
    const keys = JSON.parse(await fs.readFile(path.join(first.state, 'service-env.json'), 'utf8'));
    const sessionKeys = ['CLAUDECODE', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_ENTRYPOINT', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_THREAD_ID'];
    for (const key of [...sessionKeys, 'npm_config_loglevel', 'SKILLDOCK_SELECTED_NPM_VERSION', 'SKILLDOCK_NODE_SOURCE']) assert.equal(keys.includes(key), false, key);
    for (const key of ['HOME', 'PATH', 'PORT', 'SKILLDOCK_STATE_DIR', 'SKILLDOCK_PROJECT_DIR']) assert.ok(keys.includes(key), key);
    for (const name of ['codex---version', 'codex-plugin', 'build']) {
      const received = (await fs.readFile(path.join(seen, name), 'utf8')).split('\n');
      for (const key of sessionKeys) assert.equal(received.includes(key), false, `${name} ${key}`);
      assert.equal(received.includes('npm_config_loglevel'), name === 'build', `${name} npm_config_loglevel`);
      assert.ok(received.includes('SKILLDOCK_TEST_MARK'), `${name} 使用启动器收到的环境，而不是测试进程自身的环境`);
    }
    assert.equal(JSON.parse(await fs.readFile(path.join(first.state, 'settings/claude-cli.json'), 'utf8')).sessionPath, session);
  } finally { await launch('stop', { ...options, env }); }
});

test('either side uses the instance the other side started, and a newer installation on either side takes over (REQ-SDX-017)', async t => {
  const f = await fixture(t); const port = await freePort();
  const codex = { ...await installedVersion(f, '0.11.0'), port };
  const claude = { ...await installedClaudeVersion(f, '0.11.0'), port };
  const running = async state => JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8')).running;
  // Started from Claude; Codex reads, opens and stops the same instance.
  const fromClaude = await launch('start', claude);
  let open = true;
  try {
    assert.deepEqual([(await running(fromClaude.state)).agent, (await running(fromClaude.state)).appPath], ['claude', await fs.realpath(claude.appDir)]);
    assert.equal((await launch('status', codex)).pid, fromClaude.pid);
    assert.equal((await launch('start', codex)).pid, fromClaude.pid, '版本相同时保留运行中的来源，不重启');
    assert.equal((await launch('stop', codex)).status, 'stopped'); open = false;
    assert.equal(await probe(fromClaude.url), null);
  } finally { if (open) await launch('stop', claude); }
  // Started from Codex; Claude does the same.
  const fromCodex = await launch('start', codex);
  open = true;
  try {
    assert.equal((await running(fromCodex.state)).agent, 'codex');
    assert.equal((await launch('status', claude)).pid, fromCodex.pid);
    assert.equal((await launch('start', claude)).pid, fromCodex.pid);
    assert.equal((await launch('stop', claude)).status, 'stopped'); open = false;
  } finally { if (open) await launch('stop', codex); }
  // A newer installation on the other side is where start goes, from either side.
  const claudeNewer = { ...await installedClaudeVersion(f, '0.11.1'), port };
  await assert.rejects(launch('start', codex), error => error.code === 'SKILLDOCK_DELEGATE' && error.target.agent === 'claude' && error.target.version === '0.11.1');
  const codexNewer = { ...await installedVersion(f, '0.11.2'), port };
  await assert.rejects(launch('start', claudeNewer), error => error.code === 'SKILLDOCK_DELEGATE' && error.target.agent === 'codex' && error.target.version === '0.11.2');
  const newest = await launch('start', codexNewer);
  try {
    assert.equal((await running(newest.state)).version, '0.11.2');
    assert.equal((await launch('status', claude)).pid, newest.pid, '较旧的一侧仍能查看较新一侧的实例');
  } finally { await launch('stop', claude); }
  assert.equal(await probe(newest.url), null);
});

test('the launch output names the Claude command line only when Claude is on this computer (UAT 2026-10-10)', async t => {
  const f = await fixture(t); const options = { ...f, port: await freePort() };
  const claudeBin = path.join(f.root, 'claude-stand-in');
  await fs.writeFile(claudeBin, '#!/bin/sh\necho "2.1.288 (Claude Code)"\n', { mode: 0o755 });
  const env = { ...f.env, SKILLDOCK_CLAUDE_BIN: claudeBin };
  const output = async run => {
    const lines = []; const write = process.stderr.write;
    process.stderr.write = chunk => { lines.push(String(chunk)); return true; };
    try { await run(); } finally { process.stderr.write = write; }
    return lines.join('');
  };
  try {
    assert.doesNotMatch(await output(() => launch('start', { ...options, env })), /Claude 命令行/, '没有 Claude 配置目录时不查找、不打印');
    await fs.mkdir(path.join(f.home, '.claude'));
    assert.match(await output(() => launch('restart', { ...options, env })), new RegExp(`SkillDock：Claude 命令行 ${claudeBin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}（2\\.1\\.288）`));
    await fs.writeFile(claudeBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.match(await output(() => launch('restart', { ...options, env })), /SkillDock：跳过 Claude 命令行 .*\nSkillDock：未找到可用的 Claude 命令行。/);
    // Found on PATH (a source that would be saved elsewhere): printed, never saved by the launcher (phase 6 review P3-01).
    const bin = path.join(f.root, 'path-bin'); await fs.mkdir(bin); await fs.writeFile(path.join(bin, 'claude'), '#!/bin/sh\necho "2.1.290 (Claude Code)"\n', { mode: 0o755 });
    const { SKILLDOCK_CLAUDE_BIN, ...withoutExplicit } = env;
    const found = await output(() => launch('restart', { ...options, env: { ...withoutExplicit, PATH: `${bin}:${env.PATH}` } }));
    assert.match(found, /SkillDock：Claude 命令行 .*path-bin\/claude（2\.1\.290）/);
    assert.equal(await fs.stat(path.join(f.stateDir, 'settings/claude-cli.json')).then(() => true, () => false), false, '启动器不保存所选命令行');
  } finally { await launch('stop', { ...options, env }); }
});
