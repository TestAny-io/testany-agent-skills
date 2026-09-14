#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolveToolchain } from '../assets/app/server/toolchain.mjs';

const action = process.argv[2] || 'start';
try {
  if (process.argv.length > 3 || !['start', 'restart', 'stop', 'status', 'doctor'].includes(action))
    throw new Error('用法：/bin/sh launch.sh [start|status|stop|restart|doctor]');
  const stateDir = path.resolve(process.env.SKILLDOCK_STATE_DIR || path.join(os.homedir(), '.local/share/skilldock'));
  let toolchain;
  if (action === 'start' || action === 'restart' || action === 'doctor') {
    toolchain = await resolveToolchain({ stateDir, allowInstall: action !== 'doctor' });
    if (action === 'doctor') {
      process.stdout.write(`${JSON.stringify({ ...toolchain, state: stateDir }, null, 2)}\n`);
      if (toolchain.available === false) process.exitCode = 1;
    } else process.stderr.write(`SkillDock：使用 ${toolchain.source} 的 Node ${toolchain.nodeVersion} / npm ${toolchain.npmVersion}。\n`);
  }
  if (action !== 'doctor') {
    const node = toolchain?.node || process.execPath;
    const env = { ...process.env, ...(toolchain ? {
      SKILLDOCK_SELECTED_NPM_CLI: toolchain.npmCli, SKILLDOCK_NODE_SOURCE: toolchain.source,
      PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH || ''}`,
    } : {}) };
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(node, [fileURLToPath(new URL('./launch.mjs', import.meta.url)), action], { env, stdio: 'inherit', shell: false });
      child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
    });
  }
} catch (error) {
  process.stderr.write(`SkillDock：${error.message}\n`); process.exitCode = 1;
}
