// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Background registration files in the data directory: their locations,
// the fixed shell entry, and the migration takeover (HLD 3.7 step 2). No app dependencies:
// the launcher imports this before node_modules exist.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installationIdentity } from './installation.mjs';
import { readJsonFile } from './installs.mjs';
import { shellBlock } from './node-candidates.mjs';

const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quote = value => `'${String(value).replace(/'/g, "'\\''")}'`;

async function writeFileAtomic(file, content, mode) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { await fs.writeFile(temporary, content, { mode }); await fs.chmod(temporary, mode); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export const backgroundPaths = (stateDir, home = os.homedir()) => {
  const label = `io.testany.skilldock.update.${crypto.createHash('sha256').update(stateDir).digest('hex').slice(0, 16)}`;
  const root = path.join(stateDir, 'background');
  return { root, label, context: path.join(root, 'context.json'), status: path.join(root, 'status.json'),
    entry: path.join(root, 'entry.mjs'), script: path.join(root, 'run.sh'), disabled: path.join(root, 'disabled.json'),
    plist: path.join(home, 'Library/LaunchAgents', `${label}.plist`) };
};

// The fixed shell entry survives removal of a versioned plugin cache or a desktop app's
// Node binary. It finds Node with the shared candidate list (HLD 3.10), the saved
// selection first; no interactive shell, no stored credentials, never a dialog.
export function runScript(paths, stateDir) {
  return `#!/bin/sh\nset -eu\nexport SKILLDOCK_STATE_DIR=${quote(stateDir)}\n${shellBlock()}if [ -n "$node_bin" ]; then exec "$node_bin" ${quote(paths.entry)} ${quote(paths.context)}; fi\nprintf '%s\\n' 'SkillDock: Node runtime unavailable. Reopen SkillDock to repair background updates.' >&2\nexit 1\n`;
}

/** Whether 0.10.x (or 0.11) left a background registration in this data directory. */
export async function registrationExists(paths) {
  for (const file of [paths.context, paths.entry, paths.script, paths.plist]) if (await fs.lstat(file).then(() => true, () => false)) return true;
  return false;
}

/**
 * HLD 3.7 migration step 2: point an existing registration at 0.11 — context version 2,
 * this runtime's entry and the shell entry — and read every file back. launchd keeps
 * invoking the same run.sh, so the LaunchAgent itself is not touched.
 */
export async function takeOverRegistration({ stateDir, home, codexHome, claudeRoot, projectDir, appRuntime = runtime, source, digest, codexBin, environment = {} }) {
  const paths = backgroundPaths(stateDir, home);
  const previous = await readJsonFile(paths.context).catch(() => null);
  const context = { ...(previous && typeof previous === 'object' ? previous : {}), version: 2, stateDir, home, codexHome,
    claudeRoot: claudeRoot ? { configDir: claudeRoot.configDir, pluginCacheDir: claudeRoot.pluginCacheDir } : null,
    projectDir: projectDir ?? previous?.projectDir ?? home, runtime: appRuntime, source,
    installation: await installationIdentity(source, codexHome), node: process.execPath, digest,
    environment: { ...(previous?.environment || {}), ...environment } };
  if (codexBin) context.codexBin = codexBin;
  await fs.mkdir(paths.root, { recursive: true, mode: 0o700 });
  const files = [[paths.context, `${JSON.stringify(context, null, 2)}\n`, 0o600],
    [paths.entry, await fs.readFile(path.join(appRuntime, 'server/background-entry.mjs'), 'utf8'), 0o600],
    [paths.script, runScript(paths, stateDir), 0o700]];
  for (const [file, content, mode] of files) await writeFileAtomic(file, content, mode);
  for (const [file, content] of files) if (await fs.readFile(file, 'utf8') !== content) throw new Error(`后台注册文件读回不一致：${path.basename(file)}`);
  return context;
}
