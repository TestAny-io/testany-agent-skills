import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveToolchain, hasLibraryRestriction, inspectNode, downloadVerified, installPrivateRuntime, buildEnvironment } from '../server/toolchain.mjs';

const execute = promisify(execFile);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skilldock runtime ' "));
  const stateDir = path.join(root, 'state'); const workspace = path.join(root, 'workspace');
  const app = path.join(root, "Desktop App's.app");
  const node = path.join(workspace, 'dependencies/node/bin/node');
  const npmCli = path.join(app, 'Contents/Resources/cua_node/lib/node_modules/npm/bin/npm-cli.js');
  await fs.mkdir(path.dirname(node), { recursive: true }); await fs.symlink(process.execPath, node);
  await fs.mkdir(path.dirname(npmCli), { recursive: true });
  await fs.writeFile(npmCli, 'console.log(process.argv[2] === "--version" ? "11.19.0" : JSON.stringify({node:process.execPath,args:process.argv.slice(2)}));');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, stateDir, workspace, app, node, npmCli,
    options: { stateDir, home: root, apps: [app], platform: 'linux', env: { PATH: '/usr/bin:/bin', SKILLDOCK_WORKSPACE_RUNTIME: workspace }, allowInstall: false } };
}

test('a workspace Node and app-bundled npm work without either command on PATH and without writing state', async t => {
  const f = await fixture(t); const selected = await resolveToolchain(f.options);
  assert.equal(selected.source, 'codex-workspace'); assert.equal(selected.node, await fs.realpath(process.execPath));
  assert.equal(selected.npmCli, await fs.realpath(f.npmCli));
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
});

test('nested build commands use the selected Node/npm even with spaces and apostrophes in paths', async t => {
  const f = await fixture(t);
  const env = await buildEnvironment(f.stateDir, process.execPath, f.npmCli, { PATH: '/usr/bin:/bin' });
  const { stdout } = await execute('/bin/sh', ['-c', 'node --version && npm run "argument with spaces"'], { env });
  const [version, result] = stdout.trim().split('\n');
  assert.equal(version, process.version);
  assert.deepEqual(JSON.parse(result), { node: process.execPath, args: ['run', 'argument with spaces'] });
});

test('macOS hardened signing requires the specific external library entitlement', () => {
  const flags = 'CodeDirectory v=20500 flags=0x10000(runtime)';
  assert.equal(hasLibraryRestriction(`${flags}<key>com.apple.security.cs.allow-jit</key><true/>`), true);
  assert.equal(hasLibraryRestriction(`${flags}<key>com.apple.security.cs.disable-library-validation</key><true/>`), false);
  assert.equal(hasLibraryRestriction('CodeDirectory flags=0x2(adhoc)'), false);
  assert.equal(hasLibraryRestriction('CodeDirectory flags=0x2000(library-validation)'), true);
});

test('an explicitly configured old Node fails without downloading or modifying state', async t => {
  const f = await fixture(t); const old = path.join(f.root, 'old-node');
  await fs.writeFile(old, '#!/bin/sh\nprintf "v22.11.0\\n"\n', { mode: 0o700 });
  const inspected = await inspectNode(old, { platform: 'linux' });
  assert.match(inspected.reason, /不满足/);
  await assert.rejects(resolveToolchain({ ...f.options, allowInstall: true, env: { ...f.options.env, SKILLDOCK_NODE_BIN: old }, install: () => assert.fail('must not download') }), /显式运行环境配置不可用/);
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
});

test('diagnostics remain read-only when no usable runtime exists, but start can request an isolated fallback', async t => {
  const f = await fixture(t); const inspect = async () => ({ reason: 'unavailable' });
  const options = { ...f.options, platform: 'darwin', arch: 'arm64', inspect };
  assert.equal((await resolveToolchain(options)).available, false);
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
  let called = false;
  const selected = await resolveToolchain({ ...options, allowInstall: true, install: async input => {
    called = true; assert.equal(input.stateDir, f.stateDir); return { source: 'skilldock-private' };
  } });
  assert.equal(called, true); assert.equal(selected.source, 'skilldock-private');
});

test('download bytes must match the pinned hash; corrupt and failed downloads leave no usable archive', async t => {
  const f = await fixture(t); const destination = path.join(f.root, 'node.tar.gz');
  const bytes = Buffer.from('verified archive fixture'); const expected = crypto.createHash('sha256').update(bytes).digest('hex');
  await downloadVerified('https://nodejs.org/fixture', destination, expected, { fetcher: async () => new Response(bytes) });
  assert.deepEqual(await fs.readFile(destination), bytes); await fs.rm(destination);
  await assert.rejects(downloadVerified('https://nodejs.org/fixture', destination, expected, { fetcher: async () => new Response('corrupt') }), /SHA-256/);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  await assert.rejects(downloadVerified('https://nodejs.org/fixture', destination, expected, { fetcher: async () => new Response('', { status: 503 }) }), /HTTP 503/);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
});

test('a failed private-runtime download does not activate an installation or leave a lock', async t => {
  const f = await fixture(t);
  await assert.rejects(installPrivateRuntime({ stateDir: f.stateDir, arch: 'arm64', platform: 'darwin', log() {}, download: async () => { throw new Error('offline'); } }), /offline/);
  assert.deepEqual(await fs.readdir(path.join(f.stateDir, 'node')), []);
});

test('the shell entry locates a custom desktop app without Node/npm on PATH and doctor creates no state', async t => {
  const f = await fixture(t); const bin = path.join(f.app, 'Contents/Resources/cua_node/bin');
  await fs.mkdir(bin, { recursive: true }); await fs.symlink(process.execPath, path.join(bin, 'node'));
  // A Homebrew/official Node has the required native library entitlement on macOS.
  const launcher = fileURLToPath(new URL('../../../scripts/launch.sh', import.meta.url));
  const env = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SKILLDOCK_CODEX_APP_DIR: f.app,
    SKILLDOCK_WORKSPACE_RUNTIME: path.join(f.root, 'absent'), SKILLDOCK_STATE_DIR: f.stateDir,
    SKILLDOCK_NODE_BIN: '', SKILLDOCK_NPM_CLI: '', SKILLDOCK_SELECTED_NPM_CLI: '' };
  const { stdout } = await execute('/bin/sh', [launcher, 'doctor'], { env });
  assert.equal(JSON.parse(stdout).node, await fs.realpath(process.execPath));
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
});
