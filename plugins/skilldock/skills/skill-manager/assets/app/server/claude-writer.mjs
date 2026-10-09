// SPDX-License-Identifier: AGPL-3.0-only
// Claude write path through the official command line (HLD 3.3; DEC-SDX-003, 019, 023,
// 024). Only whitelisted subcommands run, always with --json, with the scope named
// explicitly where the command takes one. A marketplace-declared command (a command-source
// install or a headersHelper) is never accepted on the user's behalf: no -y, no
// --accept-command.
import { execFile } from 'node:child_process';
import { claudeCliEnvironment } from './process-env.mjs';
import { AppError, redact } from './errors.mjs';

const SCOPED = new Set(['plugin install', 'plugin uninstall', 'plugin enable', 'plugin disable', 'plugin marketplace add']);
const COMMANDS = new Set([...SCOPED, 'plugin marketplace remove', 'plugin marketplace update']);
const SCOPES = new Set(['user', 'project', 'local']);
const FLAGS = new Set(['--json', '--keep-data', '--scope']);

/** The command a write runs, or an error naming why it is refused. */
export function claudeWriteArgs(args) {
  const command = args.slice(0, args[1] === 'marketplace' ? 3 : 2).join(' ');
  if (!COMMANDS.has(command)) throw new AppError(403, 'CLI_COMMAND', '不支持该 Claude 命令行操作。');
  const rest = args.slice(command.split(' ').length);
  const positional = rest.filter((value, index) => !value.startsWith('-') && rest[index - 1] !== '--scope');
  if (positional.length !== 1 || /[\x00-\x1f]/.test(positional[0]) || positional[0].startsWith('-')) throw new AppError(400, 'CLI_COMMAND', 'Claude 命令行操作需要恰好一个对象。');
  for (const [index, value] of rest.entries()) {
    if (!value.startsWith('-')) continue;
    if (!FLAGS.has(value)) throw new AppError(403, 'CLI_COMMAND', `不支持 Claude 命令行参数 ${value}。`);
    if (value === '--scope' && !SCOPES.has(rest[index + 1])) throw new AppError(400, 'CLI_COMMAND', '作用域只能是 user、project 或 local。');
    if (value === '--keep-data' && command !== 'plugin uninstall') throw new AppError(400, 'CLI_COMMAND', '只有卸载可以保留数据。');
  }
  if (SCOPED.has(command) && !rest.includes('--scope')) throw new AppError(400, 'CLI_COMMAND', 'Claude 写操作必须显式指定作用域。');
  if (!rest.includes('--json')) throw new AppError(400, 'CLI_COMMAND', 'Claude 写操作必须使用机器可读输出。');
  return command;
}

// With --json the command prints one machine-readable line, the last one on stdout.
function lastJson(text) {
  const line = String(text).trim().split('\n').reverse().find(value => value.trim().startsWith('{'));
  try { return line ? JSON.parse(line) : null; } catch { return null; }
}

const confirmationNeeded = value => !!(value && typeof value === 'object' && (value.shownCommand || value.requiresConfirmation));

/**
 * Runs one Claude write. Resolves with the parsed result line; rejects with an AppError
 * (`HOST_MANAGED` when Claude asks to confirm a marketplace-declared command).
 */
export function claudeWriter({ cli, claudeRoot, env = process.env, timeout = 120000 }) {
  return (args, { cwd }) => {
    const command = claudeWriteArgs(args);
    return new Promise((resolve, reject) => {
      execFile(cli.path, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, shell: false,
        env: { ...claudeCliEnvironment(env, claudeRoot), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }, (error, stdout, stderr) => {
        const result = lastJson(stdout);
        if (confirmationNeeded(result)) return reject(new AppError(403, 'HOST_MANAGED', '这个插件需要执行 marketplace 声明的命令才能安装或更新，SkillDock 不代为确认；请在 Claude Code 中用 /plugin 手动处理。'));
        if (error) {
          const detail = (result && typeof result.error === 'string' && result.error) || (result && typeof result.message === 'string' && result.message) || String(stderr || error.message).split('\n').find(Boolean) || '没有返回详情';
          return reject(new AppError(error.killed ? 504 : 502, error.killed ? 'CLI_TIMEOUT' : 'CLI_FAILED', `Claude 命令行 ${command} 失败：${redact(detail)}`));
        }
        if (!result) return reject(new AppError(502, 'CLI_JSON', `Claude 命令行 ${command} 没有返回机器可读结果，无法确认实际状态。`));
        resolve(result);
      });
    });
  };
}
