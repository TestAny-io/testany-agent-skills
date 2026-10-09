// SPDX-License-Identifier: AGPL-3.0-only
// Agent environment layer (HLD 3.1, 3.6; DEC-SDX-001, 018, 024; API-SDX-001 36c §6): which
// Agents this machine has, where their roots are, and whether SkillDock manages them.
// Discovery only reads; it never creates an Agent's root (HLD 3.1).
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson } from './files.mjs';
import { resolveClaudeRoot, writeClaudeRoot, readClaudeSessionRoot } from './claude-root.mjs';
import { resolveClaudeCli } from './claude-cli.mjs';
import { agentRoots, discoverInstalls, compareVersions, parseVersion, canonical } from './installs.mjs';

export const AGENTS = ['codex', 'claude'];
export const AGENT_NAME = { codex: 'Codex', claude: 'Claude' };
export const managementFile = state => path.join(state, 'settings/agents.json');

const isDirectory = async directory => (await fs.stat(directory).catch(() => null))?.isDirectory() ?? false;
const CLI_CACHE_MS = 60000;

/** Persisted management states ({agent: {management, origin, changedAt}}); unreadable means none yet. */
export async function readManagement(state) {
  try {
    const value = await readJson(managementFile(state), null);
    return value?.format === 1 && value.agents && typeof value.agents === 'object' ? value.agents : {};
  } catch { return {}; }
}

export async function writeManagement(state, agents) {
  await writeJson(managementFile(state), { format: 1, agents });
}

/**
 * HLD 3.6: the Agent that has SkillDock installed is enabled when it first appears, the
 * other one read-only. Codex stays enabled unless SkillDock is installed in Claude only,
 * which keeps 0.10.2 behaviour for upgrades and development copies (MR-SDX-001).
 */
export function defaultManagement(agent, installs) {
  const has = side => installs.some(item => item.agent === side);
  if (agent === 'codex') return has('codex') || !has('claude') ? 'enabled' : 'read-only';
  return has('claude') ? 'enabled' : 'read-only';
}

const manualUpdate = {
  codex: marketplace => `在 Codex 的插件页更新 SkillDock，或运行 codex plugin add skilldock@${marketplace}。`,
  claude: marketplace => `在 Claude 中用 /plugin 更新 SkillDock，或在终端运行 claude plugin update skilldock@${marketplace}，然后重载插件。`,
};

/**
 * `codexCli()` and `claudeCli(claudeRoot)` report {available, version?, path?, error?};
 * `unconfirmed(agent)` gives the reason an environment's main evidence cannot be read
 * (filled in by the read paths), or null.
 */
