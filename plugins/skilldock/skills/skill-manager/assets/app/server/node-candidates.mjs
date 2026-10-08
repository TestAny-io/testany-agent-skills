// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. The Node.js candidates of HLD 3.10 (DEC-SDX-012) — one definition for
// the shell entries (launch.sh, native.sh, the background run.sh) and the bootstrap's
// selection, with the selection saved in the data directory and reused.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Shell variables the patterns use, with their JavaScript equivalent.
const VARIABLES = [
  ['state', '${SKILLDOCK_STATE_DIR:-"$HOME/.local/share/skilldock"}', c => c.stateDir],
  ['saved_node', '$(/usr/bin/head -n 1 "$state/settings/node-path" 2>/dev/null || true)', c => c.saved ?? ''],
  ['workspace', '${SKILLDOCK_WORKSPACE_RUNTIME:-"$HOME/.cache/codex-runtimes/codex-primary-runtime"}', c => c.env.SKILLDOCK_WORKSPACE_RUNTIME || path.join(c.home, '.cache/codex-runtimes/codex-primary-runtime')],
  ['nvm_dir', '${NVM_DIR:-"$HOME/.nvm"}', c => c.env.NVM_DIR || path.join(c.home, '.nvm')],
  ['fnm_dir', '${FNM_DIR:-"$HOME/.local/share/fnm"}', c => c.env.FNM_DIR || path.join(c.home, '.local/share/fnm')],
  ['fnm_mac', '"$HOME/Library/Application Support/fnm"', c => path.join(c.home, 'Library/Application Support/fnm')],
  ['volta_home', '${VOLTA_HOME:-"$HOME/.volta"}', c => c.env.VOLTA_HOME || path.join(c.home, '.volta')],
  ['asdf_dir', '${ASDF_DATA_DIR:-"$HOME/.asdf"}', c => c.env.ASDF_DATA_DIR || path.join(c.home, '.asdf')],
  ['mise_dir', '${MISE_DATA_DIR:-"$HOME/.local/share/mise"}', c => c.env.MISE_DATA_DIR || path.join(c.home, '.local/share/mise')],
  ['nodenv_root', '${NODENV_ROOT:-"$HOME/.nodenv"}', c => c.env.NODENV_ROOT || path.join(c.home, '.nodenv')],
  ['path_node', '$(command -v node || true)', c => c.pathNode ?? ''],
  ['app', '${SKILLDOCK_CODEX_APP_DIR:-/Applications/ChatGPT.app}', c => c.env.SKILLDOCK_CODEX_APP_DIR || '/Applications/ChatGPT.app'],
];

/**
 * Scan order (HLD 3.10): explicit → saved → Codex workspace → downloaded private Node →
 * common locations → version managers → PATH. Desktop-app Node only runs the bootstrap:
 * its signing blocks native modules, so it is never selected or saved (docs 18).
 */
export const CANDIDATES = [
  { source: 'explicit', pattern: '${SKILLDOCK_NODE_BIN:-}' },
  { source: 'saved', pattern: '$saved_node' },
  { source: 'codex-workspace', pattern: '$workspace/dependencies/node/bin/node' },
  { source: 'skilldock-private', pattern: '$state/node/node-v*-darwin-*/bin/node' },
  { source: 'homebrew', pattern: '/opt/homebrew/bin/node', system: true },
  { source: 'common', pattern: '/usr/local/bin/node', system: true },
  { source: 'nvm', pattern: '$nvm_dir/versions/node/v*/bin/node' },
  { source: 'fnm', pattern: '$fnm_dir/node-versions/v*/installation/bin/node' },
  { source: 'fnm', pattern: '$fnm_mac/node-versions/v*/installation/bin/node' },
  { source: 'volta', pattern: '$volta_home/tools/image/node/*/bin/node' },
  { source: 'asdf', pattern: '$asdf_dir/installs/nodejs/*/bin/node' },
  { source: 'mise', pattern: '$mise_dir/installs/node/*/bin/node' },
  { source: 'nodenv', pattern: '$nodenv_root/versions/*/bin/node' },
  { source: 'path', pattern: '$path_node' },
  { source: 'app', pattern: '$app/Contents/Resources/cua_node/bin/node', bootstrapOnly: true },
  { source: 'app', pattern: '$app/Contents/Resources/node', bootstrapOnly: true },
  { source: 'app', pattern: '/Applications/Codex.app/Contents/Resources/cua_node/bin/node', bootstrapOnly: true, system: true },
  { source: 'app', pattern: '/Applications/Codex.app/Contents/Resources/node', bootstrapOnly: true, system: true },
  { source: 'app', pattern: '$HOME/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node', bootstrapOnly: true },
  { source: 'app', pattern: '$HOME/Applications/ChatGPT.app/Contents/Resources/node', bootstrapOnly: true },
  { source: 'app', pattern: '$HOME/Applications/Codex.app/Contents/Resources/cua_node/bin/node', bootstrapOnly: true },
  { source: 'app', pattern: '$HOME/Applications/Codex.app/Contents/Resources/node', bootstrapOnly: true },
];

