// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';

export async function canonicalPath(value) {
  try { return await fs.realpath(value); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(value);
    return parent === value ? value : path.join(await canonicalPath(parent), path.basename(value));
  }
}

export async function installationIdentity(appDir, codexHome, { expected } = {}) {
  const source = await canonicalPath(path.resolve(appDir));
  const home = await canonicalPath(path.resolve(codexHome));
  const segments = path.relative(path.join(home, 'plugins/cache'), source).split(path.sep);
  const [marketplace, plugin, version, ...tail] = segments;
  const segment = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
  if (segments.length !== 7 || ![marketplace, plugin, version].every(segment)
    || tail.join('/') !== 'skills/skill-manager/assets/app') return { kind: 'directory', source };
  const root = path.join(home, 'plugins/cache', marketplace, plugin, version);
  const identity = { kind: 'plugin', codexHome: home, marketplace, plugin, appPath: tail.join('/') };
  let manifest;
  for (const relative of ['.codex-plugin/plugin.json', 'plugin.json', '.claude-plugin/plugin.json']) {
    const file = path.join(root, relative);
    try {
      if (await fs.realpath(file) !== file) throw new Error('插件 manifest 不能通过链接指向其他位置。');
      manifest = JSON.parse(await fs.readFile(file, 'utf8')); break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Codex may delete the previous cache during reinstall. Its recorded identity
  // is usable only when it still matches every component of the old cache path.
  if (!manifest && expected && sameInstallation(identity, expected)) return identity;
  if (manifest?.name !== plugin || manifest.version !== undefined && String(manifest.version) !== version)
    throw new Error('无法核实 SkillDock 所属插件的安装身份。');
  return identity;
}

export const sameInstallation = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export async function writeRestart(stateDir, value) {
  const file = path.join(stateDir, 'restart.json');
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function readRestart(stateDir) {
  try { return JSON.parse(await fs.readFile(path.join(stateDir, 'restart.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
