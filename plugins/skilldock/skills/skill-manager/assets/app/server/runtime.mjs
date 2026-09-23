// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { materializeRuntime, verifySourceArtifacts } from '../scripts/source-bundle.mjs';
import { acquireFileLock } from './process-lock.mjs';
import { findNpm, buildEnvironment } from './toolchain.mjs';

async function run(command, args, cwd, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env, timeout: 300000, stdio: ['ignore', 2, 2] });
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

export async function prepareRuntime(stateDir, snapshot, { environment = process.env } = {}) {
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
    await run(process.execPath, [npm.npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], runtime, env);
    await run(process.execPath, [npm.npmCli, 'run', 'build'], runtime, env);
    await verifyRuntime(runtime, digest);
    await fs.writeFile(marker, digest, { mode: 0o600 });
    return runtime;
  } finally { release(); }
}
