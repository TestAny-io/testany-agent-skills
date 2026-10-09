// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Process environments of the service and of the Agent command-line tools
// it runs (HLD 3.3, DEC-SDX-024): only allowed variables are inherited; Claude and Codex
// session variables never are.
import path from 'node:path';

const ALLOWED = new Set(['HOME', 'USER', 'LOGNAME', 'LANG', 'LANGUAGE', 'TMPDIR',
  'SSH_AUTH_SOCK', 'GIT_SSH_COMMAND',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GIT_SSL_CAINFO']);
// Per-invocation SkillDock variables of the launch chain, not settings.
const LAUNCH_ONLY = new Set(['SKILLDOCK_RESTART_JOB', 'SKILLDOCK_HANDOVER', 'SKILLDOCK_HANDOVER_AGENT', 'SKILLDOCK_HANDOVER_FROM',
  'SKILLDOCK_DELEGATED', 'SKILLDOCK_GATE_CHECKED', 'SKILLDOCK_SELECTED_NPM_VERSION']);
const FIXED_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/usr/local/bin'];

/**
 * PATH by rule: the directory of the Node running this process, the fixed system
 * directories, then the inherited absolute directories (user tools such as Git helpers).
 */
export function constructedPath(env = process.env, node = process.execPath) {
  const inherited = (env.PATH || '').split(path.delimiter).filter(directory => path.isAbsolute(directory));
  return [...new Set([path.dirname(node), ...FIXED_PATH, ...inherited])].join(path.delimiter);
}

/**
 * The allowed part of `env`, SkillDock settings included; `extra` is applied on top.
 * `npm: true` (dependency installation and build) also keeps npm's own configuration
 * variables, such as a registry mirror.
 */
export function childEnvironment(env = process.env, extra = {}, { node = process.execPath, npm = false } = {}) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (ALLOWED.has(key) || key.startsWith('LC_') || (key.startsWith('SKILLDOCK_') && !LAUNCH_ONLY.has(key))
      || (npm && /^npm_config_/i.test(key))) result[key] = value;
  }
  result.PATH = constructedPath(env, node);
  for (const [key, value] of Object.entries(extra)) { if (value === undefined || value === null) delete result[key]; else result[key] = String(value); }
  return result;
}

/**
 * The Claude command line: allowed variables, the saved Claude root, and no self-update
 * of the command line itself while it manages plugins.
 */
export function claudeCliEnvironment(env = process.env, { configDir, pluginCacheDir } = {}) {
  return childEnvironment(env, { CLAUDE_CONFIG_DIR: configDir, ...(pluginCacheDir && configDir && pluginCacheDir !== path.join(configDir, 'plugins/cache') ? { CLAUDE_CODE_PLUGIN_CACHE_DIR: pluginCacheDir } : {}),
    DISABLE_AUTOUPDATER: '1' });
}
