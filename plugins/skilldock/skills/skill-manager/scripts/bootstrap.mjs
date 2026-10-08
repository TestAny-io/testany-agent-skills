#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolveToolchain } from '../assets/app/server/toolchain.mjs';
import { resolveCodexCli } from '../assets/app/server/codex-runtime.mjs';
import { parseLaunchArguments, resolveProject } from '../assets/app/server/project-context.mjs';
import { runHandover } from '../assets/app/server/handover.mjs';

try {
  const { action, options, cliArgs } = parseLaunchArguments(process.argv.slice(2));
  const stateDir = path.resolve(process.env.SKILLDOCK_STATE_DIR || path.join(os.homedir(), '.local/share/skilldock'));
  // Decide before selecting or downloading a toolchain (API-SDX-001 36b §4.2).
  const handover = await runHandover({ action, projectDir: options.projectDir, appDir: fileURLToPath(new URL('../assets/app/', import.meta.url)) });
  if (handover !== null) process.exitCode = handover;
  else if (action === 'cli') {
    const cli = await resolveCodexCli();
    if (!cli.available) throw new Error(cli.error + '\n' + cli.attempts.map(item => `${item.path}：${item.error}`).join('\n'));
    process.stderr.write(`SkillDock：Codex CLI ${cli.path}（${cli.version}）\n`);
    if (cliArgs.length === 1 && cliArgs[0] === '--print-path') process.stdout.write(`${cli.path}\n`);
    else {
      if (!cliArgs.length || !['plugin', '--version'].includes(cliArgs[0])) throw new Error('CLI 入口仅支持 --version 或 plugin 子命令。');
      process.exitCode = await new Promise((resolve, reject) => {
        const child = spawn(cli.path, cliArgs, { env: process.env, stdio: 'inherit', shell: false });
        child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
      });
    }
  } else {
    let toolchain;
    if (action === 'start' || action === 'restart' || action === 'doctor') {
      toolchain = await resolveToolchain({ stateDir, allowInstall: action !== 'doctor' });
      if (action === 'doctor') {
        const cli = await resolveCodexCli();
        const project = await resolveProject({ projectDir: options.projectDir, stateDir });
        process.stdout.write(`${JSON.stringify({ ...toolchain, state: stateDir, cli, project }, null, 2)}\n`);
        if (toolchain.available === false || !cli.available) process.exitCode = 1;
      } else process.stderr.write(`SkillDock：使用 ${toolchain.source} 的 Node ${toolchain.nodeVersion} / npm ${toolchain.npmVersion}。\n`);
    }
    if (action !== 'doctor') {
      const node = toolchain?.node || process.execPath;
      const env = { ...process.env, ...(toolchain ? {
        SKILLDOCK_SELECTED_NPM_CLI: toolchain.npmCli, SKILLDOCK_NODE_SOURCE: toolchain.source,
        PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH || ''}`,
      } : {}) };
      process.exitCode = await new Promise((resolve, reject) => {
        const child = spawn(node, [fileURLToPath(new URL('./launch.mjs', import.meta.url)), ...process.argv.slice(2)], { env, stdio: 'inherit', shell: false });
        child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
      });
    }
  }
} catch (error) {
  process.stderr.write(`SkillDock：${error.message}\n`); process.exitCode = 1;
}
