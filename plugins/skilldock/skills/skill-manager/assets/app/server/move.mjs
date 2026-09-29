// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exists, fail } from './files.mjs';

// Moving a user's directory must cover every file, including .git metadata.
// Source-import fingerprints intentionally omit .git and normalize links;
// neither behavior is suitable for verifying an exact recovery copy.
async function moveFingerprint(root) {
  const digest = crypto.createHash('sha256');
  async function visit(file, relative, depth = 0) {
    if (depth > 100) fail(422, 'SOURCE_LIMIT', '目录嵌套过深，未移动原内容。');
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) digest.update(JSON.stringify([relative, 'link', await fs.readlink(file)]));
    else if (stat.isDirectory()) {
      digest.update(JSON.stringify([relative, 'directory', stat.mode & 0o777]));
      for (const name of (await fs.readdir(file)).sort()) await visit(path.join(file, name), path.join(relative, name), depth + 1);
    } else if (stat.isFile()) {
      const content = crypto.createHash('sha256');
      for await (const chunk of createReadStream(file)) content.update(chunk);
      digest.update(JSON.stringify([relative, 'file', stat.mode & 0o777, content.digest('hex')]));
    } else fail(422, 'SPECIAL_FILE', `不支持特殊文件：${relative}`);
  }
  await visit(root, '');
  return digest.digest('hex');
}

// Fast atomic rename on one volume. On different volumes, verify a staged
// copy before retiring the original; symlinks stay links, including relative ones.
export async function moveObject(from, to, { guard = async () => {}, rename = fs.rename } = {}) {
  await guard();
  if (await exists(to)) fail(409, 'TARGET_EXISTS', '移动目标已存在，不能覆盖。');
  await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
  try { await rename(from, to); return; }
  catch (error) { if (error.code !== 'EXDEV') throw error; }
  const fingerprint = await moveFingerprint(from);
  const suffix = `.skilldock-move-${crypto.randomUUID()}`;
  const staged = path.join(path.dirname(to), suffix), held = path.join(path.dirname(from), `${suffix}-source`);
  let retired = false, committed = false;
  try {
    await guard();
    await fs.cp(from, staged, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true, force: false, errorOnExist: true });
    if (await moveFingerprint(staged) !== fingerprint || await moveFingerprint(from) !== fingerprint) fail(409, 'SOURCE_CHANGED', '来源在复制期间发生变化，请重新预览。');
    await guard();
    await fs.rename(from, held); retired = true;
    if (await moveFingerprint(held) !== fingerprint) fail(409, 'SOURCE_CHANGED', '来源在复制期间发生变化，请重新预览。');
    await guard();
    if (await exists(to)) fail(409, 'TARGET_EXISTS', '移动目标已存在，不能覆盖。');
    await fs.rename(staged, to); committed = true;
    // The destination is complete. A cleanup failure keeps an extra hidden
    // recovery copy, rather than attempting to restore a partially removed tree.
    try { await guard(); await fs.rm(held, { recursive: true, force: true }); } catch { return { retainedCopy: held }; }
  } catch (error) {
    if (retired && !committed) {
      await guard();
      if (await exists(from)) fail(409, 'TARGET_EXISTS', `原位置已被占用；已保留恢复副本：${held}`);
      await fs.rename(held, from);
    }
    throw error;
  } finally {
    // Never follow a changed parent while cleaning up staging.
    try { await guard(); await fs.rm(staged, { recursive: true, force: true }); } catch { /* Preserve for recovery. */ }
  }
}
