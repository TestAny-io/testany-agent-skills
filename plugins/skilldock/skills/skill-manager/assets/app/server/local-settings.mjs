// SPDX-License-Identifier: AGPL-3.0-only
// A project's `.claude/settings.local.json` is personal (HLD 3.4). When SkillDock, or the
// Claude command line it runs (which does not add the file to Git's ignore rules), creates
// it inside a Git repository that does not ignore it, the user decides whether the
// repository's own `.git/info/exclude` names it. The tracked `.gitignore` is never changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './cli.mjs';

const gitEnvironment = () => {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(key)) delete env[key];
  return env;
};
export const defaultGit = (directory, args) => runProcess('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], { env: gitEnvironment(), timeout: 5000 }).then(result => result.stdout.trim());

/**
 * When writing the project's local settings would create the file inside a Git repository
 * that does not ignore it: `{ file, repoRoot, relative }`; otherwise null.
 */
export async function localSettingsExposure(projectDir, { git = defaultGit } = {}) {
  const file = path.join(projectDir, '.claude/settings.local.json');
  if (await fs.lstat(file).then(() => true, () => false)) return null;
  let repoRoot;
  try { repoRoot = await git(projectDir, ['rev-parse', '--show-toplevel']); } catch { return null; }
  if (!repoRoot) return null;
  const real = await fs.realpath(projectDir).catch(() => projectDir);
  const relative = path.relative(repoRoot, path.join(real, '.claude/settings.local.json'));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  // check-ignore exits 0 when the path is ignored, 1 when it is not.
  const ignored = await git(repoRoot, ['check-ignore', '-q', '--', relative]).then(() => true, () => false);
  return ignored ? null : { file, repoRoot, relative };
}

/** Names the file in the repository's own exclude list (idempotent). */
export async function excludeLocalSettings(exposure, { git = defaultGit } = {}) {
  const exclude = path.resolve(exposure.repoRoot, await git(exposure.repoRoot, ['rev-parse', '--git-path', 'info/exclude']));
  const line = `/${exposure.relative.split(path.sep).join('/')}`;
  const current = await fs.readFile(exclude, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  if (current.split(/\r?\n/).includes(line)) return exclude;
  await fs.mkdir(path.dirname(exclude), { recursive: true });
  await fs.appendFile(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
  return exclude;
}
