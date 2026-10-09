// SPDX-License-Identifier: AGPL-3.0-only
// Phase 2b: process environments (DEC-SDX-024), Claude command-line discovery (HLD 3.3) and
// the command-line confirmation of the migration gate (HLD 3.7). Stand-in command lines only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { childEnvironment, claudeCliEnvironment } from '../server/process-env.mjs';
import { resolveClaudeCli, claudeCliCandidates, recordSessionCli, readClaudeCliSettings } from '../server/claude-cli.mjs';
import { commandLineGateEvidence } from '../server/gate-cli.mjs';

async function temp(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-agent-cli-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function script(file, body) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return file; }

test('service and command-line environments keep only allowed variables and SkillDock settings', () => {
  const env = { HOME: '/h', USER: 'u', LANG: 'zh_CN.UTF-8', LC_ALL: 'C', PATH: '/custom/bin:relative', SSH_AUTH_SOCK: '/s', HTTPS_PROXY: 'http://p', NODE_EXTRA_CA_CERTS: '/ca',
    CLAUDECODE: '1', CLAUDE_CODE_EXECPATH: '/x', CLAUDE_CONFIG_DIR: '/c', ANTHROPIC_API_KEY: 'secret', CODEX_THREAD_ID: 't', NODE_OPTIONS: '--inspect',
    SKILLDOCK_STATE_DIR: '/state', SKILLDOCK_RESTART_JOB: 'j', SKILLDOCK_HANDOVER: '1', SKILLDOCK_DELEGATED: '1', SKILLDOCK_GATE_CHECKED: '1' };
  const child = childEnvironment(env, { PORT: '4999', CODEX_HOME: '/codex' }, { node: '/node/bin/node' });
  assert.deepEqual(Object.keys(child).sort(), ['CODEX_HOME', 'HOME', 'HTTPS_PROXY', 'LANG', 'LC_ALL', 'NODE_EXTRA_CA_CERTS', 'PATH', 'PORT', 'SKILLDOCK_STATE_DIR', 'SSH_AUTH_SOCK', 'USER']);
  assert.equal(child.PATH.split(':')[0], '/node/bin'); assert.ok(child.PATH.split(':').includes('/custom/bin')); assert.ok(!child.PATH.includes('relative'));
  const claude = claudeCliEnvironment(env, { configDir: '/root/.claude', pluginCacheDir: '/root/.claude/plugins/cache' });
  assert.deepEqual([claude.CLAUDE_CONFIG_DIR, claude.DISABLE_AUTOUPDATER, claude.CLAUDE_CODE_PLUGIN_CACHE_DIR, claude.CLAUDECODE], ['/root/.claude', '1', undefined, undefined]);
  assert.equal(claudeCliEnvironment(env, { configDir: '/r', pluginCacheDir: '/elsewhere' }).CLAUDE_CODE_PLUGIN_CACHE_DIR, '/elsewhere');
});

test('Claude command line: explicit only, session, desktop (highest version), PATH, home installs; a found choice follows upgrades, a chosen one stays', async t => {
  const root = await temp(t); const home = path.join(root, 'home'); const state = path.join(root, 'state');
  const version = v => `[ "$1" = --version ] && echo "${v} (Claude Code)"`;
  const desktopOld = await script(path.join(home, 'Library/Application Support/Claude/claude-code/2.1.9/aaa/claude.app/Contents/MacOS/claude'), version('2.1.9'));
  const desktopNew = await script(path.join(home, 'Library/Application Support/Claude/claude-code/2.1.10/bbb/claude.app/Contents/MacOS/claude'), version('2.1.10'));
  const onPath = await script(path.join(root, 'bin/claude'), version('2.0.0'));
  const user = await script(path.join(home, '.local/bin/claude'), version('2.0.1'));
  const session = await script(path.join(root, 'session/claude'), version('2.1.11'));
  const env = { HOME: home, PATH: path.join(root, 'bin') };
  assert.deepEqual((await claudeCliCandidates({ env, home })).map(item => item.file), [desktopNew, desktopOld, onPath, user, path.join(home, '.claude/local/claude')]);
  let found = await resolveClaudeCli({ state, env, home });
  assert.deepEqual([found.path, found.version, found.source], [desktopNew, '2.1.10', 'desktop']);
  assert.equal((await readClaudeCliSettings(state)).path, desktopNew);
  // The desktop app updated: its newer bundled command line replaces the one found before.
  const desktopNext = await script(path.join(home, 'Library/Application Support/Claude/claude-code/2.1.12/ccc/claude.app/Contents/MacOS/claude'), version('2.1.12'));
  found = await resolveClaudeCli({ state, env, home });
  assert.deepEqual([found.path, found.source], [desktopNext, 'desktop']);
  // A Claude session's own command line comes before the desktop app's.
  await recordSessionCli(state, session);
  assert.equal((await claudeCliCandidates({ env, home, saved: await readClaudeCliSettings(state) }))[0].source, 'session');
  found = await resolveClaudeCli({ state, env, home });
  assert.deepEqual([found.path, found.source], [session, 'session']);
  // When it breaks, discovery moves on.
  await fs.writeFile(session, '#!/bin/sh\nexit 3\n');
  assert.equal((await resolveClaudeCli({ state, env, home })).path, desktopNext);
  // A command line the user chose stays first.
  const settings = await readClaudeCliSettings(state);
  await fs.writeFile(path.join(state, 'settings/claude-cli.json'), JSON.stringify({ ...settings, path: user, source: 'manual' }));
  found = await resolveClaudeCli({ state, env, home });
  assert.deepEqual([found.path, found.source, (await readClaudeCliSettings(state)).source], [user, 'saved', 'manual']);
  // An explicit one is the only candidate and is not saved.
  assert.equal((await resolveClaudeCli({ state, env: { ...env, SKILLDOCK_CLAUDE_BIN: onPath }, home })).source, 'explicit');
  assert.equal((await resolveClaudeCli({ state, env: { ...env, SKILLDOCK_CLAUDE_BIN: path.join(root, 'absent') }, home })).available, false);
  assert.equal((await readClaudeCliSettings(state)).path, user, '显式指定的命令行不保存');
  const none = await resolveClaudeCli({ state: path.join(root, 'other'), env: { HOME: root, PATH: '' }, home: root });
  assert.equal(none.available, false);
});

