// SPDX-License-Identifier: AGPL-3.0-only
// 0.11 state model: installations, generation, launcher record, Claude root (API-SDX-001 36a).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { agentRoots, discoverInstalls, selectRunSource, reference, normalizeGitSource } from '../server/installs.mjs';
import { readGeneration, writeGeneration, CURRENT_GENERATION } from '../server/generation.mjs';
import { legacyFields, buildRecord, stoppedRecord, refreshRecord, ensureLegacyProject, writeRecord, readRecord, isCurrentRecord } from '../server/launcher-record.mjs';
import { resolveClaudeRoot, writeClaudeRoot, readClaudeRoot, startedFromClaude } from '../server/claude-root.mjs';

const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
const KEY = 'github.com/testany-io/testany-agent-skills';

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-state-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  await fs.mkdir(path.join(claudeConfig, 'plugins/cache'), { recursive: true }); await fs.mkdir(codexHome, { recursive: true });
  const marketplaces = { m: SOURCE, fork: 'https://github.com/someone/testany-agent-skills.git' };
  await fs.writeFile(path.join(codexHome, 'config.toml'), Object.entries(marketplaces).map(([name, url]) => `[marketplaces.${name}]\nsource_type = "git"\nsource = "${url}"\n`).join(''));
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify(Object.fromEntries(Object.entries(marketplaces).map(([name, url]) => [name, { source: { source: 'git', url } }]))));
  const install = async (agent, version, { market = 'm', dir = agent === 'codex' ? version : `sha-${version}`, orphaned = false } = {}) => {
    const base = agent === 'codex' ? path.join(codexHome, 'plugins/cache', market, 'skilldock', dir) : path.join(claudeConfig, 'plugins/cache', market, 'skilldock', dir);
    await fs.mkdir(path.join(base, '.codex-plugin'), { recursive: true });
    await fs.writeFile(path.join(base, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'skilldock', version }));
    await fs.mkdir(path.join(base, 'skills/skill-manager/scripts'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/scripts/launch.sh'), '#!/bin/sh\n');
    await fs.mkdir(path.join(base, 'skills/skill-manager/assets/app'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: 'skilldock', version }));
    if (orphaned) await fs.writeFile(path.join(base, '.orphaned_at'), '1');
    return path.join(base, 'skills/skill-manager/assets/app');
  };
  return { root, home, codexHome, claudeConfig, state: path.join(root, 'state'), install, env: {} };
}

test('discovery finds both agents, skips orphaned and unrelated caches, and filters by version and source', async t => {
  const w = await world(t);
  const c0102 = await w.install('codex', '0.10.2'); const c0110 = await w.install('codex', '0.11.0');
  const k0110 = await w.install('claude', '0.11.0'); await w.install('claude', '0.11.2', { orphaned: true });
  const fork = await w.install('claude', '0.12.0', { market: 'fork' });
  const roots = await agentRoots({ env: w.env, home: w.home });
  const all = await discoverInstalls(roots);
  assert.deepEqual(all.map(item => [item.agent, item.version]).sort(), [['claude', '0.11.0'], ['claude', '0.12.0'], ['codex', '0.10.2'], ['codex', '0.11.0']]);
  assert.equal(all.find(item => item.appPath === c0110).sourceKey, KEY);
  const owned = await discoverInstalls(roots, { minimum: '0.11.0', owner: { marketplace: 'm', key: KEY } });
  assert.deepEqual(owned.map(item => item.appPath).sort(), [c0110, k0110].sort(), '同名同源、≥0.11、不含 fork 与废弃目录');
  assert.equal(all.some(item => item.appPath === fork && item.sourceKey === KEY), false);
  assert.equal(c0102.length > 0, true);
});

test('run source: highest version, then the running source, then Codex before Claude (DEC-SDX-008)', () => {
  const a = { agent: 'claude', version: '0.11.0', appPath: '/b' }; const b = { agent: 'codex', version: '0.11.0', appPath: '/a' };
  const c = { agent: 'codex', version: '0.10.9', appPath: '/c' };
  assert.equal(selectRunSource([a, b, c]), b);
  assert.equal(selectRunSource([a, b, c], { runningAppPath: '/b' }), a);
  assert.equal(selectRunSource([c, { ...a, version: '0.11.1' }]).version, '0.11.1');
  assert.equal(selectRunSource([]), null);
});

