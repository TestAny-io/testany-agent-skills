import fs from 'node:fs';
import path from 'node:path';

export function startupEvidence(root) {
  let startup = null;
  try {
    const file = path.join(root, 'startup.json');
    if (fs.statSync(file).size < 64000) {
      const row = JSON.parse(fs.readFileSync(file, 'utf8'));
      startup = { at: row.at, stages: (row.stages || []).slice(-12).map(({name,state,startedAt,finishedAt,error}) => ({name,state,startedAt,finishedAt,error})) };
    }
  } catch {}
  const desktop = [];
  let fd;
  try {
    fd = fs.openSync(path.join(root, 'launcher.log'), 'r');
    const size = fs.fstatSync(fd).size, length = Math.min(size, 64000), bytes = Buffer.alloc(length);
    fs.readSync(fd, bytes, 0, length, size - length);
    for (const line of bytes.toString('utf8').split('\n')) {
      try {
        const row = JSON.parse(line);
        if (row.phase === 'entry_resolved') desktop.length = 0;
        if (['entry_resolved','codex_window_requested','safari_opened','failed'].includes(row.phase))
          desktop.push({ name: row.phase, at: row.at, error: row.error || row.message || null, pid: row.pid || null });
      } catch {}
    }
  } catch {} finally { if (fd !== undefined) fs.closeSync(fd); }
  return { startup, desktop: desktop.slice(-8) };
}
