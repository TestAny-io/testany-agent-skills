// Manual browser fixture. Everything lives in a temporary directory;
// nativeConnection:false prevents any Codex connection or model execution.
// Start with node tests/fixtures/employee-form.mjs; stop with Ctrl-C.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../../src/server.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-form-ui-'));
const nativeHome = path.join(root, 'fixture-codex');
fs.mkdirSync(nativeHome);
const db = new DatabaseSync(path.join(nativeHome, 'state_1.sqlite'));
db.exec('CREATE TABLE threads (id TEXT, name TEXT, cwd TEXT, rollout_path TEXT, archived INTEGER, updated_at INTEGER)');
for (const [id, directory] of [
  ['10000000-0000-4000-8000-000000000001', 'alpha'],
  ['20000000-0000-4000-8000-000000000002', 'beta'],
]) {
  const cwd = path.join(root, directory);
  fs.mkdirSync(cwd);
  const rollout = path.join(cwd, 'empty.jsonl');
  fs.writeFileSync(rollout, '');
  db.prepare('INSERT INTO threads VALUES (?,?,?,?,0,?)').run(id, '界面测试会话', cwd, rollout, Math.floor(Date.now() / 1000));
}
db.close();
for (const name of ['fixture-review', 'fixture-write', 'fixture-observe']) {
  const dir = path.join(nativeHome, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Isolated UI fixture only.\n---\n`);
}
const app = createApp({ root, home: nativeHome, port: 0, nativeConnection: false });
const address = await app.listen();
console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}/#employees`, dataDirectory: root, nativeConnection: false }));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  app.server.closeAllConnections();
  app.close(() => {
    setImmediate(() => { fs.rmSync(root, { recursive: true, force: true }); process.exit(0); });
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
