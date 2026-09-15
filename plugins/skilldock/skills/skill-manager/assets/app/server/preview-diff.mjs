import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { structuredPatch } from 'diff';
import { fail, hash, inside } from './files.mjs';

const MAX_BYTES = 256 * 1024;
const MAX_LINES = 2000;

async function readText(tree, file) {
  if (!Object.hasOwn(tree.entries, file)) return { text: '', bytes: 0 };
  if (tree.entries[file].startsWith('link:')) return { status: 'symlink' };
  const absolute = path.resolve(tree.realRoot, file);
  if (!inside(tree.realRoot, absolute) || await fs.realpath(absolute) !== absolute)
    fail(409, 'DIFF_CHANGED', '差异文件的路径已变化，请重新检查更新。');
  const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail(409, 'DIFF_CHANGED', '差异文件的类型已变化，请重新检查更新。');
    if (stat.size > MAX_BYTES) return { status: 'too-large' };
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) return { status: 'too-large' };
    const bytes = buffer.subarray(0, bytesRead);
    if (hash(bytes) !== tree.entries[file]) fail(409, 'DIFF_CHANGED', '文件内容在预览后发生变化，请重新检查更新。');
    try {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (/[\x00-\x08\x0e-\x1f]/.test(text)) return { status: 'binary' };
      if (text.split('\n').some(line => line.length > 4000)) return { status: 'too-large' };
      return { text, bytes: bytesRead };
    } catch { return { status: 'binary' }; }
  } finally { await handle.close(); }
}

export async function previewFileDiff(before, after, change) {
  const oldFile = await readText(before, change.path); const newFile = await readText(after, change.path);
  const status = oldFile.status || newFile.status;
  if (status) return { ...change, status, hunks: [], maxBytes: MAX_BYTES };
  const patch = structuredPatch(change.path, change.path, oldFile.text, newFile.text, '', '',
    { context: 3, timeout: 200, maxEditLength: 4000 });
  if (!patch) return { ...change, status: 'too-complex', hunks: [] };
  let remaining = MAX_LINES; let additions = 0; let deletions = 0; let truncated = false;
  const hunks = [];
  for (const hunk of patch.hunks) {
    let oldLine = hunk.oldStart; let newLine = hunk.newStart;
    const lines = [];
    for (const line of hunk.lines) {
      const kind = line[0] === '+' ? 'added' : line[0] === '-' ? 'removed' : line[0] === '\\' ? 'note' : 'context';
      if (kind === 'added') additions++; if (kind === 'removed') deletions++;
      if (remaining-- > 0) lines.push({ kind, content: line.slice(1),
        ...(kind === 'removed' || kind === 'context' ? { oldLine } : {}),
        ...(kind === 'added' || kind === 'context' ? { newLine } : {}) });
      else truncated = true;
      if (kind === 'removed' || kind === 'context') oldLine++;
      if (kind === 'added' || kind === 'context') newLine++;
    }
    if (lines.length) hunks.push({ oldStart: hunk.oldStart, oldLines: hunk.oldLines, newStart: hunk.newStart, newLines: hunk.newLines, lines });
  }
  return { ...change, status: 'text', additions, deletions, truncated, hunks };
}
