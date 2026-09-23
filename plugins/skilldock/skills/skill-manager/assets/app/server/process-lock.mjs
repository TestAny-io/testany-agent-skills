// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fail } from './errors.mjs';

const alive = pid => {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
function inspect(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(409, 'LOCK_INVALID', '更新锁不是普通文件，请检查数据目录。');
    let owner; try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    return { stat, owner, key: `${stat.dev}:${stat.ino}:${owner?.token || ''}` };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function occupied(entry) {
  return entry && (entry.owner?.pid ? alive(entry.owner.pid) : Date.now() - entry.stat.mtimeMs < 60000);
}

// PID liveness, rather than a time lease, prevents a slow/suspended installer
// losing ownership. Reclamation is itself serialized and rechecks the inode.
export function acquireFileLock(file, depth = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = crypto.randomUUID(); let fd;
    try { fd = fs.openSync(file, 'wx', 0o600); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (fd !== undefined) {
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
        const stat = fs.fstatSync(fd); const current = inspect(file);
        if (current?.stat.ino !== stat.ino || current?.owner?.token !== token) fail(409, 'BUSY', '更新锁已变化，请重试。');
      } finally { fs.closeSync(fd); }
      let released = false;
      return () => {
        if (released) return; released = true;
        if (inspect(file)?.owner?.token === token) fs.unlinkSync(file);
      };
    }
    const previous = inspect(file);
    if (!previous) continue;
    if (occupied(previous) || depth > 3) fail(409, 'BUSY', '另一个 SkillDock 进程正在执行操作，请稍后重试。');
    const releaseReaper = acquireFileLock(`${file}.reap`, depth + 1);
    try {
      const current = inspect(file);
      if (current?.key === previous.key && !occupied(current)) fs.unlinkSync(file);
    } finally { releaseReaper(); }
  }
  fail(409, 'BUSY', '另一个 SkillDock 进程正在执行操作，请稍后重试。');
}

export const operationLock = codexHome => path.join(codexHome, '.skilldock-operation.lock');
export const isOperationActive = codexHome => !!occupied(inspect(operationLock(codexHome)));
