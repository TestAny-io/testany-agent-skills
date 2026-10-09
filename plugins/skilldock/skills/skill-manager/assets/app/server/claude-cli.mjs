// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Claude command-line discovery (HLD 3.3): explicit → saved → the path a
// Claude session gave the launcher → the desktop app's bundled command line (highest
// version) → PATH → standalone installs under the home directory. The choice is saved
// and checked with a version query before use; a failed check rediscovers.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { claudeCliEnvironment } from './process-env.mjs';

export const claudeCliSettings = state => path.join(state, 'settings/claude-cli.json');
const VERSION = /^(\d+)\.(\d+)\.(\d+)/;
const newerFirst = (a, b) => { const x = VERSION.exec(a).slice(1).map(Number); const y = VERSION.exec(b).slice(1).map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };

export async function readClaudeCliSettings(state) {
  try { const value = JSON.parse(await fs.readFile(claudeCliSettings(state), 'utf8')); return value?.format === 1 ? value : null; }
  catch { return null; }
}

async function writeClaudeCliSettings(state, value) {
  const file = claudeCliSettings(state);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { await fs.writeFile(temporary, `${JSON.stringify({ ...value, format: 1 }, null, 2)}\n`, { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

/** The launcher records the command line a Claude session provides (CLAUDE_CODE_EXECPATH). */
export async function recordSessionCli(state, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return;
  const current = await readClaudeCliSettings(state) ?? {};
  if (current.sessionPath !== file) await writeClaudeCliSettings(state, { ...current, sessionPath: file, sessionSeenAt: new Date().toISOString() });
}

// The desktop app keeps bundled command lines as <version>/<build>/claude.app (not a
// public contract, HLD 9.1).
async function desktopCommandLines(home) {
  const root = path.join(home, 'Library/Application Support/Claude/claude-code');
  let versions = [];
  try { versions = (await fs.readdir(root)).filter(name => VERSION.test(name) && /^\d+\.\d+\.\d+$/.test(name)).sort(newerFirst); } catch { return []; }
  const found = [];
  for (const version of versions) {
    let builds = [];
    try { builds = (await fs.readdir(path.join(root, version))).sort(); } catch { continue; }
    for (const build of builds) found.push(path.join(root, version, build, 'claude.app/Contents/MacOS/claude'));
  }
  return found;
}

export async function claudeCliCandidates({ env = process.env, home = os.homedir(), saved } = {}) {
  // An explicit command line is the only candidate, as for Codex: a wrong one fails.
  if (env.SKILLDOCK_CLAUDE_BIN) return [{ file: env.SKILLDOCK_CLAUDE_BIN, source: 'explicit' }];
  const list = [];
  const add = (file, source) => { if (typeof file === 'string' && path.isAbsolute(file) && !list.some(item => item.file === file)) list.push({ file, source }); };
  add(saved?.path, 'saved');
  add(saved?.sessionPath, 'session');
  for (const file of await desktopCommandLines(home)) add(file, 'desktop');
  for (const directory of (env.PATH || '').split(path.delimiter)) if (path.isAbsolute(directory)) add(path.join(directory, 'claude'), 'path');
  add(path.join(home, '.local/bin/claude'), 'user');
  add(path.join(home, '.claude/local/claude'), 'user');
  return list;
}

/** `claude --version` (creates no files) with the allowed environment. */
export function verifyClaudeCli(file, { env = process.env, claudeRoot, timeout = 10000 } = {}) {
  return new Promise(resolve => {
    execFile(file, ['--version'], { timeout, maxBuffer: 64 * 1024, env: claudeCliEnvironment(env, claudeRoot ?? {}), shell: false }, (error, stdout) => {
      const match = !error && /^(\d+\.\d+\.\d+)\b.*Claude Code/m.exec(String(stdout));
      resolve(match ? { version: match[1] } : { reason: error ? error.message.split('\n')[0] : '不是 Claude Code 命令行。' });
    });
  });
}

/**
 * The first candidate that answers its version query. Unless `save` is false, the choice
 * is saved for the service and background tasks (which never read session variables).
 */
export async function resolveClaudeCli({ state, env = process.env, home = os.homedir(), claudeRoot, save = true, verify = verifyClaudeCli } = {}) {
  const saved = state ? await readClaudeCliSettings(state) : null;
  const attempts = [];
  for (const { file, source } of await claudeCliCandidates({ env, home, saved })) {
    if (!path.isAbsolute(file)) { attempts.push({ path: file, source, error: '命令行路径必须为绝对路径。' }); continue; }
    try { await fs.access(file, fs.constants.X_OK); } catch { if (source !== 'path' && source !== 'user' && source !== 'desktop') attempts.push({ path: file, source, error: '文件不存在或不可执行。' }); continue; }
    const checked = await verify(file, { env, claudeRoot });
    if (!checked.version) { attempts.push({ path: file, source, error: checked.reason }); continue; }
    if (save && state && source !== 'explicit' && (saved?.path !== file || saved?.version !== checked.version))
      await writeClaudeCliSettings(state, { ...saved, path: file, version: checked.version, source, verifiedAt: new Date().toISOString() }).catch(() => {});
    return { available: true, path: file, version: checked.version, source, attempts };
  }
  return { available: false, attempts, error: '未找到可用的 Claude 命令行。' };
}

/**
 * `claude plugin list --json` for the saved Claude root. It creates Claude's configuration
 * when that directory is missing, so callers only run it when the root exists.
 */
export function listClaudePlugins(cli, { env = process.env, claudeRoot, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cli, ['plugin', 'list', '--json'], { timeout, maxBuffer: 4 * 1024 * 1024, env: claudeCliEnvironment(env, claudeRoot ?? {}), cwd: claudeRoot?.configDir, shell: false }, (error, stdout) => {
      if (error) return reject(new Error(`Claude 命令行插件清单失败：${error.message.split('\n')[0]}`));
      try { const value = JSON.parse(String(stdout)); if (!Array.isArray(value)) throw new Error('形状不受支持'); resolve(value); }
      catch (problem) { reject(new Error(`Claude 命令行插件清单无法解析：${problem.message}`)); }
    });
  });
}
