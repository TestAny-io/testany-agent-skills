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
 * scope?, cwd?, missing?} with the application's version (`missing`: a project installation whose
 * project is gone); `run(args, {cwd})` runs one of its commands. Resolves to {from, to, message};
 * throws SKILLDOCK_UPDATE_FAILED or READBACK_FAILED with the manual steps, or CLI_TIMEOUT as it is.
 */
export async function updateSkilldockIn(agent, { list, run }) {
  const name = AGENT[agent];
  const listed = await list(); const before = listed.filter(item => !item.missing); const skipped = listed.length - before.length;
  if (!before.length) throw skipped ? new AppError(422, 'PROJECT_PATH_MISSING', `${name} 中 SkillDock 的安装所在的项目目录都不存在，无法更新。`)
    : new AppError(404, 'NOT_FOUND', `${name} 中没有可由 SkillDock 更新的 SkillDock 安装。`);
  const manual = manualUpdate[agent](before[0].marketplace);
  try {
    for (const market of new Set(before.map(item => item.marketplace)))
      await run(agent === 'codex' ? ['plugin', 'marketplace', 'upgrade', market, '--json'] : ['plugin', 'marketplace', 'update', market, '--json'], {});
    for (const item of before)
      await run(agent === 'codex' ? ['plugin', 'add', item.id, '--json'] : ['plugin', 'update', item.id, '--scope', item.scope, '--json'], { cwd: item.cwd });
  } catch (error) {
    // A timed-out command may have done its work: its outcome is unknown, not failed (5d review P3-02).
    if (error.code === 'CLI_TIMEOUT') throw error;
    throw new AppError(502, 'SKILLDOCK_UPDATE_FAILED', `${name} 中的 SkillDock 更新失败（${firstLine(error)}）。\n${manual}`);
  }
  // The manual steps go on their own line, which translates on its own.
  let after;
  try { after = await list(); } catch (error) { throw new AppError(502, 'READBACK_FAILED', `已运行 ${name} 的更新命令，但无法读回 SkillDock 的版本（${firstLine(error)}）。请核对后重试。\n${manual}`); }
  // Installation by installation (5d review P3-02): another marketplace's or scope's version says nothing.
  const key = item => `${item.id}\n${item.scope ?? ''}\n${item.cwd ?? ''}`;
  const now = item => after.find(other => key(other) === key(item));
  const raised = before.filter(item => parseVersion(now(item)?.version) && parseVersion(item.version) && compareVersions(parseVersion(now(item).version), parseVersion(item.version)) > 0);
  if (!before.some(item => now(item))) throw new AppError(502, 'READBACK_FAILED', `已运行 ${name} 的更新命令，但读回时没有找到 SkillDock。请核对后重试。\n${manual}`);
  if (!raised.length) throw new AppError(502, 'SKILLDOCK_UPDATE_FAILED', `${name} 的 marketplace 中没有更新的 SkillDock（当前 ${highest(before) ?? '?'}）。\n${manual}`);
  const from = highest(raised); const to = highest(raised.map(now));
  const notes = [...raised.length < before.length ? [`另有 ${before.length - raised.length} 处安装的版本没有变化。`] : [], ...skipped ? [`${skipped} 处安装所在的项目目录不存在，没有更新。`] : []];
  return { from, to, message: `已把 ${name} 中的 SkillDock 从 ${from} 更新到 ${to}。${agent === 'claude' ? '已打开的 Claude 会话需重载插件后生效。' : '新的 Codex 会话或重载后生效。'}${notes.map(note => `\n${note}`).join('')}` };
}
