// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { captureDirectoryRoot, exists, fail, inside, verifyDirectoryRoot, verifyDescendantDirectory } from './files.mjs';
import { pluginCacheRoot } from './cache-paths.mjs';
export { pluginCacheRoot, pluginPath } from './cache-paths.mjs';

// Keep the configured path for Codex and resolve its real location separately.
// A cache-root link is a supported location, not permission to follow links
// from individual packages into unrelated directories.
export async function verifyPluginPath(environment, directory) {
  await verifyDirectoryRoot(environment.codexBoundary);
  await verifyDescendantDirectory(environment.cacheBoundary, directory);
  if (environment.mode === 'sandbox' && !inside(environment.root, environment.cacheBoundary.real)) fail(403, 'SANDBOX_BOUNDARY', '插件缓存越出演练范围。');
}

export async function rootsFor(environment) {
  const roots = [
    { directory: path.join(environment.codexHome, 'skills'), scope: 'user', label: '个人技能' },
    { directory: path.join(environment.home, '.agents/skills'), scope: 'user', label: '个人 · .agents' },
  ];
  // A .git file is a worktree/submodule boundary too. Without a repository,
  // only the selected directory is project-scoped; never scan arbitrary parents.
  const ancestors = [];
  let current = environment.project;
  while (current) {
    ancestors.push(current);
    if (await exists(path.join(current, '.git'))) break;
    const parent = path.dirname(current);
    if (current === parent) { ancestors.splice(1); break; }
    current = parent;
  }
  for (const directory of ancestors) {
    if (directory === environment.home) continue; // Personal roots are already listed above.
    roots.push({ directory: path.join(directory, '.agents/skills'), scope: 'project', label: '当前项目' });
    roots.push({ directory: path.join(directory, '.codex/skills'), scope: 'project', label: '当前项目 · .codex' });
  }
  if (environment.mode === 'local') roots.push({ directory: '/etc/codex/skills', scope: 'system', label: '系统技能' });
  return roots.filter((root, i, all) => all.findIndex(other => other.directory === root.directory) === i);
}

export async function protectedRoots(environment) {
  return Promise.all([path.join(environment.codexHome, 'skills/.system'), path.join(environment.codexHome, 'plugins'), pluginCacheRoot(environment.codexHome), '/etc/codex/skills']
    .map(async directory => { try { return await fs.realpath(directory); } catch { return directory; } }));
}

export async function skillLocation(boundary, directory, pins) {
  await verifyDirectoryRoot(boundary);
  if (!inside(boundary.directory, directory)) fail(403, 'ROOT_BOUNDARY', '技能不属于启动时确认的受管根。');
  const links = []; let cursor = boundary.directory;
  for (const segment of path.relative(cursor, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = await fs.lstat(cursor);
    if (stat.isSymbolicLink()) links.push({ path: cursor, target: await fs.readlink(cursor), dev: String(stat.dev), ino: String(stat.ino) });
  }
  const actual = await captureDirectoryRoot(directory);
  const location = { real: actual.real, dev: actual.anchorDev, ino: actual.anchorIno, links };
  const previous = pins?.get(directory);
  if (previous && JSON.stringify(previous) !== JSON.stringify(location)) fail(409, 'SKILL_LINK_CHANGED', '技能链接或其目标在运行中发生变化，请重新打开 SkillDock 后核实。');
  if (links.length) pins?.set(directory, location);
  const directLink = links.at(-1)?.path === directory;
  return { ...location, isLink: links.length > 0, directLink };
}
