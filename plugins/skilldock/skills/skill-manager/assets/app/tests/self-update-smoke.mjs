// Opt-in real Codex CLI + production launcher smoke; all writes stay in a new temporary fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';
import { launch as manageLauncher } from '../../../scripts/launch.mjs';

const cli = process.env.SKILLDOCK_TEST_CODEX_BIN;
const gitSource = process.env.SKILLDOCK_SMOKE_GIT === '1';
const bootstrap = process.env.SKILLDOCK_SMOKE_BOOTSTRAP === '1';
if (!cli || !path.isAbsolute(cli)) throw new Error('Set SKILLDOCK_TEST_CODEX_BIN to a verified Codex CLI executable.');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-self-update-smoke-')));
const codexHome = path.join(root, 'codex'); const state = path.join(root, 'state'); const market = path.join(root, 'market'); const project = path.join(root, 'project');
const selectedProject = path.join(root, 'selected-project');
for (const directory of [codexHome, state, market, project, selectedProject]) await fs.mkdir(directory);
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageRoot = path.join(market, 'plugins/skilldock-smoke');
const sourceSkill = path.join(packageRoot, 'skills/skill-manager');
await fs.cp(sourceRoot, sourceSkill, { recursive: true, filter: input => !input.split(path.sep).some(part => ['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report'].includes(part)) });
await fs.mkdir(path.join(packageRoot, '.claude-plugin'), { recursive: true });
await fs.mkdir(path.join(market, '.claude-plugin'));
await fs.writeFile(path.join(market, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'skilldock-smoke-market', plugins: [{ name: 'skilldock-smoke', source: './plugins/skilldock-smoke' }] }));
const manifest = path.join(packageRoot, '.claude-plugin/plugin.json');
await fs.writeFile(manifest, JSON.stringify({ name: 'skilldock-smoke', version: '0.1.0', skills: './skills' }));
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const env = { ...process.env, CODEX_HOME: codexHome, SKILLDOCK_CODEX_BIN: cli, SKILLDOCK_STATE_DIR: state, SKILLDOCK_PROJECT_DIR: project, PORT: String(port) };
const command = async args => JSON.parse((await runProcess(cli, args, { cwd: project, env, timeout: 45000 })).stdout);
const launch = async (directory, action) => JSON.parse((await runProcess(bootstrap ? '/bin/sh' : process.execPath, [path.join(directory, bootstrap ? 'scripts/launch.sh' : 'scripts/launch.mjs'), action], { cwd: project, env, timeout: 240000 })).stdout);
const url = `http://127.0.0.1:${port}`;
const get = async endpoint => { const response = await fetch(url + endpoint, { signal: AbortSignal.timeout(10000) }); assert.equal(response.status, 200); return response.json(); };
const action = async input => {
  const session = await get('/api/session');
  const response = await fetch(url + '/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': session.token }, body: JSON.stringify({ mode: 'local', ...input }), signal: AbortSignal.timeout(60000) });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
};
let installedSkill; let result; let gitServer;
const git = args => runProcess('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=SkillDock test', '-c', 'user.email=skilldock-test@example.invalid', '-C', market, ...args], { timeout: 20000 });
try {
  let marketplaceSource = market;
  if (gitSource) {
    await git(['init', '-b', 'main']); await git(['add', '.']); await git(['commit', '-m', 'Fixture version one']); await git(['update-server-info']);
    const gitRoot = path.join(market, '.git');
    gitServer = http.createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(gitRoot, `.${pathname}`);
        if (!file.startsWith(`${gitRoot}${path.sep}`)) throw new Error('invalid path');
        const bytes = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': pathname.endsWith('/info/refs') ? 'text/plain' : 'application/octet-stream' }); response.end(bytes);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => gitServer.listen(0, '127.0.0.1', resolve));
    marketplaceSource = `http://127.0.0.1:${gitServer.address().port}`;
  }
  await command(['plugin', 'marketplace', 'add', marketplaceSource, '--json']);
  const installed = await command(['plugin', 'add', 'skilldock-smoke@skilldock-smoke-market', '--json']);
  installedSkill = path.join(installed.installedPath, 'skills/skill-manager');
  await launch(installedSkill, 'start');
  await action({ action: 'project.select', projectDir: selectedProject });
  assert.equal((await get('/api/health')).project, selectedProject);
  assert.equal((await launch(installedSkill, 'status')).project, selectedProject);
  // Subsequent launches still use cwd=project, but must honor the GUI's saved choice.
  delete env.SKILLDOCK_PROJECT_DIR;
  await action({ action: 'schedule.configure', schedule: { enabled: true, intervalMinutes: 15, timezone: 'Asia/Shanghai', autoApply: true, targets: [{ kind: 'plugin', id: 'skilldock-smoke@skilldock-smoke-market' }] } });
  await launch(installedSkill, 'stop');
  const updatesFile = path.join(state, 'local/updates.json'); const updates = JSON.parse(await fs.readFile(updatesFile, 'utf8'));
  updates.schedule.nextRunAt = '2000-01-01T00:00:00.000Z'; await fs.writeFile(updatesFile, JSON.stringify(updates));
  await fs.writeFile(manifest, JSON.stringify({ name: 'skilldock-smoke', version: '0.2.0', skills: './skills' }));
  await fs.appendFile(path.join(sourceSkill, 'assets/app/README.md'), '\nSelf-update smoke version two.\n');
  if (gitSource) { await git(['add', '.']); await git(['commit', '-m', 'Fixture version two']); await git(['update-server-info']); }
  const old = await launch(installedSkill, 'start');
  const before = await get('/api/health');
  assert.equal(before.project, selectedProject);
  let after;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const job = JSON.parse(await fs.readFile(path.join(state, 'restart.json'), 'utf8'));
      if (job.status === 'failed') throw new Error(`Self restart failed: ${job.message}`);
      after = await get('/api/health');
      if (job.status === 'ready' && after.pid !== old.pid && after.sourceDigest === job.sourceDigest) break;
    } catch (error) { if (/Self restart failed/.test(error.message)) throw error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(after && after.pid !== old.pid, 'new runtime should activate automatically');
  assert.equal(after.project, selectedProject, 'self update preserves the selected scan project');
  const record = JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8'));
  if (bootstrap) assert.notEqual(record.execution.source, 'direct');
  assert.match(record.source, /skilldock-smoke\/0\.2\.0\/skills\/skill-manager\/assets\/app$/);
  const snapshot = await get('/api/state?mode=local');
  assert.equal(snapshot.schedule.enabled, true); assert.equal(snapshot.schedule.autoApply, true);
  assert.equal(snapshot.schedule.targets.length, 1);
  assert.equal(snapshot.plugins.find(item => item.id === 'skilldock-smoke@skilldock-smoke-market').version, '0.2.0');
  assert.ok(snapshot.updateRuns.some(run => run.items.some(item => item.status === 'updated')));
  assert.ok(snapshot.activity.some(item => item.action === 'schedule.configure'));
  const finalUpdates = JSON.parse(await fs.readFile(updatesFile, 'utf8'));
  assert.match(finalUpdates.bindings['plugin:skilldock-smoke@skilldock-smoke-market'].real, /skilldock-smoke\/0\.2\.0$/);
  assert.notEqual(after.sourceDigest, before.sourceDigest);
  const activeSkill = path.resolve(record.source, '../..');
  await launch(activeSkill, 'stop');
  finalUpdates.schedule.nextRunAt = '2000-01-01T00:00:00.000Z'; await fs.writeFile(updatesFile, JSON.stringify(finalUpdates));
  await launch(activeSkill, 'start');
  let subsequent;
  for (let i = 0; i < 100; i++) {
    subsequent = await get('/api/state?mode=local');
    if (subsequent.updateRuns.length > snapshot.updateRuns.length && subsequent.updateRuns[0].status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(subsequent.updateRuns.length, snapshot.updateRuns.length + 1);
  assert.equal(subsequent.updateRuns[0].items[0].status, 'current');
  result = { passed: true, realCodexCli: cli, root, sourceType: gitSource ? 'git' : 'local', bootstrap, execution: record.execution, node: process.versions.node, oldPid: old.pid, newPid: after.pid,
    oldDigest: before.sourceDigest, newDigest: after.sourceDigest, selectedProjectPreserved: true, planPreserved: true, nextScheduledRunPassed: true, historyPreserved: true, installedVersion: '0.2.0' };
} catch (error) {
  process.stderr.write(JSON.stringify({ fixture: root, error: error.message }) + '\n'); throw error;
} finally {
  try {
    const record = JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8'));
    const listing = await command(['plugin', 'list', '--marketplace', 'skilldock-smoke-market', '--json']);
    const current = listing.installed.find(item => item.pluginId === 'skilldock-smoke@skilldock-smoke-market');
    const appDir = current ? path.join(codexHome, 'plugins/cache/skilldock-smoke-market/skilldock-smoke', current.version, 'skills/skill-manager/assets/app') : record.source;
    await manageLauncher('stop', { appDir, stateDir: state, projectDir: project, codexHome, port });
  } catch (error) { process.stderr.write(`Smoke cleanup: ${error.message}\n`); }
  if (gitServer) await new Promise(resolve => { gitServer.close(resolve); gitServer.closeIdleConnections(); });
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
