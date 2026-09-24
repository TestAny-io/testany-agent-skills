// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, readJson } from './files.mjs';
import { projectContext } from './project-context.mjs';
import { runProcess } from './cli.mjs';

const validPath = value => typeof value === 'string' && path.isAbsolute(value) && value.length <= 4096 && !/[\x00-\x1f]/.test(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
// Compatibility reader only. Codex owns this file and its project lifecycle;
// SkillDock never writes it. Prefer the current schema over legacy roots so
// removing a project in Codex does not resurrect it from migration data.
export async function readCodexProjects(codexHome) {
  try {
    const file = path.join(codexHome, '.codex-global-state.json');
    if ((await fs.stat(file)).size > 16 * 1024 * 1024) throw new Error('size');
    const state = JSON.parse(await fs.readFile(file, 'utf8'));
    const entries = [];
    if (Object.hasOwn(state, 'local-projects')) {
      if (!record(state['local-projects'])) throw new Error('schema');
      for (const item of Object.values(state['local-projects']).slice(0, 500)) {
        if (!record(item) || !Array.isArray(item.rootPaths)) continue;
        for (const root of item.rootPaths.slice(0, 30)) if (validPath(root)) entries.push({ path: root, name: typeof item.name === 'string' ? item.name.slice(0, 200) : path.basename(root), source: 'codex' });
      }
    } else if (Array.isArray(state['electron-saved-workspace-roots'])) {
      const labels = state['electron-workspace-root-labels'];
      for (const root of state['electron-saved-workspace-roots'].slice(0, 500)) if (validPath(root)) entries.push({ path: root, name: typeof labels?.[root] === 'string' ? labels[root].slice(0, 200) : path.basename(root), source: 'codex' });
    } else throw new Error('schema');
    return { entries };
  } catch (error) {
    return { entries: [], warning: error.code === 'ENOENT' ? '尚未发现 Codex 保存的本地项目，可以选择本地文件夹。' : '无法读取 Codex 项目列表；仍可选择最近使用的目录或本地文件夹。' };
  }
}

export async function projectCatalog({ codexHome, stateDir, current, integration }) {
  const native = await readCodexProjects(codexHome);
  const saved = await readJson(path.join(stateDir, 'project.json'), {}) || {};
  const recent = [saved.path, ...(Array.isArray(saved.recent) ? saved.recent : [])].filter(validPath).slice(0, 50);
  const entries = []; const seen = new Set();
  const sources = [...native.entries, ...recent.map(directory => ({ path: directory, source: 'recent' })), { path: current, source: 'current' }];
  for (const item of sources) {
    let effective = path.resolve(item.path); let available = false;
    try { effective = await fs.realpath(effective); available = (await fs.stat(effective)).isDirectory(); } catch { /* Keep unavailable entries visible with a reason. */ }
    if (seen.has(effective)) continue;
    seen.add(effective);
    entries.push({ ...item, path: effective, name: item.name || path.basename(effective) || effective, available });
  }
  entries.sort((a, b) => Number(b.path === current) - Number(a.path === current) || a.name.localeCompare(b.name));
  return { entries, warning: native.warning, ...await integration.capabilities() };
}

const folderScript = `on run argv
  try
    set selectedFolder to choose folder with prompt "SkillDock — Choose a project folder" default location (POSIX file (item 1 of argv))
    return POSIX path of selectedFolder
  on error number -128
    return ""
  end try
end run`;

export function createProjectIntegration({ platform = process.platform, run = runProcess } = {}) {
  return {
    async capabilities() { return { canChooseDirectory: platform === 'darwin' }; },
    async choose(directory) {
      if (platform !== 'darwin') fail(422, 'FOLDER_PICKER_UNAVAILABLE', '此系统暂不支持文件夹选择器，请展开手动输入路径。');
      const initial = await projectContext(directory, 'saved');
      const result = await run('/usr/bin/osascript', ['-e', folderScript, initial.effective], { timeout: 120000, maxOutput: 16384 });
      const selected = result.stdout.trim();
      return selected ? (await projectContext(selected, 'saved')).effective : null;
    },
  };
}