test('legacy fields follow 36a §5.2: highest same-source Codex cache, 0.10.2 identity and key order', async t => {
  const w = await world(t);
  await w.install('codex', '0.10.3'); const c0110 = await w.install('codex', '0.11.0'); const k0111 = await w.install('claude', '0.11.1');
  await w.install('codex', '0.12.0', { market: 'fork' });
  const installs = await discoverInstalls(await agentRoots({ env: w.env, home: w.home }));
  const running = reference(installs.find(item => item.appPath === k0111));
  const legacy = await legacyFields({ codexHome: w.codexHome, installs, running });
  assert.equal(legacy.source, c0110);
  assert.equal(JSON.stringify(legacy.installation), JSON.stringify({ kind: 'plugin', codexHome: w.codexHome, marketplace: 'm', plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' }));
  // Without any Codex installation the running installation is used in its directory form.
  const claudeOnly = installs.filter(item => item.agent === 'claude');
  const fallback = await legacyFields({ codexHome: w.codexHome, installs: claudeOnly, running });
  assert.deepEqual(fallback, { source: k0111, installation: { kind: 'directory', source: k0111 } });
});

test('records: running form, stopped form, refresh of the preferred target and the legacy fields', async t => {
  const w = await world(t);
  const c0103 = await w.install('codex', '0.10.3'); const k0110 = await w.install('claude', '0.11.0');
  let installs = await discoverInstalls(await agentRoots({ env: w.env, home: w.home }));
  const running = reference(installs.find(item => item.appPath === k0110));
  await fs.mkdir(w.state, { recursive: true });
  const legacyProject = await ensureLegacyProject(w.state);
  const record = buildRecord({ state: w.state, url: 'http://127.0.0.1:4999', pid: 1, digest: 'd', runtime: '/r', codexHome: w.codexHome, legacyProject,
    legacy: await legacyFields({ codexHome: w.codexHome, installs, running }), running, preferred: running, actualProject: w.home });
  assert.equal(record.source, c0103); assert.equal(record.project, legacyProject); assert.equal(isCurrentRecord(record), true);
  assert.equal(record.generation, CURRENT_GENERATION); assert.equal(record.status, 'running');
  await writeRecord(w.state, record);
  assert.deepEqual(await readRecord(w.state), record);
  assert.equal((await fs.stat(path.join(w.state, 'launcher.json'))).mode & 0o777, 0o600);
  const stopped = stoppedRecord(record);
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.pid, 1); assert.equal(stopped.project, legacyProject);
  // A newer Codex cache refreshes preferred and legacy fields; the running installation stays.
  const c0111 = await w.install('codex', '0.11.1');
  installs = await discoverInstalls(await agentRoots({ env: w.env, home: w.home }));
  const preferred = reference(installs.find(item => item.appPath === c0111));
  const refreshed = await refreshRecord(record, { codexHome: w.codexHome, installs, preferred });
  assert.equal(refreshed.source, c0111); assert.deepEqual(refreshed.preferred, preferred); assert.deepEqual(refreshed.running, running);
  assert.equal(await refreshRecord(refreshed, { codexHome: w.codexHome, installs, preferred }), refreshed, '无变化时返回同一对象');
});

test('generation: absent is 1, malformed is never lower than current, written marker is 2', async t => {
  const w = await world(t); await fs.mkdir(w.state, { recursive: true });
  assert.equal(await readGeneration(w.state), 1);
  await fs.writeFile(path.join(w.state, 'generation.json'), '{bad');
  assert.equal(await readGeneration(w.state), Number.POSITIVE_INFINITY);
  await writeGeneration(w.state, '0.11.0');
  assert.equal(await readGeneration(w.state), 2);
  const marker = JSON.parse(await fs.readFile(path.join(w.state, 'generation.json'), 'utf8'));
  assert.deepEqual([marker.format, marker.minimumCompatibleGeneration, marker.writtenBy], [1, 2, '0.11.0']);
});

test('Claude root: saved value, then the Claude session, then defaults; handover only counts from Claude', async t => {
  const w = await world(t); await fs.mkdir(w.state, { recursive: true });
  const custom = path.join(w.root, 'custom-claude');
  assert.equal((await resolveClaudeRoot({ state: w.state, env: {}, home: w.home })).origin, 'default');
  assert.equal((await resolveClaudeRoot({ state: w.state, env: { CLAUDE_CONFIG_DIR: custom }, home: w.home })).origin, 'default', '不在 Claude 会话中时忽略变量');
  const session = await resolveClaudeRoot({ state: w.state, env: { CLAUDECODE: '1', CLAUDE_CONFIG_DIR: custom }, home: w.home });
  assert.deepEqual([session.origin, session.configDir, session.pluginCacheDir], ['session', custom, path.join(custom, 'plugins/cache')]);
  assert.equal(startedFromClaude({ CLAUDECODE: '1', SKILLDOCK_HANDOVER: '1', SKILLDOCK_HANDOVER_AGENT: 'codex' }), false);
  assert.equal(startedFromClaude({ SKILLDOCK_HANDOVER: '1', SKILLDOCK_HANDOVER_AGENT: 'claude' }), true);
  await writeClaudeRoot(w.state, { configDir: custom, pluginCacheDir: path.join(custom, 'plugins/cache'), origin: 'explicit' });
  const saved = await resolveClaudeRoot({ state: w.state, env: { CLAUDECODE: '1', CLAUDE_CONFIG_DIR: path.join(w.root, 'other') }, home: w.home });
  assert.deepEqual([saved.origin, saved.saved, saved.configDir], ['explicit', true, custom]);
  assert.equal((await readClaudeRoot(w.state)).format, 1);
});

test('source identifiers stay normalised for the run-source owner check', () => {
  assert.equal(normalizeGitSource(SOURCE), KEY);
  assert.equal(normalizeGitSource('git@github.com:TestAny-io/testany-agent-skills.git'), KEY);
});
