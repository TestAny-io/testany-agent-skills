// Opt-in macOS runtime integration test. No system Node/npm is exposed to the launcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';

if (process.platform !== 'darwin') throw new Error('This smoke verifies the Codex macOS distribution.');
const privateRuntime = process.env.SKILLDOCK_SMOKE_PRIVATE === '1';
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-runtime-smoke-')));
const skill = path.join(root, "software's source"); const state = path.join(root, 'state'); const project = path.join(root, 'project');
await fs.mkdir(project);
await fs.cp(fileURLToPath(new URL('../../../', import.meta.url)), skill, { recursive: true,
  filter: input => !input.split(path.sep).some(part => ['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report'].includes(part)) });
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const env = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', CODEX_HOME: path.join(root, 'codex'),
  SKILLDOCK_STATE_DIR: state, SKILLDOCK_PROJECT_DIR: project, PORT: String(port),
  SKILLDOCK_NODE_BIN: '', SKILLDOCK_NPM_CLI: '', SKILLDOCK_SELECTED_NPM_CLI: '',
  ...(privateRuntime ? { SKILLDOCK_WORKSPACE_RUNTIME: path.join(root, 'absent-workspace') } : {}) };
const launcher = path.join(skill, 'scripts/launch.sh'); let result;
const command = async action => {
  const output = await runProcess('/bin/sh', [launcher, action], { cwd: project, env, timeout: 300000 });
  process.stderr.write(output.stderr); return JSON.parse(output.stdout);
};
try {
  assert.equal((await command('status')).status, 'stopped');
  await assert.rejects(fs.stat(state), { code: 'ENOENT' });
  const first = await command('start'); const record = JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8'));
  assert.equal(record.execution.source, privateRuntime ? 'skilldock-private' : 'codex-workspace');
  const health = await (await fetch(`${first.url}/api/health`)).json(); assert.equal(health.pid, first.pid);
  const page = await fetch(first.url); assert.equal(page.status, 200); assert.match(await page.text(), /SkillDock/);
  const source = await fetch(`${first.url}/skilldock-source.tar.gz`); assert.equal(source.status, 200);
  assert.equal((await command('start')).pid, first.pid);
  const restarted = await command('restart'); assert.notEqual(restarted.pid, first.pid);
  assert.equal((await command('status')).pid, restarted.pid);
  const doctor = await command('doctor'); assert.equal(doctor.source, record.execution.source);
  result = { passed: true, privateRuntime, root, execution: record.execution, doctor, firstPid: first.pid, restartedPid: restarted.pid };
} catch (error) { result = { passed: false, privateRuntime, root, message: error.stack }; process.exitCode = 1; }
finally {
  try { await command('stop'); } catch (error) { result = { ...result, stopError: error.message }; process.exitCode = 1; }
  await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
