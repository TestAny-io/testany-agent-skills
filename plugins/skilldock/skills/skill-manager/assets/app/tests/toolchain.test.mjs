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
import { nodeCandidates, readSavedNode, shellBlock, CANDIDATES } from '../server/node-candidates.mjs';
import { staleEntries } from '../scripts/node-candidates.mjs';
import { runScript, backgroundPaths } from '../server/background-registration.mjs';
import { showNodeGuidance } from '../server/node-guide.mjs';

const execute = promisify(execFile);
async function firstSystemNode() {
  for (const file of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    try { const { stdout } = await execute(file, ['-e', 'const [a,b]=process.versions.node.split(".").map(Number);process.stdout.write(a>22||a===22&&b>=12?"ok":"old")']); if (stdout === 'ok') return await fs.realpath(file); } catch { /* absent */ }
  }
  return null;
}
const wrapper = (file, version) => fs.writeFile(file, version ? `#!/bin/sh\n[ "$1" = --version ] && { echo ${version}; exit 0; }\nexec ${JSON.stringify(process.execPath)} "$@"\n` : `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o755 });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skilldock runtime ' "));
  const stateDir = path.join(root, 'state'); const workspace = path.join(root, 'workspace');
  const app = path.join(root, "Desktop App's.app");
  const node = path.join(workspace, 'dependencies/node/bin/node');
  const npmCli = path.join(app, 'Contents/Resources/cua_node/lib/node_modules/npm/bin/npm-cli.js');
  // A wrapper rather than a link: the real Node may have its own npm next to it.
  await fs.mkdir(path.dirname(node), { recursive: true }); await wrapper(node);
  await fs.mkdir(path.dirname(npmCli), { recursive: true });
  await fs.writeFile(npmCli, 'console.log(process.argv[2] === "--version" ? "11.19.0" : JSON.stringify({node:process.execPath,args:process.argv.slice(2)}));');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, stateDir, workspace, app, node, npmCli,
    options: { stateDir, home: root, apps: [app], platform: 'linux', env: { PATH: '/usr/bin:/bin', SKILLDOCK_WORKSPACE_RUNTIME: workspace }, save: false, system: false } };
}

test('a workspace Node and app-bundled npm work without either command on PATH and without writing state', async t => {
  const f = await fixture(t); const selected = await resolveToolchain(f.options);
  assert.equal(selected.source, 'codex-workspace'); assert.equal(selected.node, await fs.realpath(f.node));
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
  await assert.rejects(resolveToolchain({ ...f.options, save: true, env: { ...f.options.env, SKILLDOCK_NODE_BIN: old } }), /显式运行环境配置不可用/);
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
});

test('without a usable Node nothing is downloaded or written; the entry shows guidance instead (HLD 3.10)', async t => {
  const f = await fixture(t); const inspect = async () => ({ reason: 'unavailable' });
  for (const save of [false, true]) {
    const result = await resolveToolchain({ ...f.options, platform: 'darwin', inspect, save });
    assert.equal(result.available, false); assert.ok(result.rejected.length >= 1);
  }
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
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
  const cli = path.join(f.app, 'Contents/Resources/codex-cli/bin/codex');
  await fs.mkdir(path.dirname(cli), { recursive: true });
  await fs.writeFile(cli, '#!/bin/sh\ncase "$1" in --version) echo "codex-cli 0.158.0" ;; plugin) echo "list marketplace" ;; esac\n', { mode: 0o755 });
  // A Homebrew/official Node has the required native library entitlement on macOS.
  const launcher = fileURLToPath(new URL('../../../scripts/launch.sh', import.meta.url));
  const env = { ...process.env, HOME: f.root, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SKILLDOCK_CODEX_APP_DIR: f.app,
    SKILLDOCK_WORKSPACE_RUNTIME: path.join(f.root, 'absent'), SKILLDOCK_STATE_DIR: f.stateDir,
    SKILLDOCK_NODE_BIN: '', SKILLDOCK_NPM_CLI: '', SKILLDOCK_SELECTED_NPM_CLI: '', SKILLDOCK_CODEX_BIN: '' };
  const { stdout } = await execute('/bin/sh', [launcher, 'doctor'], { env }).catch(error => error);
  // The desktop-app Node runs the bootstrap only; it is never the build selection. A Node in
  // a fixed system location (Homebrew, /usr/local) comes first when this machine has one.
  const system = await firstSystemNode();
  assert.equal(JSON.parse(stdout).bootstrap, system ?? await fs.realpath(process.execPath));
  assert.equal(JSON.parse(stdout).cli.path, cli);
  await assert.rejects(fs.stat(f.stateDir), { code: 'ENOENT' });
});

test('candidates follow the fixed order, newest first within a version manager; the shell entries embed the same list', async t => {
  const f = await fixture(t); const home = f.root;
  const make = async (relative, version) => { const file = path.join(home, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await wrapper(file, version); return file; };
  const nvmOld = await make('.nvm/versions/node/v22.20.0/bin/node', 'v22.20.0');
  const nvmNew = await make('.nvm/versions/node/v24.1.0/bin/node', 'v24.1.0');
  const volta = await make('.volta/tools/image/node/23.0.0/bin/node', 'v23.0.0');
  const mise = await make('.local/share/mise/installs/node/22.15.0/bin/node', 'v22.15.0');
  const list = (await nodeCandidates({ env: { PATH: '/usr/bin:/bin', SKILLDOCK_WORKSPACE_RUNTIME: f.workspace }, home, stateDir: f.stateDir, system: false }))
    .map(item => [item.source, item.file]);
  assert.deepEqual(list, [['codex-workspace', f.node], ['nvm', nvmNew], ['nvm', nvmOld], ['volta', volta], ['mise', mise]]);
  assert.equal(CANDIDATES.findIndex(item => item.source === 'saved'), 1, '保存值紧随显式变量');
  assert.ok(CANDIDATES.filter(item => item.bootstrapOnly).every(item => item.source === 'app'), '应用包内 Node 只用于引导');
  assert.deepEqual(await staleEntries(), [], 'launch.sh 与 native.sh 的候选块与单一定义一致');
  const paths = backgroundPaths(f.stateDir, home);
  assert.ok(runScript(paths, f.stateDir).includes(shellBlock()), '后台入口用同一份候选');
  await execute('/bin/sh', ['-n', '-c', runScript(paths, f.stateDir)]);
});

test('the selection is saved and reused with a light check; a broken saved Node is replaced by a rescan', async t => {
  const f = await fixture(t);
  const options = { ...f.options, save: true };
  const first = await resolveToolchain(options);
  assert.equal(first.source, 'codex-workspace');
  const saved = await readSavedNode(f.stateDir);
  assert.deepEqual([saved.node, saved.source], [first.node, 'codex-workspace']);
  assert.equal((await fs.readFile(path.join(f.stateDir, 'settings/node-path'), 'utf8')).trim(), first.node);
  const inspect = async () => assert.fail('保存值只做轻量核验');
  const again = await resolveToolchain({ ...options, inspect });
  assert.deepEqual([again.source, again.savedSource, again.node], ['saved', 'codex-workspace', first.node]);
  // The saved Node disappears: rescan, pick the next usable one and save it.
  const other = path.join(f.root, '.nvm/versions/node/v24.2.0/bin/node');
  await fs.mkdir(path.dirname(other), { recursive: true }); await wrapper(other);
  await fs.rm(f.node);
  const logs = [];
  const rescanned = await resolveToolchain({ ...options, log: message => logs.push(message) });
  assert.deepEqual([rescanned.source, rescanned.node], ['nvm', await fs.realpath(other)]);
  assert.match(logs[0], /已不可用/);
  assert.equal((await readSavedNode(f.stateDir)).node, rescanned.node);
});

test('the guidance dialog runs in its own process with the command to re-check, and never for restart jobs or headless runs', async t => {
  const f = await fixture(t); const record = path.join(f.root, 'osascript-args');
  const osascript = path.join(f.root, 'osascript');
  await fs.writeFile(osascript, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(record)}\n`, { mode: 0o755 });
  const skillRoot = path.join(f.root, 'skill');
  const shown = showNodeGuidance({ skillRoot, args: ['start', '--project', f.root], state: f.stateDir, env: { PORT: '4999' }, platform: 'darwin', osascript });
  assert.equal(shown, true);
  for (let i = 0; i < 50 && !(await fs.stat(record).catch(() => null)); i++) await new Promise(resolve => setTimeout(resolve, 50));
  const args = (await fs.readFile(record, 'utf8')).trim().split('\n');
  assert.deepEqual(args, [path.join(skillRoot, 'scripts/node-guide.applescript'), `SKILLDOCK_STATE_DIR=${f.stateDir}`, 'PORT=4999', 'SKILLDOCK_PROJECT_DIR=',
    '/bin/sh', path.join(skillRoot, 'scripts/launch.sh'), 'start', '--project', f.root]);
  for (const [args, env, platform] of [[['start'], { SKILLDOCK_RESTART_JOB: 'j' }, 'darwin'], [['start'], { SKILLDOCK_NO_DIALOG: '1' }, 'darwin'], [['status'], {}, 'darwin'], [['start'], {}, 'linux']])
    assert.equal(showNodeGuidance({ skillRoot, args, state: f.stateDir, env, platform, osascript }), false);
});

test('the shell entry without any usable Node exits 1 with guidance text and no dialog when headless', async t => {
  if (await firstSystemNode()) return t.skip('本机固定系统位置有 Node，无法构造“找不到 Node”');
  const f = await fixture(t); const launcher = fileURLToPath(new URL('../../../scripts/launch.sh', import.meta.url));
  const env = { HOME: f.root, PATH: '/usr/bin:/bin', SKILLDOCK_CODEX_APP_DIR: path.join(f.root, 'none'), SKILLDOCK_WORKSPACE_RUNTIME: path.join(f.root, 'none'), SKILLDOCK_STATE_DIR: f.stateDir, SKILLDOCK_NO_DIALOG: '1' };
  const result = await execute('/bin/sh', [launcher, 'start'], { env }).then(() => null, error => error);
  assert.equal(result.code, 1); assert.match(result.stderr, /未找到可运行的 Node\.js 22\.12/); assert.doesNotMatch(result.stderr, /已显示安装引导/);
});