// A pattern in shell form: the leading variable quoted, globs left unquoted.
function shellWord(pattern) {
  const match = /^(\$\{[^}]+\}|\$[A-Za-z_]+)(.*)$/.exec(pattern);
  return match ? `"${match[1]}"${match[2]}` : pattern;
}

/**
 * The shell block every entry embeds between its BEGIN/END node-candidates markers. It
 * sets `node_bin` to the first candidate that runs and is 22.12 or newer.
 */
export function shellBlock() {
  const lines = ['# BEGIN node-candidates (generated from assets/app/server/node-candidates.mjs; run `node assets/app/scripts/node-candidates.mjs --write`)'];
  for (const [name, value] of VARIABLES) lines.push(`${name}=${value}`);
  const words = CANDIDATES.map(item => shellWord(item.pattern));
  lines.push('node_bin=');
  lines.push(`for candidate in ${words.join(' \\\n  ')}; do`);
  lines.push('  case "$candidate" in /*) ;; *) continue ;; esac');
  lines.push(`  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' >/dev/null 2>&1; then`);
  lines.push('    node_bin=$candidate; break');
  lines.push('  fi');
  lines.push('done');
  lines.push('# END node-candidates');
  return `${lines.join('\n')}\n`;
}

export const BLOCK_PATTERN = /# BEGIN node-candidates[^\n]*\n[\s\S]*?# END node-candidates\n/;

const versionOf = file => (/(\d+)\.(\d+)\.(\d+)/.exec(file) || []).slice(1).map(Number);
const newerFirst = (a, b) => { const x = versionOf(a); const y = versionOf(b); for (let i = 0; i < 3; i++) if ((y[i] ?? -1) !== (x[i] ?? -1)) return (y[i] ?? -1) - (x[i] ?? -1); return 0; };

async function expandGlob(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const segments = pattern.split('/'); let paths = [segments[0] === '' ? '/' : segments[0]];
  for (const segment of segments.slice(1)) {
    if (!segment.includes('*')) { paths = paths.map(item => path.join(item, segment)); continue; }
    const regex = new RegExp(`^${segment.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
    const next = [];
    for (const directory of paths) {
      let entries = [];
      try { entries = await fs.readdir(directory); } catch { continue; }
      for (const entry of entries) if (regex.test(entry)) next.push(path.join(directory, entry));
    }
    paths = next;
  }
  return paths.sort(newerFirst);
}

async function firstOnPath(env) {
  for (const directory of (env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const file = path.join(directory, 'node');
    try { await fs.access(file, fs.constants.X_OK); return file; } catch { /* next */ }
  }
  return '';
}

/**
 * Candidates in scan order as {file, source}. `bootstrap: true` includes the desktop-app
 * Node; `system: false` leaves out fixed system locations (tests).
 */
export async function nodeCandidates({ env = process.env, home = os.homedir(), stateDir, saved, bootstrap = false, system = true } = {}) {
  const context = { env, home, stateDir, saved, pathNode: await firstOnPath(env) };
  const values = Object.fromEntries(VARIABLES.map(([name, , value]) => [name, value(context)]));
  values.HOME = home;
  const found = [];
  for (const item of CANDIDATES) {
    if ((item.bootstrapOnly && !bootstrap) || (item.system && !system)) continue;
    const expanded = item.pattern === '${SKILLDOCK_NODE_BIN:-}' ? env.SKILLDOCK_NODE_BIN || ''
      : item.pattern.replace(/^\$([A-Za-z_]+)/, (_, name) => values[name] ?? '');
    if (!expanded || !path.isAbsolute(expanded)) continue;
    for (const file of await expandGlob(expanded)) found.push({ file, source: item.source });
  }
  return found;
}

// The saved selection (HLD 3.10): settings/runtime.json, plus settings/node-path for the
// shell entries. Both are SkillDock-only files that 0.10.x never reads.
export const runtimeSettings = stateDir => path.join(stateDir, 'settings/runtime.json');
export const nodePathFile = stateDir => path.join(stateDir, 'settings/node-path');

export async function readSavedNode(stateDir) {
  try {
    const value = JSON.parse(await fs.readFile(runtimeSettings(stateDir), 'utf8'));
    return value?.format === 1 && path.isAbsolute(value.node) && path.isAbsolute(value.npmCli) ? value : null;
  } catch { return null; }
}

export async function writeSavedNode(stateDir, { node, nodeVersion, npmCli, npmVersion, source }) {
  const directory = path.join(stateDir, 'settings');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const write = async (file, text) => {
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    try { await fs.writeFile(temporary, text, { mode: 0o600 }); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
  };
  await write(runtimeSettings(stateDir), `${JSON.stringify({ format: 1, node, nodeVersion, npmCli, npmVersion, source, verifiedAt: new Date().toISOString() }, null, 2)}\n`);
  await write(nodePathFile(stateDir), `${node}\n`);
}
