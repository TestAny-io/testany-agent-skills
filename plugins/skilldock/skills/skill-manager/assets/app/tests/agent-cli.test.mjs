// SPDX-License-Identifier: AGPL-3.0-only
// Phase 2b: process environments (DEC-SDX-024), Claude command-line discovery (HLD 3.3) and
// the command-line confirmation of the migration gate (HLD 3.7). Stand-in command lines only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('Claude command line: explicit, saved, session, desktop (highest version), PATH, home installs; the choice is saved and rechecked', async t => {
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
  await recordSessionCli(state, session);
  assert.equal((await claudeCliCandidates({ env, home, saved: await readClaudeCliSettings(state) }))[1].source, 'session');
  // The saved choice comes before the session path; when it breaks, discovery moves on.
  found = await resolveClaudeCli({ state, env, home });
  assert.equal(found.source, 'saved');
  await fs.writeFile(desktopNew, '#!/bin/sh\nexit 3\n');
  found = await resolveClaudeCli({ state, env, home });
  assert.deepEqual([found.path, found.source], [session, 'session']);
  assert.equal((await resolveClaudeCli({ state, env: { ...env, SKILLDOCK_CLAUDE_BIN: user }, home })).source, 'explicit');
  assert.equal((await readClaudeCliSettings(state)).path, session, '显式指定的命令行不保存');
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
