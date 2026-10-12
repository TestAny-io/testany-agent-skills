// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { materializeRuntime, verifySourceArtifacts } from '../scripts/source-bundle.mjs';
import { acquireFileLock } from './process-lock.mjs';
import { findNpm, buildEnvironment } from './toolchain.mjs';

// `log`: an open file descriptor that receives the output; otherwise it goes to stderr.
async function run(command, args, cwd, env, log = 2) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env, timeout: 300000, stdio: ['ignore', log, log] });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args[0]} 失败（${code}）`)));
  });
}

export async function verifyRuntime(runtime, digest) {
  const result = await verifySourceArtifacts(runtime);
  if (result.manifest.sourceDigest !== digest) throw new Error('运行目录源码摘要与启动记录不一致。');
  for (const [name, expected] of [['skilldock-source.tar.gz', result.bundle], ['LICENSE.txt', result.license]]) {
    if (!(await fs.readFile(path.join(runtime, 'dist', name))).equals(expected)) throw new Error('运行目录中的公开源码或许可证与构建快照不一致。');
  }
}

// `log`: a file that receives dependency installation and build output; stderr then only
// gets a summary (API-SDX-001 36b §6.3).
export async function prepareRuntime(stateDir, snapshot, { environment = process.env, log } = {}) {
  const digest = snapshot.sourceDigest;
  const runtime = path.join(stateDir, 'runtimes', digest.slice(0, 20));
  const marker = path.join(runtime, '.build-complete');
  try { if ((await fs.readFile(marker, 'utf8')) === digest) { await verifyRuntime(runtime, digest); return runtime; } } catch {}
  const release = acquireFileLock(path.join(stateDir, 'runtime-build.lock'));
  try {
    try { if ((await fs.readFile(marker, 'utf8')) === digest) { await verifyRuntime(runtime, digest); return runtime; } } catch {}
    // An incomplete or mismatched runtime contains generated files, never user state.
    await fs.rm(runtime, { recursive: true, force: true });
    await materializeRuntime(snapshot, runtime);
    process.stderr.write('SkillDock：准备隔离运行目录与锁定的依赖…\n');
    const npm = await findNpm(process.execPath, { env: environment });
    if (!npm) throw new Error('未找到 npm，请使用 /bin/sh scripts/launch.sh 自动选择运行环境。');
    const env = await buildEnvironment(runtime, process.execPath, npm.npmCli, { ...environment, npm_config_update_notifier: 'false' });
    // One previous log is kept; a log over 1 MiB starts over (second-to-last build kept as .1).
    if (log && (await fs.stat(log).catch(() => null))?.size > 1024 * 1024) await fs.rename(log, `${log}.1`);
    const handle = log ? await fs.open(log, 'a', 0o600) : null;
    try {
      if (log) process.stderr.write(`SkillDock：依赖安装与构建的输出写入 ${log}\n`);
      await run(process.execPath, [npm.npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], runtime, env, handle?.fd);
      await run(process.execPath, [npm.npmCli, 'run', 'build'], runtime, env, handle?.fd);
    } catch (error) {
      throw log ? Object.assign(new Error(`${error.message}，详见 ${log}`), { cause: error }) : error;
    } finally { await handle?.close(); }
    await verifyRuntime(runtime, digest);
    await fs.writeFile(marker, digest, { mode: 0o600 });
    return runtime;
  } finally { release(); }
}
