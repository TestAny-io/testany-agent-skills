// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';

export function validateProjectPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.length > 4096 || /[\x00-\x1f]/.test(value))
    throw Object.assign(new Error('项目目录必须为有效的本机绝对路径。'), { code: 'INVALID_PROJECT', status: 400 });
  return path.resolve(value);
}

export async function projectContext(requested, source, workingDirectory = process.cwd()) {
  requested = validateProjectPath(requested);
  let effective;
  try {
    effective = await fs.realpath(requested);
    if (!(await fs.stat(effective)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw Object.assign(new Error('项目目录不存在、不是目录或不可访问；原扫描目录保持不变。'), { code: 'PROJECT_UNAVAILABLE', status: 422 });
  }
  return { requested, effective, source, workingDirectory,
    warnings: requested === effective ? [] : ['请求目录包含符号链接，扫描使用解析后的真实目录。'] };
}

export async function resolveProject({ projectDir, env = process.env, cwd = process.cwd(), stateDir } = {}) {
  if (projectDir !== undefined) return projectContext(projectDir, 'argument', cwd);
  if (env.SKILLDOCK_PROJECT_DIR) return projectContext(env.SKILLDOCK_PROJECT_DIR, 'environment', cwd);
  if (stateDir) {
    let saved;
    try { saved = JSON.parse(await fs.readFile(path.join(stateDir, 'project.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`保存的项目选择无法读取：${error.message}`); }
    if (saved) return projectContext(saved.path, 'saved', cwd);
  }
  return projectContext(cwd, 'working-directory', cwd);
}

export function parseLaunchArguments(args) {
  const action = args[0] || 'start'; const options = {};
  if (!['start', 'restart', 'status', 'stop', 'doctor', 'cli'].includes(action)) throw new Error('不支持该启动操作。');
  if (action === 'cli') return { action, cliArgs: args.slice(1), options };
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (flag === '--project' && value && !options.projectDir) options.projectDir = validateProjectPath(value);
    else if (flag === '--migrate-from' && value === 'testany-eng' && !options.migrateFrom) options.migrateFrom = value;
    else throw new Error('用法：launch.sh [start|restart|status|stop|doctor] [--project /绝对目录] [--migrate-from testany-eng]');
  }
  return { action, options };
}
