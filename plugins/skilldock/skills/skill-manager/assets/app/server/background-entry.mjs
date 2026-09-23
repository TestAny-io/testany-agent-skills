// SPDX-License-Identifier: AGPL-3.0-only
// Copied to the stable data directory. Keep this entry dependency-free.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const file = process.argv[2];
let context;
try {
  context = JSON.parse(await fs.readFile(file, 'utf8'));
  if (context.version !== 1 || !path.isAbsolute(context.runtime) || !path.isAbsolute(context.stateDir)) throw new Error('Invalid background context');
  process.env.HOME = context.home;
  process.env.CODEX_HOME = context.codexHome;
  process.env.SKILLDOCK_STATE_DIR = context.stateDir;
  for (const name of ['SKILLDOCK_SELECTED_NPM_CLI', 'SKILLDOCK_CODEX_APP_DIR', 'SKILLDOCK_WORKSPACE_RUNTIME']) {
    if (context.environment?.[name]) process.env[name] = context.environment[name];
  }
  process.env.PATH = [path.dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/usr/local/bin'].join(path.delimiter);
  const { runBackground } = await import(pathToFileURL(path.join(context.runtime, 'server/background-worker.mjs')).href);
  await runBackground(context);
} catch (error) {
  const message = String(error.message).replace(/(https?:\/\/)[^\s/@]+@/g, '$1[redacted]@').slice(0, 2000);
  if (context?.stateDir) {
    const status = path.join(context.stateDir, 'background/status.json'); const temporary = `${status}.${process.pid}.tmp`;
    try {
      const stamp = new Date().toISOString();
      await fs.writeFile(temporary, JSON.stringify({ format: 2, lastWakeAt: stamp, finishedAt: stamp, outcome: 'error', error: message, errorAt: stamp }), { mode: 0o600 });
      await fs.rename(temporary, status);
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
  process.stderr.write(`SkillDock: ${message}\n`); process.exitCode = 1;
}
