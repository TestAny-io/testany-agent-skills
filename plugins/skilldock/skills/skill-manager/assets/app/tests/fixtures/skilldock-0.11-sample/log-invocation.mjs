// SPDX-License-Identifier: AGPL-3.0-only
// Installed next to the real 0.11 launcher in tests/compat-matrix.test.mjs: records how a
// launcher was invoked, with the same fields as stub-launcher.mjs, then the real one runs.
// It also applies the sample's controls that stop before the launcher (waiting for a signal,
// failing); launch.sh applies the others around the real launcher.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(skillRoot, 'assets/app');
const version = JSON.parse(await fs.readFile(path.join(appPath, 'package.json'), 'utf8')).version;
const state = await fs.realpath(path.resolve(process.env.SKILLDOCK_STATE_DIR || path.join(os.homedir(), '.local/share/skilldock')));
const args = process.argv.slice(2); const action = args[0] || 'start';
let requested;
for (let i = 1; i < args.length; i += 2) if (args[i] === '--project') requested = args[i + 1];
await fs.appendFile(path.join(state, '..', 'invocations.jsonl'), JSON.stringify({
  version, agent: appPath.includes(`${path.sep}.codex${path.sep}`) ? 'codex' : 'claude', action, requested, cwd: process.cwd(),
  handover: process.env.SKILLDOCK_HANDOVER, handoverAgent: process.env.SKILLDOCK_HANDOVER_AGENT, handoverFrom: process.env.SKILLDOCK_HANDOVER_FROM,
  claudeSession: Boolean(process.env.CLAUDECODE), restartJob: process.env.SKILLDOCK_RESTART_JOB ?? null, real: true,
}) + '\n');
const control = JSON.parse(await fs.readFile(path.join(state, '..', 'stub-control.json'), 'utf8').catch(() => '{}'));
if (control.waitForSignal) {
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await fs.writeFile(path.join(state, '..', `${signal.toLowerCase()}-received`), String(process.pid)); process.exit(signal === 'SIGINT' ? 130 : 143); });
  await new Promise(resolve => setTimeout(resolve, 30000));
}
if (control.fail || control.noisyFail) {
  if (control.noisyFail) process.stdout.write(JSON.stringify({ status: 'partial-output-before-failure' }) + '\n');
  process.stderr.write('SkillDock：样本启动器按测试要求失败。\n'); process.exit(1);
}
