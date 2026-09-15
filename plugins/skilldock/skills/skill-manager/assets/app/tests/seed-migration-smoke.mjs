// Opt-in: migrate the released testany-eng 2.4.0 installation in an isolated Codex home.
// Set SKILLDOCK_LEGACY_PLUGIN to plugins/testany-eng from the released checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';

const cli = process.env.SKILLDOCK_TEST_CODEX_BIN;
const legacy = process.env.SKILLDOCK_LEGACY_PLUGIN;
if (!cli || !path.isAbsolute(cli) || !legacy || !path.isAbsolute(legacy))
  throw new Error('Set absolute SKILLDOCK_TEST_CODEX_BIN and SKILLDOCK_LEGACY_PLUGIN paths.');
const legacyManifest = JSON.parse(await fs.readFile(path.join(legacy, '.claude-plugin/plugin.json'), 'utf8'));
assert.equal(legacyManifest.name, 'testany-eng'); assert.equal(legacyManifest.version, '2.4.0');
const skill = fileURLToPath(new URL('../../../', import.meta.url));
const repository = path.resolve(skill, '../../../..');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-seed-migration-')));
const codexHome = path.join(root, 'codex'); const state = path.join(root, 'state');
const project = path.join(root, 'user-project'); const market = path.join(root, 'market');
const eng = path.join(market, 'plugins/testany-eng'); const app = path.join(market, 'plugins/skilldock');
for (const directory of [codexHome, state, project, path.join(market, '.claude-plugin')]) await fs.mkdir(directory, { recursive: true });
const copyOptions = { recursive: true, filter: input => !input.split(path.sep).some(part =>
  ['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report', '__pycache__'].includes(part)) };
await fs.cp(legacy, eng, copyOptions);
const catalog = { name: 'testany-agent-skills', plugins: [{ name: 'testany-eng', source: './plugins/testany-eng' }] };
const catalogFile = path.join(market, '.claude-plugin/marketplace.json');
await fs.writeFile(catalogFile, JSON.stringify(catalog));
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const env = { ...process.env, CODEX_HOME: codexHome, SKILLDOCK_CODEX_BIN: cli,
  SKILLDOCK_STATE_DIR: state, SKILLDOCK_PROJECT_DIR: project, PORT: String(port) };
const command = async args => JSON.parse((await runProcess(cli, args, { cwd: project, env, timeout: 90000 })).stdout);
const launch = async (directory, ...args) => JSON.parse((await runProcess('/bin/sh',
  [path.join(directory, 'scripts/launch.sh'), ...args], { cwd: project, env, timeout: 240000 })).stdout);
const get = async endpoint => {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); return response.json();
};
let activeSkill; let result;
try {
  await command(['plugin', 'marketplace', 'add', market, '--json']);
  const installedLegacy = await command(['plugin', 'add', 'testany-eng@testany-agent-skills', '--json']);
  activeSkill = path.join(installedLegacy.installedPath, 'skills/skill-manager');
  assert.equal((await fs.readdir(path.dirname(activeSkill))).length, 22);
  const before = await launch(activeSkill, 'start');
  const session = await get('/api/session');
  const configured = await fetch(`http://127.0.0.1:${port}/api/actions`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': session.token },
    body: JSON.stringify({ mode: 'local', action: 'schedule.configure', schedule: {
      enabled: true, intervalMinutes: 1440, timezone: 'Asia/Shanghai', autoApply: true,
      targets: [{ kind: 'plugin', id: 'testany-eng@testany-agent-skills' }],
    } }), signal: AbortSignal.timeout(60000) });
  assert.equal(configured.status, 200, await configured.text());
  const oldSnapshot = await get('/api/state?mode=local');
  await fs.writeFile(path.join(state, 'seed-user-note.txt'), 'Existing user data must survive.\n');

  await fs.cp(path.resolve(skill, '../..'), app, copyOptions);
  const appEntry = JSON.parse(await fs.readFile(path.join(repository, '.claude-plugin/marketplace.json'), 'utf8'))
    .plugins.find(entry => entry.name === 'skilldock');
  catalog.plugins.push(appEntry); await fs.writeFile(catalogFile, JSON.stringify(catalog));
  await command(['plugin', 'marketplace', 'add', market, '--json']);
  const installedApp = await command(['plugin', 'add', 'skilldock@testany-agent-skills', '--json']);
  const nextSkill = path.join(installedApp.installedPath, 'skills/skill-manager');
  await assert.rejects(launch(nextSkill, 'start'), /--migrate-from testany-eng/);
  assert.equal((await get('/api/health')).pid, before.pid, 'rejected adoption leaves old service running');
  const after = await launch(nextSkill, 'start', '--project', project, '--migrate-from', 'testany-eng');
  activeSkill = nextSkill;
  assert.notEqual(after.pid, before.pid); assert.equal(after.project, project);
  const snapshot = await get('/api/state?mode=local');
  assert.deepEqual(snapshot.schedule, oldSnapshot.schedule);
  for (const activity of oldSnapshot.activity) assert.ok(snapshot.activity.some(item => item.id === activity.id));
  assert.equal(await fs.readFile(path.join(state, 'seed-user-note.txt'), 'utf8'), 'Existing user data must survive.\n');
  let list = await command(['plugin', 'list', '--marketplace', 'testany-agent-skills', '--json']);
  assert.deepEqual(list.installed.map(item => item.name).sort(), ['skilldock', 'testany-eng']);
  assert.equal(list.installed.find(item => item.name === 'testany-eng').version, '2.4.0', 'migration must not remove or update the whole toolset');

  // A separate, explicit toolset update removes only the former app entry.
  await fs.rm(eng, { recursive: true });
  await fs.cp(path.join(repository, 'plugins/testany-eng'), eng, copyOptions);
  const updatedEng = await command(['plugin', 'add', 'testany-eng@testany-agent-skills', '--json']);
  assert.equal(updatedEng.version, '2.4.1');
  const remainingSkills = await fs.readdir(path.join(updatedEng.installedPath, 'skills'));
  assert.equal(remainingSkills.length, 21); assert.ok(!remainingSkills.includes('skill-manager'));
  assert.equal((await launch(activeSkill, 'status')).pid, after.pid);
  result = { passed: true, fixture: root, cli, oldPid: before.pid, newPid: after.pid,
    installedAppVersion: installedApp.version, planPreserved: true, historyPreserved: true,
    dataPreserved: true, explicitMigrationRequired: true, remainingEngineeringSkills: remainingSkills.length };
} finally {
  if (activeSkill) await launch(activeSkill, 'stop').catch(error => process.stderr.write(`Cleanup: ${error.message}\n`));
  process.stderr.write(`Migration fixture: ${root}\n`);
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