export function createAgentLayer({ stateDir, home, codexHome, appDir, env = process.env, codexCli, claudeCli, clock = () => Date.now() }) {
  let cachedClaude = null;
  const claudeStatus = async (claudeRoot, force) => {
    if (claudeCli) return claudeCli(claudeRoot, { force });
    if (!force && cachedClaude && cachedClaude.configDir === claudeRoot.configDir && clock() - cachedClaude.at < CLI_CACHE_MS) return cachedClaude.value;
    const found = await resolveClaudeCli({ state: stateDir, env, home, claudeRoot });
    const value = found.available ? { available: true, version: found.version, path: found.path } : { available: false, error: found.error };
    cachedClaude = { configDir: claudeRoot.configDir, at: clock(), value };
    return value;
  };

  /** Roots, command lines and installations; persists first-appearance defaults. */
  async function discover({ force = false } = {}) {
    const claudeRoot = await resolveClaudeRoot({ state: stateDir, env, home });
    const [codex, claude] = await Promise.all([codexCli(), claudeStatus(claudeRoot, force)]);
    const installed = {
      codex: await isDirectory(codexHome) || codex.available,
      claude: await isDirectory(claudeRoot.configDir) || claude.available,
    };
    // DEC-SDX-024: the Claude root is fixed when Claude is first found, then always reused.
    if (installed.claude && !claudeRoot.saved) await writeClaudeRoot(stateDir, claudeRoot).catch(() => {});
    const roots = await agentRoots({ env: { CODEX_HOME: codexHome }, home, claudeRoot });
    const installs = await discoverInstalls(roots);
    const stored = await readManagement(stateDir);
    let changed = false;
    for (const agent of AGENTS) if (installed[agent] && !stored[agent]) {
      stored[agent] = { management: defaultManagement(agent, installs), origin: 'default', changedAt: new Date(clock()).toISOString() };
      changed = true;
    }
    if (changed) await writeManagement(stateDir, stored).catch(() => {});
    return { claudeRoot, cli: { codex, claude }, installed, installs, stored, session: await readClaudeSessionRoot(stateDir) };
  }

  /** Effective state: the stored one, unless the main evidence cannot be read (HLD 3.2, 3.6). */
  function effective(agent, found, unconfirmed) {
    const stored = found.stored[agent]?.management === 'enabled' ? 'enabled' : 'read-only';
    if (!found.installed[agent]) return { management: stored };
    const error = found.cli.claude.error;
    const reason = agent === 'claude' && !found.cli.claude.available
      ? !error || error === '未找到可用的 Claude 命令行。' ? '未找到可用的 Claude 命令行，无法确认 Claude 中的插件状态。' : `未找到可用的 Claude 命令行（${error}），无法确认 Claude 中的插件状态。`
      : unconfirmed?.(agent);
    return reason ? { management: 'unconfirmed', reason } : { management: stored };
  }

  /** 36c §6 AgentEnvironment list: installed environments and those enabled before. */
  async function environments({ force = false, unconfirmed, found } = {}) {
    found ??= await discover({ force });
    const own = await canonical(appDir).catch(() => appDir);
    const list = [];
    for (const agent of AGENTS) {
      if (!found.installed[agent] && found.stored[agent]?.management !== 'enabled') continue;
      const state = effective(agent, found, unconfirmed);
      const roots = agent === 'codex'
        ? { config: codexHome, pluginCache: path.join(codexHome, 'plugins/cache'), skills: path.join(codexHome, 'skills'), origin: env.CODEX_HOME ? 'session' : 'default' }
        : { config: found.claudeRoot.configDir, pluginCache: found.claudeRoot.pluginCacheDir, skills: path.join(found.claudeRoot.configDir, 'skills'), origin: found.claudeRoot.origin === 'explicit' ? 'explicit' : found.claudeRoot.origin === 'session' ? 'session' : 'default' };
      const mine = found.installs.filter(item => item.agent === agent).sort((a, b) => compareVersions(parseVersion(b.version), parseVersion(a.version)));
      const highest = [...found.installs].sort((a, b) => compareVersions(parseVersion(b.version), parseVersion(a.version)))[0];
      const environment = { agent, installed: found.installed[agent], management: state.management, ...(state.reason ? { reason: state.reason } : {}),
        roots, cli: found.cli[agent] };
      if (!found.installed[agent]) environment.reason = `本机未找到 ${AGENT_NAME[agent]}；之前启用的管理状态保留，恢复后继续生效。`;
      if (mine[0]) {
        const behind = highest && compareVersions(parseVersion(mine[0].version), parseVersion(highest.version)) < 0;
        environment.skilldock = { version: mine[0].version, running: mine.some(item => item.appPath === own), canUpdate: false,
          ...(behind ? { reason: `比 ${AGENT_NAME[highest.agent]} 中的 SkillDock ${highest.version} 旧。${manualUpdate[agent](mine[0].marketplace)}` } : {}) };
      }
      const notes = [];
      if (agent === 'claude') {
        notes.push('从 Claude 桌面应用打开的会话不会自动更新插件（桌面应用为会话关闭了自动更新）；可在 SkillDock 或终端中手动更新。');
        // These plugins live in the desktop app's own session data, not in the Claude root.
        notes.push('Claude 桌面应用为会话自带的插件（例如内置浏览器、电脑操作）不安装在 Claude 配置目录中，这里不列出。');
        const session = found.session;
        if (session && (session.configDir !== found.claudeRoot.configDir || session.pluginCacheDir !== found.claudeRoot.pluginCacheDir))
          notes.push(`最近一次从 Claude 打开 SkillDock 时，Claude 使用的配置目录是 ${session.configDir}，与这里保存的 ${found.claudeRoot.configDir} 不同；如需改用，请在下方切换 Claude 根目录。`);
      }
      if (notes.length) environment.notes = notes;
      list.push(environment);
    }
    return list;
  }

  return { discover, environments, effective, claudeStatus };
}
