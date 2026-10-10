// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. One-click update of the SkillDock in one Agent: 36c 7.2 `agent.updateSkilldock`,
// and the update the launcher runs when the migration gate stops at an older SkillDock (HLD 3.7,
// G-01). That Agent's own commands refresh its marketplace and update the plugin; its plugin list
// is read back.
import path from 'node:path';
import { AppError, redact } from './errors.mjs';
import { APP_TAIL, compareVersions, parseVersion, readJsonFile, readText } from './installs.mjs';

const AGENT = { codex: 'Codex', claude: 'Claude' };

/** What the user can do by hand (HLD 3.7). */
export const manualUpdate = {
  codex: marketplace => `在 Codex 的插件页更新 SkillDock，或运行 codex plugin add skilldock@${marketplace}。`,
  claude: marketplace => `在 Claude 中用 /plugin 更新 SkillDock，或在终端运行 claude plugin update skilldock@${marketplace}，然后重载插件。`,
};

// The application version of a Claude installation: its package (the plugin version of a
// Git-sourced plugin is a commit digest). An orphaned directory is no longer in use.
export async function claudeAppVersion(installPath) {
  if (typeof installPath !== 'string' || !path.isAbsolute(installPath)) return null;
  if (await readText(path.join(installPath, '.orphaned_at')) !== undefined) return null;
  return (await readJsonFile(path.join(installPath, ...APP_TAIL, 'package.json')))?.version ?? null;
}

const firstLine = error => redact(String(error?.message ?? error).split('\n')[0]);
const highest = items => items.map(item => item.version).filter(parseVersion).sort((a, b) => compareVersions(parseVersion(b), parseVersion(a)))[0];

/**
 * `list()` gives that Agent's SkillDock installations it can update, as {id, marketplace, version,
 * scope?, cwd?} with the application's version; `run(args, {cwd})` runs one of its commands.
 * Resolves to {from, to, message}; throws SKILLDOCK_UPDATE_FAILED or READBACK_FAILED with the
 * manual steps.
 */
export async function updateSkilldockIn(agent, { list, run }) {
  const name = AGENT[agent];
  const before = await list();
  if (!before.length) throw new AppError(404, 'NOT_FOUND', `${name} 中没有可由 SkillDock 更新的 SkillDock 安装。`);
  const manual = manualUpdate[agent](before[0].marketplace);
  try {
    for (const market of new Set(before.map(item => item.marketplace)))
      await run(agent === 'codex' ? ['plugin', 'marketplace', 'upgrade', market, '--json'] : ['plugin', 'marketplace', 'update', market, '--json'], {});
    for (const item of before)
      await run(agent === 'codex' ? ['plugin', 'add', item.id, '--json'] : ['plugin', 'update', item.id, '--scope', item.scope, '--json'], { cwd: item.cwd });
  } catch (error) { throw new AppError(502, 'SKILLDOCK_UPDATE_FAILED', `${name} 中的 SkillDock 更新失败（${firstLine(error)}）。\n${manual}`); }
  // The manual steps go on their own line, which translates on its own.
  let after;
  try { after = await list(); } catch (error) { throw new AppError(502, 'READBACK_FAILED', `已运行 ${name} 的更新命令，但无法读回 SkillDock 的版本（${firstLine(error)}）。请核对后重试。\n${manual}`); }
  const from = highest(before); const to = highest(after);
  if (!to) throw new AppError(502, 'READBACK_FAILED', `已运行 ${name} 的更新命令，但读回时没有找到 SkillDock。请核对后重试。\n${manual}`);
  if (!from || compareVersions(parseVersion(to), parseVersion(from)) <= 0) throw new AppError(502, 'SKILLDOCK_UPDATE_FAILED', `${name} 的 marketplace 中没有更新的 SkillDock（当前 ${from ?? '?'}）。\n${manual}`);
  return { from, to, message: `已把 ${name} 中的 SkillDock 从 ${from} 更新到 ${to}。${agent === 'claude' ? '已打开的 Claude 会话需重载插件后生效。' : '新的 Codex 会话或重载后生效。'}` };
}
