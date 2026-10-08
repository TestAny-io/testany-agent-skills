// SPDX-License-Identifier: AGPL-3.0-only
// Installed next to the real 0.11 launcher in tests/compat-matrix.test.mjs: records how a
// launcher was invoked, with the same fields as stub-launcher.mjs, then the real one runs.
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
