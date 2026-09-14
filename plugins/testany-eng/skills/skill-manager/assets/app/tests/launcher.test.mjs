import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { fingerprint, launch, probe } from '../../../scripts/launch.mjs';
import { ROOT_FILES } from '../scripts/source-bundle.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock launcher '));
  const sourceRoot = path.join(root, 'software source');
  const appDir = path.join(sourceRoot, 'assets/app');
  const stateDir = path.join(root, 'app state');
  const projectDir = path.join(root, 'project');
  for (const folder of ['src', 'server', 'shared', 'scripts', 'tests']) await fs.mkdir(path.join(appDir, folder), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, 'scripts'), { recursive: true });
  for (const file of ROOT_FILES) await fs.copyFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), path.join(sourceRoot, file));
  await fs.copyFile(fileURLToPath(new URL('../scripts/source-bundle.mjs', import.meta.url)), path.join(appDir, 'scripts/source-bundle.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../server/installation.mjs', import.meta.url)), path.join(appDir, 'server/installation.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../server/toolchain.mjs', import.meta.url)), path.join(appDir, 'server/toolchain.mjs'));
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
  return { root, sourceRoot, appDir, stateDir, projectDir };
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

async function installedVersion(options, version, plugin = 'testany-eng') {
  const codexHome = path.join(options.root, 'codex');
  const packageRoot = path.join(codexHome, 'plugins/cache/testany-agent-skills', plugin, version);
  const skill = path.join(packageRoot, 'skills/skill-manager');
  await fs.cp(options.sourceRoot, skill, { recursive: true });
  await fs.mkdir(path.join(packageRoot, '.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, '.claude-plugin/plugin.json'), JSON.stringify({ name: plugin, version }));
  await fs.appendFile(path.join(skill, 'assets/app/README.md'), `\n${version}`);
  return { ...options, codexHome, appDir: path.join(skill, 'assets/app') };
}

test('a versioned plugin upgrade preserves state and accepts only the same plugin identity', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const firstOptions = { ...await installedVersion(fixtureOptions, '2.4.0'), port };
  const nextOptions = { ...await installedVersion(fixtureOptions, '2.5.0'), port };
  const unrelated = { ...await installedVersion(fixtureOptions, '2.5.0', 'other-plugin'), port };
  const first = await launch('start', firstOptions);
  const sentinel = path.join(first.state, 'saved-plan-and-history.json');
  await fs.writeFile(sentinel, '{"plan":"every day","history":["kept"]}');
  try {
    await assert.rejects(launch('start', unrelated), /另一个源码实例/);
    assert.equal((await probe(first.url)).pid, first.pid);
    await fs.rm(path.resolve(firstOptions.appDir, '../../../..'), { recursive: true, force: true });
    const next = await launch('start', nextOptions);
    assert.notEqual(next.pid, first.pid);
    assert.equal(next.state, first.state);
    assert.equal(await fs.readFile(sentinel, 'utf8'), '{"plan":"every day","history":["kept"]}');
    const record = JSON.parse(await fs.readFile(path.join(next.state, 'launcher.json'), 'utf8'));
    assert.equal(record.source, await fs.realpath(nextOptions.appDir));
    assert.equal(record.installation.plugin, 'testany-eng');
    assert.equal((await launch('status', nextOptions)).pid, next.pid);
  } finally { await launch('stop', nextOptions); }
});

test('failed new-version builds leave the old service and ownership record intact', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '2.4.0'), port };
  const nextOptions = { ...await installedVersion(fixtureOptions, '2.5.0'), port };
  const packageFile = path.join(nextOptions.appDir, 'package.json');
  const metadata = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  metadata.scripts.build = 'node -e "process.exit(9)"';
  await fs.writeFile(packageFile, JSON.stringify(metadata));
  const first = await launch('start', oldOptions);
  const ownership = await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8');
  try {
    await assert.rejects(launch('start', nextOptions), /失败（9）/);
    assert.equal((await probe(first.url)).pid, first.pid);
    assert.equal(await fs.readFile(path.join(first.state, 'launcher.json'), 'utf8'), ownership);
  } finally { await launch('stop', oldOptions); }
});

test('failed new-version startup restores the verified old runtime without replacing saved plans', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '2.4.0'), port };
  const nextOptions = { ...await installedVersion(fixtureOptions, '2.5.0'), port };
  await fs.writeFile(path.join(nextOptions.appDir, 'server/index.mjs'), 'process.exit(7);');
  const first = await launch('start', oldOptions);
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
    assert.equal(await fs.readFile(sentinel, 'utf8'), '{"targets":["skilldock"]}');
  } finally { await launch('stop', nextOptions); }
});

test('an explicit stop during preparation cancels the automatic replacement instead of restarting later', async t => {
  const fixtureOptions = await fixture(t); const { server, port } = await listen();
  await new Promise(resolve => server.close(resolve));
  const oldOptions = { ...await installedVersion(fixtureOptions, '2.4.0'), port };
  const nextOptions = { ...await installedVersion(fixtureOptions, '2.5.0'), port };
  const marker = path.join(fixtureOptions.root, 'build-started');
  await fs.writeFile(path.join(nextOptions.appDir, 'tests/delayed-build.mjs'), `import fs from 'node:fs/promises'; await fs.writeFile(${JSON.stringify(marker)}, 'started'); await new Promise(resolve => setTimeout(resolve, 1500));`);
  const file = path.join(nextOptions.appDir, 'package.json'); const value = JSON.parse(await fs.readFile(file, 'utf8'));
  value.scripts.build = 'node scripts/source-bundle.mjs --stage && node tests/delayed-build.mjs && node scripts/source-bundle.mjs';
  await fs.writeFile(file, JSON.stringify(value));
  const old = await launch('start', oldOptions);
  const upgrading = assert.rejects(launch('start', nextOptions), /运行实例已变化/);
  for (let i = 0; i < 100; i++) { if (await fs.stat(marker).catch(() => null)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(await fs.stat(marker));
  await launch('stop', oldOptions); await upgrading;
  assert.equal(await probe(old.url), null);
  assert.equal((await launch('status', nextOptions)).status, 'stopped');
});
