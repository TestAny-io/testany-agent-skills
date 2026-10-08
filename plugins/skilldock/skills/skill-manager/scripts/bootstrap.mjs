#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolveToolchain } from '../assets/app/server/toolchain.mjs';
import { resolveCodexCli } from '../assets/app/server/codex-runtime.mjs';
import { parseLaunchArguments, resolveProject } from '../assets/app/server/project-context.mjs';
import { planLaunch, delegate, failureText } from '../assets/app/server/launch-plan.mjs';
import { readSavedNode } from '../assets/app/server/node-candidates.mjs';
import { showNodeGuidance } from '../assets/app/server/node-guide.mjs';

try {
  const { action, options, cliArgs } = parseLaunchArguments(process.argv.slice(2));
  const stateDir = path.resolve(process.env.SKILLDOCK_STATE_DIR || path.join(os.homedir(), '.local/share/skilldock'));
  // Decide before selecting or downloading a toolchain: newer data stops here (exit 3) and
  // a newer installation of the same family runs instead (DEC-SDX-008).
  const plan = await planLaunch({ action, appDir: fileURLToPath(new URL('../assets/app/', import.meta.url)) });
  if (plan.kind === 'error') {
    process.stderr.write(failureText(plan.error)); process.exitCode = plan.error.exitCode ?? 1;
  } else if (plan.kind === 'delegate') {
    process.stderr.write(`SkillDock：转交给 ${plan.target.agent === 'claude' ? 'Claude' : 'Codex'} 中的 SkillDock ${plan.target.version}。\n`);
    process.exitCode = await delegate(plan.target, process.argv.slice(2));
  } else if (action === 'cli') {
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
      // HLD 3.10: doctor only reads; start and restart save the selection.
      toolchain = await resolveToolchain({ stateDir, save: action !== 'doctor' });
      if (action === 'doctor') {
        const cli = await resolveCodexCli();
        const project = await resolveProject({ projectDir: options.projectDir, stateDir });
        process.stdout.write(`${JSON.stringify({ ...toolchain, bootstrap: process.execPath, saved: await readSavedNode(stateDir), state: stateDir, cli, project }, null, 2)}\n`);
        if (toolchain.available === false || !cli.available) process.exitCode = 1;
      } else if (toolchain.available === false) {
        const skillRoot = fileURLToPath(new URL('../', import.meta.url));
        const shown = showNodeGuidance({ skillRoot, args: process.argv.slice(2), state: stateDir });
        throw new Error(`未找到能构建 SkillDock 的 Node.js 22.12 或更新版本（已检查 ${toolchain.rejected.length} 个位置）。${shown
          ? '已显示安装引导：安装后点“重新检测”，或重新打开 SkillDock。'
          : '请安装 Node.js 22.12 或更新版本后重新打开；也可用 SKILLDOCK_NODE_BIN 指定 Node 的绝对路径。'}`);
      } else process.stderr.write(`SkillDock：使用 ${toolchain.source === 'saved' ? `保存的（${toolchain.savedSource}）` : toolchain.source} Node ${toolchain.nodeVersion} / npm ${toolchain.npmVersion}。\n`);
    }
    if (action !== 'doctor') {
      const node = toolchain?.node || process.execPath;
      // The gate's command-line confirmation already ran here; launch.mjs only re-reads files.
      const env = { ...process.env, ...(plan.gateChecked ? { SKILLDOCK_GATE_CHECKED: '1' } : {}), ...(toolchain ? {
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
