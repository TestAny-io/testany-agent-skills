// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appRoots } from './toolchain.mjs';

const execute = promisify(execFile);

export async function resolveCodexCli({ env = process.env, home = os.homedir(),
  codexHome = env.CODEX_HOME || path.join(home, '.codex'), explicit = env.SKILLDOCK_CODEX_BIN,
  apps = appRoots(env, home), timeout = 5000 } = {}) {
  const candidates = explicit ? [{ path: explicit, source: 'explicit' }] : [
    ...(env.PATH || '').split(path.delimiter).filter(directory => path.isAbsolute(directory))
      .map(directory => ({ path: path.join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex'), source: 'path' })),
    ...apps.map(app => ({ path: path.join(app, 'Contents/Resources/codex'), source: 'codex-app' })),
    { path: path.join(codexHome, 'plugins/.plugin-appserver/codex'), source: 'codex-managed' },
  ];
  const attempts = []; const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    if (!path.isAbsolute(candidate.path)) {
      attempts.push({ ...candidate, error: 'CLI 路径必须为绝对路径。' }); continue;
    }
    try { await fs.lstat(candidate.path); }
    catch (error) {
      if (explicit) attempts.push({ ...candidate, error: 'CLI 文件不存在或不可访问。' });
      continue;
    }
    try {
      const options = { timeout, maxBuffer: 128 * 1024, env: { ...env, CODEX_HOME: codexHome }, windowsHide: true };
      const version = (await execute(candidate.path, ['--version'], options)).stdout.trim();
      if (!/^codex(?:-cli)?\b/i.test(version)) throw new Error('未返回可识别的 Codex 版本。');
      const help = (await execute(candidate.path, ['plugin', '--help'], options)).stdout;
      if (!/\bmarketplace\b/.test(help) || !/\blist\b/.test(help)) throw new Error('此 CLI 不支持 plugin 管理。');
      return { available: true, ...candidate, version: version.slice(0, 200), attempts };
    } catch (error) {
      const message = error.killed ? 'CLI 检查超时。' : error.code === 'ENOENT' ? 'CLI wrapper 或其依赖不存在。'
        : typeof error.code === 'number' ? `CLI 检查失败（退出码 ${error.code}）。` : error.message.slice(0, 300);
      attempts.push({ ...candidate, error: message });
    }
  }
  return { available: false, attempts, error: explicit
    ? '指定的 Codex CLI 不可用；请检查 SKILLDOCK_CODEX_BIN 的绝对路径。'
    : '未找到支持插件管理的 Codex CLI。请检查桌面应用安装位置，或设置 SKILLDOCK_CODEX_BIN 后重启。' };
}
