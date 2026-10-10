// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Command-line confirmation of the migration gate (HLD 3.7, 36b §7.4):
// after the read-only file evidence passes, each Agent's own plugin list is asked whether
// a SkillDock older than 0.10.3 is installed. Claude falls back to its install record when
// its command line is unavailable. A command line runs only when that Agent's
// configuration root exists, because listing would create it.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { resolveCodexCli } from './codex-runtime.mjs';
import { resolveClaudeCli, listClaudePlugins } from './claude-cli.mjs';
import { childEnvironment } from './process-env.mjs';
import { atLeast, parseVersion, readJsonFile } from './installs.mjs';
import { GATE_MINIMUM } from './migration.mjs';
import { claudeAppVersion } from './skilldock-update.mjs';

const exists = async directory => (await fs.stat(directory).catch(() => null))?.isDirectory() ?? false;

function codexInstalled(cli, codexHome, env, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cli, ['plugin', 'list', '--json'], { timeout, maxBuffer: 4 * 1024 * 1024, env: childEnvironment(env, { CODEX_HOME: codexHome }), shell: false }, (error, stdout) => {
      if (error) return reject(error);
      try { const value = JSON.parse(String(stdout)); resolve(Array.isArray(value?.installed) ? value.installed : []); } catch (problem) { reject(problem); }
    });
  });
}

async function claudeInstallRecord(configDir) {
  const record = await readJsonFile(path.join(configDir, 'plugins/installed_plugins.json'));
  if (!record || typeof record.plugins !== 'object') return [];
  return Object.entries(record.plugins).flatMap(([id, entries]) => Array.isArray(entries) ? entries.map(entry => ({ id, installPath: entry?.installPath })) : []);
}

/** Blockers found by the command lines (or Claude's install record), and notes on what was used. */
export async function commandLineGateEvidence({ codexHome, claudeRoot, state, env = process.env, home = os.homedir(), timeout = 15000 }) {
  const blockers = []; const notes = [];
  if (codexHome && await exists(codexHome)) {
    const cli = await resolveCodexCli({ codexHome, env, home });
    if (!cli.available) notes.push('Codex 命令行不可用，以插件缓存为准。');
    else {
      try {
        const installed = await codexInstalled(cli.path, codexHome, env, timeout);
        notes.push(`已用 Codex 命令行 ${cli.path}（${cli.version}）确认插件清单。`);
        for (const plugin of installed) {
          if (plugin?.name !== 'skilldock' || !parseVersion(plugin.version) || atLeast(plugin.version, GATE_MINIMUM)) continue;
          blockers.push({ agent: 'codex', marketplace: plugin.marketplaceName, version: plugin.version, evidence: 'Codex 命令行插件清单', config: path.join(codexHome, 'config.toml') });
        }
      } catch (error) { notes.push(`Codex 命令行插件清单不可用（${String(error.message).split('\n')[0]}），以插件缓存为准。`); }
    }
  }
  if (claudeRoot?.configDir && await exists(claudeRoot.configDir)) {
    const cli = await resolveClaudeCli({ state, env, home, claudeRoot, save: false });
    let entries = null; let evidence = 'Claude 安装记录';
    if (cli.available) {
      try {
        entries = (await listClaudePlugins(cli.path, { env, claudeRoot, timeout })).map(item => ({ id: item.id, installPath: item.installPath }));
        notes.push(`已用 Claude 命令行 ${cli.path}（${cli.version}）确认插件清单。`); evidence = 'Claude 命令行插件清单';
      }
      catch (error) { notes.push(`${error.message}，改用安装记录。`); }
    } else notes.push('Claude 命令行不可用，改用安装记录。');
    entries ??= await claudeInstallRecord(claudeRoot.configDir);
    for (const { id, installPath } of entries) {
      if (typeof id !== 'string' || !id.startsWith('skilldock@')) continue;
      const version = await claudeAppVersion(installPath);
      if (!parseVersion(version) || atLeast(version, GATE_MINIMUM)) continue;
      blockers.push({ agent: 'claude', marketplace: id.slice('skilldock@'.length), version, directory: installPath, evidence,
        config: path.join(claudeRoot.configDir, 'plugins/installed_plugins.json') });
    }
  }
  return { blockers, notes };
}
