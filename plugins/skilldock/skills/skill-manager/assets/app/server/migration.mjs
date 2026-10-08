// SPDX-License-Identifier: AGPL-3.0-only
// Migration from generation 1 (0.10.x) to 2 (HLD 3.7, 6.6; DEC-SDX-022; API-SDX-001 36a
// §8, 36b §7.4). The gate and the failure record are bootstrap-safe; the takeover runs
// inside launch.mjs while <state>/launcher.lock is held.
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_TAIL, atLeast, compareVersions, parseVersion, readJsonFile, readText, safeSegment } from './installs.mjs';
import { writeAtomic } from './generation.mjs';

export const GATE_MINIMUM = '0.10.3';
export const failureFile = state => path.join(state, 'compat/migration-failure.json');
const AGENT_NAME = { codex: 'Codex', claude: 'Claude' };

async function listDirectory(directory, unreadable) {
  try { return await fs.readdir(directory); }
  catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') unreadable.push({ path: directory, error: error.code || 'ERROR' }); return []; }
}

/**
 * The gate (DEC-SDX-022): is any SkillDock older than 0.10.3 installed in any Agent?
 * Read-only file evidence. Codex keeps earlier version directories, so the highest
 * version of each marketplace counts; Claude marks replaced directories orphaned, so
 * every directory without the marker counts. Unreadable evidence never passes.
 */
export async function migrationGate(roots) {
  const blockers = []; const unreadable = [];
  for (const cache of roots.caches) {
    // Only a missing path counts as absent; any other error is unreadable evidence.
    let cacheReal;
    try { cacheReal = await fs.realpath(cache.cacheDir); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') unreadable.push({ path: cache.cacheDir, error: error.code || 'ERROR' }); continue; }
    for (const market of (await listDirectory(cacheReal, unreadable)).filter(safeSegment)) {
      const pluginDir = path.join(cacheReal, market, 'skilldock');
      const found = [];
      for (const name of (await listDirectory(pluginDir, unreadable)).filter(safeSegment)) {
        const versionDir = path.join(pluginDir, name);
        const marker = await readText(path.join(versionDir, '.orphaned_at'));
        if (marker === null) {
          // The marker exists but cannot be read, or the version directory itself cannot be.
          if (!await fs.access(versionDir, fs.constants.R_OK | fs.constants.X_OK).then(() => true, () => false)) { unreadable.push({ path: versionDir, error: 'EACCES' }); continue; }
          continue;
        }
        if (marker !== undefined) continue;
        const file = path.join(versionDir, ...APP_TAIL, 'package.json');
        const text = await readText(file);
        if (text === undefined) continue;
        if (text === null) { unreadable.push({ path: file, error: 'UNREADABLE' }); continue; }
        let version;
        try { version = JSON.parse(text)?.version; } catch { /* not an installation */ }
        if (parseVersion(version)) found.push({ agent: cache.agent, marketplace: market, version, directory: versionDir,
          config: cache.agent === 'codex' ? path.join(cache.home, 'config.toml') : cache.configDir && path.join(cache.configDir, 'plugins/installed_plugins.json') });
      }
      const counted = cache.agent === 'codex'
        ? found.sort((a, b) => compareVersions(parseVersion(b.version), parseVersion(a.version))).slice(0, 1) : found;
      blockers.push(...counted.filter(item => !atLeast(item.version, GATE_MINIMUM)));
    }
  }
  return { passed: !blockers.length && !unreadable.length, blockers, unreadable };
}

/** Guidance for a failed gate (HLD 3.7): what to update or clean, no way to skip. */
export function gateGuidance(gate) {
  const lines = []; const steps = [];
  for (const item of gate.blockers) {
    const agent = AGENT_NAME[item.agent] ?? item.agent;
    lines.push(`${agent} 中装有 SkillDock ${item.version}（marketplace ${item.marketplace}），低于 ${GATE_MINIMUM}。`);
    steps.push(`在 ${agent} 中把 SkillDock 更新到最新版本，或从 ${agent} 卸载 SkillDock。`);
    steps.push(`如果 ${agent} 已卸载、只剩残留：构成“已安装”判定的是缓存目录 ${item.directory}${item.config ? `（以及 ${item.config} 中 skilldock@${item.marketplace} 的条目）` : ''}，清理后即可继续。`);
  }
  for (const item of gate.unreadable) {
    lines.push(`无法读取 ${item.path}（${item.error}），无法确认其中的 SkillDock 版本。`);
    steps.push(`为当前用户开放 ${item.path} 的读取权限后重试。`);
  }
  steps.push('处理后重新打开 SkillDock，会重新检查。');
  const message = `SkillDock 0.11 暂不接管数据：${lines.join('')}旧版本照常工作，没有改动任何数据。`;
  return { status: 'migration-blocked', message, blockers: gate.blockers, unreadable: gate.unreadable, steps: [...new Set(steps)] };
}

export async function readMigrationFailure(state) {
  const value = await readJsonFile(failureFile(state));
  return value && value.format === 1 && typeof value.appDir === 'string' ? value : null;
}

export async function writeMigrationFailure(state, { appDir, version, message }) {
  await writeAtomic(failureFile(state), `${JSON.stringify({ format: 1, appDir, version, message, failedAt: new Date().toISOString() }, null, 2)}\n`);
}

export async function clearMigrationFailure(state) { await fs.rm(failureFile(state), { force: true }); }

/** 36b §7.4: a non-interactive job for the target that failed before is refused, without a time limit. */
export async function repeatedFailure(state, { appDir, version }) {
  const failure = await readMigrationFailure(state);
  return failure && failure.appDir === appDir && failure.version === version ? failure : null;
}

/** The update state 0.11 writes: version 2, every other field as 0.10.x left it (36a §8). */
export async function convertPlan(state, defaults) {
  const file = path.join(state, 'local/updates.json');
  const text = await readText(file);
  if (text === null) throw new Error('计划文件无法读取，未迁移。');
  let plan;
  if (text === undefined) plan = { ...defaults, version: 2 };
  else {
    try { plan = JSON.parse(text); } catch { throw new Error('计划文件格式无效，未迁移。'); }
    if (!plan || typeof plan !== 'object' || ![1, 2].includes(plan.version)) throw new Error('计划文件版本无法识别，未迁移。');
    plan = { ...plan, version: 2 };
  }
  await writeAtomic(file, `${JSON.stringify(plan, null, 2)}\n`);
  return { file, previous: text };
}

/** Snapshot of files a failed migration restores byte for byte (absent files are removed again). */
export async function snapshotFiles(files) {
  const saved = [];
  for (const file of files) {
    const text = await readText(file, 16 * 1024 * 1024);
    if (text === null) throw new Error(`无法读取 ${file}，未迁移。`);
    saved.push({ file, text, mode: typeof text === 'string' ? (await fs.stat(file)).mode & 0o777 : undefined });
  }
  // Every file is attempted; failures are reported together.
  return async () => {
    const failures = [];
    for (const { file, text, mode } of saved) {
      try {
        if (text === undefined) await fs.rm(file, { force: true });
        else { await writeAtomic(file, text); await fs.chmod(file, mode); }
      } catch (error) { failures.push(`${path.basename(file)}（${error.code || error.message}）`); }
    }
    if (failures.length) throw new Error(`以下文件未能恢复：${failures.join('、')}`);
  };
}