test('gate confirmation: the command lines report older SkillDock installs; Claude falls back to its install record; missing roots are never created', async t => {
  const root = await temp(t); const home = path.join(root, 'home'); const state = path.join(root, 'state');
  const codexHome = path.join(home, '.codex'); const configDir = path.join(home, '.claude');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(path.join(configDir, 'plugins'), { recursive: true });
  const codex = await script(path.join(root, 'codex'), `case "$1 $2" in
"--version ") echo "codex-cli 0.200.0" ;;
"plugin --help") echo "list marketplace" ;;
"plugin list") echo '{"installed":[{"name":"skilldock","marketplaceName":"m","version":"0.10.2"},{"name":"other","marketplaceName":"m","version":"0.1.0"}]}' ;;
esac`);
  const app = (directory, version) => fs.mkdir(path.join(directory, 'skills/skill-manager/assets/app'), { recursive: true })
    .then(() => fs.writeFile(path.join(directory, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: 'skilldock', version })));
  const oldClaude = path.join(configDir, 'plugins/cache/m/skilldock/sha1'); await app(oldClaude, '0.10.1');
  const newClaude = path.join(configDir, 'plugins/cache/m/skilldock/sha2'); await app(newClaude, '0.11.0');
  const claude = await script(path.join(root, 'claude'), `case "$1" in
--version) echo "2.1.288 (Claude Code)" ;;
plugin) echo '[{"id":"skilldock@m","scope":"user","installPath":"${oldClaude}"},{"id":"skilldock@m","scope":"project","installPath":"${newClaude}"}]' ;;
esac`);
  const env = { HOME: home, PATH: '/usr/bin:/bin', SKILLDOCK_CODEX_BIN: codex, SKILLDOCK_CLAUDE_BIN: claude };
  const claudeRoot = { configDir, pluginCacheDir: path.join(configDir, 'plugins/cache') };
  let evidence = await commandLineGateEvidence({ codexHome, claudeRoot, state, env, home });
  assert.deepEqual(evidence.blockers.map(item => [item.agent, item.version, item.evidence]), [['codex', '0.10.2', 'Codex 命令行插件清单'], ['claude', '0.10.1', 'Claude 命令行插件清单']]);
  // Without the Claude command line, its install record is read; orphaned installs are not counted.
  await fs.writeFile(path.join(configDir, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'skilldock@m': [{ scope: 'user', installPath: oldClaude }] } }));
  const { SKILLDOCK_CLAUDE_BIN, ...withoutClaude } = env;
  evidence = await commandLineGateEvidence({ codexHome, claudeRoot, state, env: withoutClaude, home });
  assert.deepEqual(evidence.blockers.filter(item => item.agent === 'claude').map(item => item.evidence), ['Claude 安装记录']);
  // A Claude command line that answers its version but fails to list: the record is the evidence.
  const failing = await script(path.join(root, 'claude-failing'), 'case "$1" in --version) echo "2.1.288 (Claude Code)" ;; *) exit 1 ;; esac');
  evidence = await commandLineGateEvidence({ codexHome, claudeRoot, state, env: { ...env, SKILLDOCK_CLAUDE_BIN: failing }, home });
  assert.deepEqual(evidence.blockers.filter(item => item.agent === 'claude').map(item => item.evidence), ['Claude 安装记录']);
  assert.ok(evidence.notes.some(note => note.startsWith('Claude 命令行插件清单失败') && note.endsWith('改用安装记录。')));
  await fs.writeFile(path.join(oldClaude, '.orphaned_at'), '1');
  evidence = await commandLineGateEvidence({ codexHome, claudeRoot, state, env: withoutClaude, home });
  assert.equal(evidence.blockers.some(item => item.agent === 'claude'), false);
  assert.ok(SKILLDOCK_CLAUDE_BIN);
  // Absent configuration roots are skipped, so nothing creates them.
  const bare = path.join(root, 'bare');
  evidence = await commandLineGateEvidence({ codexHome: path.join(bare, '.codex'), claudeRoot: { configDir: path.join(bare, '.claude') }, state, env, home: bare });
  assert.deepEqual(evidence.blockers, []);
  await assert.rejects(fs.stat(bare), { code: 'ENOENT' });
});

