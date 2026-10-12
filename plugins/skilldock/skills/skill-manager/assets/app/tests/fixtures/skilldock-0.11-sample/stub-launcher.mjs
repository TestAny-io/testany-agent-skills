// SPDX-License-Identifier: AGPL-3.0-only
// Hand-written 0.11.x sample for the 0.10.3 compatibility gate (API-SDX-001 36b §6.3, §11).
// It implements only what the frozen contract requires of a 0.11.x launcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const appPath = path.join(skillRoot, 'assets/app');
const version = JSON.parse(await fs.readFile(path.join(appPath, 'package.json'), 'utf8')).version;
const home = os.homedir();
const state = await fs.realpath(path.resolve(process.env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock')));
const control = JSON.parse(await fs.readFile(path.join(state, '..', 'stub-control.json'), 'utf8').catch(() => '{}'));
const recordFile = path.join(state, 'launcher.json');
const legacy = path.join(state, 'compat/legacy-project');
const agent = appPath.includes(`${path.sep}.codex${path.sep}`) ? 'codex' : 'claude';

const args = process.argv.slice(2); const action = args[0] || 'start';
let requested;
for (let i = 1; i < args.length; i += 2) if (args[i] === '--project') requested = args[i + 1];
await fs.appendFile(path.join(state, '..', 'invocations.jsonl'), JSON.stringify({
  version, agent, action, requested, cwd: process.cwd(),
  handover: process.env.SKILLDOCK_HANDOVER, handoverAgent: process.env.SKILLDOCK_HANDOVER_AGENT, handoverFrom: process.env.SKILLDOCK_HANDOVER_FROM,
  claudeSession: Boolean(process.env.CLAUDECODE), restartJob: process.env.SKILLDOCK_RESTART_JOB ?? null,
}) + '\n');
if (control.waitForSignal) {
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await fs.writeFile(path.join(state, '..', `${signal.toLowerCase()}-received`), String(process.pid)); process.exit(signal === 'SIGINT' ? 130 : 143); });
  await new Promise(resolve => setTimeout(resolve, 30000));
}
if (control.fail || control.noisyFail) {
  if (control.noisyFail) process.stdout.write(JSON.stringify({ status: 'partial-output-before-failure' }) + '\n');
  process.stderr.write('SkillDock：样本启动器按测试要求失败。\n'); process.exit(1);
}

async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function valid(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return null;
  try {
    const real = await fs.realpath(value);
    if (!(await fs.stat(real)).isDirectory()) return null;
    const relative = path.relative(state, real);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? null : real;
  } catch { return null; }
}
async function health(record) {
  try { return await (await fetch(`${record.url}/api/health`, { signal: AbortSignal.timeout(1500) })).json(); } catch { return null; }
}
async function codexSource() {
  const codexHome = await fs.realpath(process.env.CODEX_HOME || path.join(home, '.codex')).catch(() => null);
  if (!codexHome) return null;
  const base = path.join(codexHome, 'plugins/cache/testany-agent-skills/skilldock');
  const order = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  const versions = (await fs.readdir(base).catch(() => [])).filter(name => /^\d+\.\d+\.\d+$/.test(name)).sort(order);
  if (!versions.length) return null;
  return { source: path.join(base, versions[0], 'skills/skill-manager/assets/app'),
    installation: { kind: 'plugin', codexHome, marketplace: 'testany-agent-skills', plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' } };
}
async function write(record) {
  await fs.writeFile(`${recordFile}.tmp`, JSON.stringify(record, null, 2), { mode: 0o600 });
  await fs.rename(`${recordFile}.tmp`, recordFile);
}
async function freePort(preferred) {
  const attempt = port => new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(null)); s.listen(port, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  return (preferred && await attempt(preferred)) || attempt(0);
}

const current = await readJson(recordFile);
const live = current?.format >= 2 && current.status === 'running' ? await health(current) : null;
const running = live && live.pid === current.pid ? current : null;

if (action === 'status') { process.stdout.write(JSON.stringify(running ? { status: 'running', url: running.url } : { status: 'stopped' }) + '\n'); process.exit(0); }
if (action === 'stop') {
  if (running) {
    try { process.kill(running.pid, 'SIGTERM'); } catch { /* gone */ }
    for (let i = 0; i < 50; i++) { try { process.kill(running.pid, 0); } catch { break; } await new Promise(resolve => setTimeout(resolve, 50)); }
    await write({ ...current, status: 'stopped', updatedAt: new Date().toISOString() });
  }
  process.stdout.write(JSON.stringify({ status: 'stopped' }) + '\n'); process.exit(0);
}

// 36b §6.3 project fallback. Explicit levels ①② may switch a running instance; ③～⑤ never do.
const fallbackMode = process.env.SKILLDOCK_HANDOVER === '1' || !(await valid(requested));
let project = null; let explicit = false;
if (!fallbackMode) { project = await valid(requested); explicit = true; }
else {
  for (const [value, isExplicit] of [[requested, true], [process.env.SKILLDOCK_PROJECT_DIR, true], [(await readJson(path.join(state, 'project.json')))?.path, false], [current?.actualProject, false], [home, false]]) {
    const checked = await valid(value);
    if (checked) { project = checked; explicit = isExplicit; break; }
  }
}
if (running && (!explicit || project === live.project) && action === 'start') {
  process.stdout.write(JSON.stringify({ status: 'running', url: running.url, project: live.project, reused: true }) + '\n'); process.exit(0);
}
if (running) {
  try { process.kill(running.pid, 'SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < 50; i++) { try { process.kill(running.pid, 0); } catch { break; } await new Promise(resolve => setTimeout(resolve, 50)); }
}

await fs.mkdir(legacy, { recursive: true, mode: 0o700 });
const port = await freePort(control.forcePort ?? Number(process.env.PORT || 0));
const digest = crypto.randomBytes(16).toString('hex');
const server = spawn(process.execPath, [path.join(here, 'stub-server.mjs')], {
  detached: true, stdio: 'ignore',
  env: { PORT: String(port), STUB_STATE: state, STUB_PROJECT: project, STUB_DIGEST: digest, STUB_VERSION: version },
});
server.unref();
await fs.appendFile(path.join(state, '..', 'stub-pids'), `${server.pid}\n`);
const legacyFields = (await codexSource()) || { source: appPath, installation: { kind: 'directory', source: appPath } };
const reference = { agent, marketplace: 'testany-agent-skills', appPath, version, sourceKey: 'github.com/testany-io/testany-agent-skills' };
const record = {
  url: `http://127.0.0.1:${port}`, pid: server.pid, state, project: legacy, projectContext: null,
  ...legacyFields, digest, runtime: path.join(state, 'runtimes/stub'), codexHome: legacyFields.installation.codexHome ?? null,
  format: 2, generation: 2, status: 'running', running: reference, preferred: current?.preferred ?? reference,
  actualProject: project, updatedAt: new Date().toISOString(),
};
for (let i = 0; i < 80; i++) {
  const h = await health(record);
  if (h?.pid === server.pid) {
    await write(record);
    // Exit only after the pipe has accepted everything, otherwise large output is truncated.
    const text = (control.bigStdout ? 'x'.repeat(70 * 1024) + '\n' : '') + JSON.stringify({ status: 'running', url: record.url, project, reused: false }) + '\n';
    process.stdout.write(text, () => process.exit(control.restartThenFail ? 1 : 0));
    await new Promise(() => {});
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
process.stderr.write('SkillDock：样本服务未能启动。\n'); process.exit(1);
