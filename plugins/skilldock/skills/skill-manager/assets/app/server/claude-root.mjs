// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Claude root record (API-SDX-001 36a §6; DEC-SDX-024). 0.10.3 reads
// this file after its transfer chain triggers, so its format must not change.
import path from 'node:path';
import os from 'node:os';
import { absolute, canonical, readJsonFile } from './installs.mjs';
import { writeAtomic } from './generation.mjs';

export const claudeRootFile = state => path.join(state, 'agents/claude-root.json');

export async function readClaudeRoot(state) {
  const value = await readJsonFile(claudeRootFile(state));
  return value && value.format === 1 && absolute(value.configDir) && absolute(value.pluginCacheDir) ? value : null;
}

export async function writeClaudeRoot(state, { configDir, pluginCacheDir, origin }) {
  const record = { format: 1, configDir: await canonical(configDir), pluginCacheDir: await canonical(pluginCacheDir), origin, updatedAt: new Date().toISOString() };
  await writeAtomic(claudeRootFile(state), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * Whether this process was started from a Claude entry. A 0.10.3 handover says so
 * explicitly (36b §6.3); otherwise the Claude Code session marker decides.
 */
export function startedFromClaude(env = process.env) {
  return env.SKILLDOCK_HANDOVER === '1' ? env.SKILLDOCK_HANDOVER_AGENT === 'claude' : env.CLAUDECODE === '1';
}

/**
 * DEC-SDX-024 priority: saved value → the Claude session's own directories → defaults.
 * A saved value is never replaced silently; differences are surfaced by the service.
 */
export async function resolveClaudeRoot({ state, env = process.env, home = os.homedir() } = {}) {
  const saved = state ? await readClaudeRoot(state) : null;
  if (saved) return { configDir: saved.configDir, pluginCacheDir: saved.pluginCacheDir, origin: saved.origin, saved: true };
  if (startedFromClaude(env) && (absolute(env.CLAUDE_CONFIG_DIR) || absolute(env.CLAUDE_CODE_PLUGIN_CACHE_DIR))) {
    const configDir = absolute(env.CLAUDE_CONFIG_DIR) ? env.CLAUDE_CONFIG_DIR : path.join(home, '.claude');
    const pluginCacheDir = absolute(env.CLAUDE_CODE_PLUGIN_CACHE_DIR) ? env.CLAUDE_CODE_PLUGIN_CACHE_DIR : path.join(configDir, 'plugins/cache');
    return { configDir: await canonical(configDir), pluginCacheDir: await canonical(pluginCacheDir), origin: 'session', saved: false };
  }
  const configDir = path.join(home, '.claude');
  return { configDir: await canonical(configDir), pluginCacheDir: await canonical(path.join(configDir, 'plugins/cache')), origin: 'default', saved: false };
}