test('through the real entry: the cli pass-through gets the allowed variables and CODEX_HOME; a refused launch saves no Node selection', async t => {
  const root = await temp(t); const home = path.join(root, 'home'); const state = path.join(root, 'state'); await fs.mkdir(home);
  const seen = path.join(root, 'seen');
  const codex = await script(path.join(root, 'codex'), `/usr/bin/env | /usr/bin/cut -d= -f1 > "${seen}-$1-$2"
case "$1 $2 $3" in
"--version  ") echo "codex-cli 0.200.0" ;;
"plugin --help ") echo "list marketplace" ;;
"plugin list --json") echo '{"installed":[]}' ;;
*) echo listed ;;
esac`);
  const launcher = fileURLToPath(new URL('../../../scripts/launch.sh', import.meta.url));
  const session = { CLAUDECODE: '1', ANTHROPIC_API_KEY: 'not-a-real-key', CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token', CODEX_THREAD_ID: 'thread' };
  const port = await new Promise(resolve => { const server = net.createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
  const env = { HOME: home, PATH: '/usr/bin:/bin', PORT: String(port), SKILLDOCK_NODE_BIN: process.execPath, SKILLDOCK_STATE_DIR: state, SKILLDOCK_NO_DIALOG: '1',
    SKILLDOCK_CODEX_BIN: codex, SKILLDOCK_CLAUDE_BIN: path.join(root, 'absent-claude'), CODEX_HOME: path.join(root, 'codex-home'), ...session };
  const run = args => promisify(execFile)('/bin/sh', [launcher, ...args], { env, cwd: root });
  assert.equal((await run(['cli', 'plugin', 'list'])).stdout.trim(), 'listed');
  for (const name of ['--version-', 'plugin---help', 'plugin-list']) {
    const received = (await fs.readFile(`${seen}-${name}`, 'utf8')).split('\n');
    for (const key of Object.keys(session)) assert.equal(received.includes(key), false, `${name} ${key}`);
    assert.ok(received.includes('CODEX_HOME'), name);
  }
  // A data directory of another source: refused (exit 1, nothing on stdout), and the
  // bootstrap's Node selection is not written into it. The gate ran first and named the
  // command line that confirmed Codex's plugin list.
  await fs.mkdir(env.CODEX_HOME);
  await fs.mkdir(state); const other = path.join(root, 'other/app'); await fs.mkdir(other, { recursive: true });
  await fs.writeFile(path.join(state, 'launcher.json'), JSON.stringify({ url: 'http://127.0.0.1:9', pid: 2 ** 22 + 99, state: await fs.realpath(state), project: root, projectContext: null,
    source: other, installation: { kind: 'directory', source: other }, digest: 'x', runtime: path.join(state, 'runtimes/x'), codexHome: env.CODEX_HOME, cli: null, execution: null }));
  const refused = await run(['start', '--project', root]).then(async () => { await run(['stop']).catch(() => {}); return null; }, error => error);
  assert.deepEqual([refused?.code, refused.stdout], [1, '']); assert.match(refused.stderr, /另一个源码实例/);
  assert.ok(refused.stderr.includes(`已用 Codex 命令行 ${codex}（codex-cli 0.200.0）确认插件清单。`));
  await assert.rejects(fs.stat(path.join(state, 'settings')), { code: 'ENOENT' });
});
