import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load, FAILSAFE_SCHEMA } from '../vendor/js-yaml.mjs';

const cache = new Map();
// Descriptions advertise capability; they are data, never executable instructions.
export function skillCapability(file) {
  const fallback = { path: file, name: path.basename(path.dirname(file)), description: null, sha256: null, status: 'unavailable' };
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('技能文件不可读取或过大');
    const key = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (cache.get(file)?.key === key) return { ...cache.get(file).value };
    const content = fs.readFileSync(file, 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const front = content.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!front || front[1].length > 65536) throw Error('缺少有效的技能 frontmatter');
    const fields = load(front[1], { schema: FAILSAFE_SCHEMA });
    const name = typeof fields?.name === 'string' && fields.name.trim() ? fields.name.trim() : fallback.name;
    const description = typeof fields?.description === 'string' && fields.description.trim() ? fields.description : null;
    const value = { path: file, name, description, sha256, status: description ? 'available' : 'missing_description' };
    if (cache.size > 4096) cache.clear();
    cache.set(file, { key, value });
    return { ...value };
  } catch (error) {
    return { ...fallback, error: String(error.message).slice(0, 200) };
  }
}
export function employeeCapabilities(employee) {
  return { id: employee.id, name: employee.name, role: employee.role, group: employee.group,
    threadId: employee.threadId, bindingVersion: employee.bindingVersion,
    skills: employee.skills.map(skillCapability) };
}
