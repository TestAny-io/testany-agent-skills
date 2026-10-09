// SPDX-License-Identifier: AGPL-3.0-only
// A structured patch of one entry in a Claude settings file (HLD 3.4, DEC-SDX-006): read the
// bytes and their digest, change only that entry, check the digest again right before
// writing, replace the file atomically from a temporary file in the same directory, and
// return the entry's previous value (the only thing an undo needs; the file may hold
// secrets, so it is never copied whole). A settings file that is a link is written through
// to its target, so the link stays.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fail } from './errors.mjs';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const SAFE_KEY = key => typeof key === 'string' && key.length > 0 && key.length <= 200 && !['__proto__', 'prototype', 'constructor'].includes(key) && !/[\x00-\x1f]/.test(key);

async function readBytes(file) {
  try { return await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Sets `section[key]` to `value` (or removes it when `value` is undefined) in `file`.
 * `beforeCommit` (tests only) runs just before the second digest check.
 * @returns {Promise<{ previous: unknown, created: boolean, file: string }>}
 */
export async function patchClaudeSetting(file, section, key, value, { beforeCommit } = {}) {
  if (!SAFE_KEY(section) || !SAFE_KEY(key)) fail(400, 'INVALID_SETTING', '设置条目的名称无效。');
  // Write through a link to its target; the link itself stays.
  const target = await fs.realpath(file).catch(error => { if (error.code === 'ENOENT') return file; throw error; });
  const original = await readBytes(target);
  let data = {};
  if (original !== null) {
    try { data = JSON.parse(original.toString('utf8')); } catch { fail(422, 'SETTINGS_FORMAT', `设置文件 ${file} 不是有效的 JSON，SkillDock 不会改写它。`); }
    if (!isPlainObject(data)) fail(422, 'SETTINGS_FORMAT', `设置文件 ${file} 的格式未知，SkillDock 不会改写它。`);
  }
  if (data[section] !== undefined && !isPlainObject(data[section])) fail(422, 'SETTINGS_FORMAT', `设置文件 ${file} 中 ${section} 的格式未知，SkillDock 不会改写它。`);
  const entries = { ...(data[section] ?? {}) };
  const previous = Object.hasOwn(entries, key) ? entries[key] : undefined;
  if (value === undefined) delete entries[key]; else entries[key] = value;
  const next = { ...data, [section]: entries };
  if (!Object.keys(entries).length && data[section] === undefined) delete next[section];
  // Keep the file's own indentation and final newline; a new file follows Claude's two spaces.
  const text = original?.toString('utf8') ?? '';
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
  const bytes = Buffer.from(JSON.stringify(next, null, indent) + (original === null || text.endsWith('\n') ? '\n' : ''));
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const mode = original === null ? 0o644 : (await fs.stat(target)).mode & 0o777;
  const temporary = path.join(directory, `.${path.basename(target)}.skilldock-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, bytes, { mode, flag: 'wx' });
  try {
    // Claude may have written in between: the digest read first must still hold.
    await beforeCommit?.();
    const current = await readBytes(target);
    if ((current === null) !== (original === null) || (current && digest(current) !== digest(original)))
      fail(409, 'SNAPSHOT_STALE', `设置文件 ${file} 在读取后被改动，请刷新后重试。`);
    await fs.rename(temporary, target);
  } catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  return { previous, created: original === null, file: target };
}
