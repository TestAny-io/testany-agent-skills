import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse as parseYaml } from 'yaml';

export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const identity = value => hash(path.resolve(value)).slice(0, 24);
export const exists = async value => { try { await fs.lstat(value); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export const inside = (root, value) => { const rel = path.relative(path.resolve(root), path.resolve(value)); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
export const now = () => new Date().toISOString();
export const safeName = value => typeof value === 'string' && /^[a-z0-9]+(?:[a-z0-9._-]*[a-z0-9])?$/.test(value) && value.length <= 100 && value !== '.' && value !== '..';
export const safeSegment = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);

export async function captureDirectoryRoot(directory) {
  const absolute = path.resolve(directory); let anchor = absolute; const missing = [];
  while (!(await exists(anchor))) { missing.unshift(path.basename(anchor)); const parent = path.dirname(anchor); if (parent === anchor) fail(403, 'ROOT_BOUNDARY', '无法解析目录根。'); anchor = parent; }
  const anchorReal = await fs.realpath(anchor); const stat = await fs.stat(anchor);
  if (!stat.isDirectory()) fail(403, 'ROOT_BOUNDARY', '受管根或父路径不是目录。');
  return { directory: absolute, real: path.join(anchorReal, ...missing), anchor, anchorReal, anchorDev: String(stat.dev), anchorIno: String(stat.ino), existed: missing.length === 0 };
}
export async function verifyDirectoryRoot(boundary) {
  let real, stat;
  try { real = await fs.realpath(boundary.anchor); stat = await fs.stat(boundary.anchor); }
  catch { fail(409, 'ROOT_BOUNDARY', '受管根的原父目录已不存在，请重启后重新核实。'); }
  if (real !== boundary.anchorReal || String(stat.dev) !== boundary.anchorDev || String(stat.ino) !== boundary.anchorIno) fail(409, 'ROOT_BOUNDARY', '受管根的路径或目录身份已变化，已停止操作。');
  if ((await captureDirectoryRoot(boundary.directory)).real !== boundary.real) fail(409, 'ROOT_BOUNDARY', '受管根或其最近父目录被替换为其他位置的链接，已停止操作。');
  return boundary.real;
}
export async function verifyDescendantDirectory(boundary, directory) {
  await verifyDirectoryRoot(boundary);
  if (!inside(boundary.directory, directory)) fail(403, 'ROOT_BOUNDARY', '目录不在受管理范围。');
  const expected = path.resolve(boundary.real, path.relative(boundary.directory, directory));
  const current = await captureDirectoryRoot(directory);
  if (current.real !== expected) fail(403, 'ROOT_BOUNDARY', '目录或最近已存在父目录的链接越出原位置，尚未创建任何内容。');
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return structuredClone(fallback); throw new AppError(422, 'INVALID_STATE', `无法读取状态文件 ${file}：${e.message}`); }
}
export async function atomicWrite(file, content, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.skilldock-${crypto.randomUUID()}`;
  try { await fs.writeFile(temp, content, { mode, flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
export const writeJson = (file, value) => atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);

export async function metadata(directory) {
  const entry = path.join(directory, 'SKILL.md');
  const stat = await fs.stat(entry);
  if (stat.size > 2 * 1024 * 1024) fail(422, 'SKILL_TOO_LARGE', 'SKILL.md 超过 2 MB。');
  const content = await fs.readFile(entry, 'utf8');
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) fail(422, 'INVALID_SKILL', 'SKILL.md 需要 YAML frontmatter（name 和 description）。');
  let data;
  try { data = parseYaml(match[1], { uniqueKeys: true, maxAliasCount: 20 }); }
  catch { fail(422, 'INVALID_SKILL', 'SKILL.md 的 YAML 无法安全解析。'); }
  if (!data || typeof data.name !== 'string' || !data.name.trim() || typeof data.description !== 'string' || !data.description.trim()) fail(422, 'INVALID_SKILL', 'SKILL.md 必须包含非空的 name 和 description。');
  return { name: data.name.trim().slice(0, 200), description: data.description.trim().slice(0, 4000), content, updatedAt: stat.mtime.toISOString() };
}

// Imports are data only. Never execute scripts, follow external links or copy device files.
export async function inspectTree(root) {
  const realRoot = await fs.realpath(root);
  if (!(await fs.stat(realRoot)).isDirectory()) fail(422, 'INVALID_SOURCE', '来源必须是技能目录。');
  const entries = {}; let bytes = 0; let count = 0;
  async function walk(directory, prefix = '', depth = 0) {
    if (depth > 20) fail(422, 'SOURCE_LIMIT', '技能目录嵌套超过 20 层。');
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name === '.git') continue;
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const file = path.join(directory, item.name); const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) {
        let real;
        try { real = await fs.realpath(file); } catch { fail(422, 'BROKEN_LINK', `来源含悬空链接：${relative}`); }
        if (!inside(realRoot, real)) fail(422, 'OUTSIDE_SOURCE', `来源链接越出技能目录：${relative}`);
        entries[relative] = `link:${path.relative(path.dirname(file), real).split(path.sep).join('/')}`; count += 1;
      } else if (stat.isDirectory()) await walk(file, relative, depth + 1);
      else if (stat.isFile()) { bytes += stat.size; count += 1; if (bytes > 32 * 1024 * 1024) fail(422, 'SOURCE_LIMIT', '技能内容超过 32 MB。'); entries[relative] = hash(await fs.readFile(file)); }
      else fail(422, 'SPECIAL_FILE', `不支持特殊文件：${relative}`);
      if (count > 3000) fail(422, 'SOURCE_LIMIT', '技能内容超过 3000 个文件或链接。');
    }
  }
  await walk(realRoot);
  return { fingerprint: hash(JSON.stringify(entries)), entries, files: count, bytes, realRoot };
}

export async function copySkill(source, destination) {
  const tree = await inspectTree(source);
  await fs.cp(tree.realRoot, destination, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false, filter: file => path.basename(file) !== '.git' });
  for (const [relative, value] of Object.entries(tree.entries)) {
    if (!value.startsWith('link:')) continue;
    const file = path.join(destination, relative);
    await fs.unlink(file); await fs.symlink(value.slice(5), file);
  }
  if ((await inspectTree(destination)).fingerprint !== tree.fingerprint) fail(409, 'SOURCE_CHANGED', '来源在复制期间发生变化，请重新预览。');
  return tree;
}

export async function objectFingerprint(directory) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) return `link:${await fs.readlink(directory)}`;
  return (await inspectTree(directory)).fingerprint;
}
export function diffFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(file => before[file] === after[file] ? [] : [{ path: file, type: !(file in before) ? 'added' : !(file in after) ? 'removed' : 'modified' }]);
}
export function redact(message) {
  return String(message).replace(/((?:https?|ssh):\/\/)[^\s/]+@/gi, '$1[redacted]@').replace(/((?:token|password|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]').slice(0, 3000);
}
export function publicSource(source) {
  if (typeof source !== 'string') return '';
  try { const url = new URL(source); if (['https:', 'http:', 'ssh:'].includes(url.protocol)) { url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); } } catch { /* Local paths and scp-style Git URLs are ordinary labels. */ }
  return redact(source);
}
