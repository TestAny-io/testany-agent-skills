import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

// A transport-only fixture: no Codex instance, credentials or model calls.
const fixture = `#!/usr/bin/env node
import http from 'node:http';
import { createHash } from 'node:crypto';
if (!process.argv.includes('app-server')) { console.log(JSON.stringify(process.argv.slice(2))); process.exit(0); }
const endpoint = new URL(process.argv[process.argv.indexOf('--listen') + 1]);
const server = http.createServer();
server.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      let n = buffer[1] & 127, start = 2;
      if (n === 126) { if (buffer.length < 4) return; n = buffer.readUInt16BE(2); start = 4; }
      if (n === 127) throw Error('Fixture payload too large');
      const masked = !!(buffer[1] & 128), payloadStart = start + (masked ? 4 : 0);
      if (buffer.length < payloadStart + n) return;
      const opcode = buffer[0] & 15, mask = buffer.subarray(start, payloadStart), payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + n));
      if (masked) for (let i = 0; i < n; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(payloadStart + n);
      if (opcode === 8) { socket.end(); return; }
      if (opcode !== 1) continue;
      const message = JSON.parse(payload.toString());
      const reply = Buffer.from(JSON.stringify({id:message.id,result:{userAgent:'fixture',args:process.argv.slice(2),cliOverride:process.env.CODEX_CLI_PATH || null,forceOverride:process.env.CODEX_APP_SERVER_FORCE_CLI || null}}));
      const header = Buffer.alloc(4); header[0] = 129; header[1] = 126; header.writeUInt16BE(reply.length, 2);
      socket.write(Buffer.concat([header, reply]));
    }
  });
});
server.listen(Number(endpoint.port), endpoint.hostname);
`;
function setup(t, desktop) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-adapter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(new URL('../../../scripts/shared-adapter.mjs', import.meta.url), path.join(root, 'adapter.mjs'));
  const binary = path.join(root, 'fake-cli');
  fs.writeFileSync(binary, '#!' + process.execPath + '\n' + fixture.split('\n').slice(1).join('\n'), {mode:0o700});
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({binary, desktop}));
  return root;
}
test('auxiliary CLI calls pass through without starting an app server', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-pass-'));
  try {
    fs.copyFileSync(new URL('../../../scripts/shared-adapter.mjs', import.meta.url), path.join(root, 'adapter.mjs'));
    const binary = path.join(root, 'fake-cli');
    fs.writeFileSync(binary, '#!' + process.execPath + '\nconsole.log(JSON.stringify(process.argv.slice(2)));\n', {mode:0o700});
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({binary, desktop:'/Applications/Fixture.app/Contents/MacOS/Fixture'}));
    const output = execFileSync(process.execPath, [path.join(root, 'adapter.mjs'), 'app-server', 'generate-json-schema'], {encoding:'utf8'});
    assert.deepEqual(JSON.parse(output), ['app-server', 'generate-json-schema']);
    assert.equal(fs.existsSync(path.join(root, 'state.json')), false);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
test('desktop adapter forwards JSON-RPC, removes recursive overrides, and stops with its parent pipe', {timeout:15000}, async (t) => {
  const desktop = execFileSync('/bin/ps', ['-p', String(process.pid), '-o', 'command='], {encoding:'utf8'}).trim();
  const root = setup(t, desktop);
  const child = spawn(process.execPath, [path.join(root, 'adapter.mjs'), 'app-server', '--stdio', '--listen', 'stdio://'], {
    env:{...process.env, CODEX_CLI_PATH:'/fixture/override', CODEX_APP_SERVER_FORCE_CLI:'1'}, stdio:['pipe','pipe','pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let errors = ''; child.stderr.on('data', (c) => { errors += c; });
  const reply = new Promise((resolve, reject) => {
    let data = '';
    child.stdout.on('data', (c) => { data += c; if (data.includes('\n')) resolve(JSON.parse(data.split('\n')[0])); });
    child.once('exit', (code) => reject(Error('Adapter exited ' + code + ': ' + errors)));
  });
  child.stdin.write(JSON.stringify({id:'desktop-1',method:'initialize'}) + '\n');
  const value = await reply;
  assert.equal(value.id, 'desktop-1');
  assert.equal(value.result.cliOverride, null); assert.equal(value.result.forceOverride, null);
  assert.deepEqual(value.result.args.slice(0, 2), ['app-server', '--listen']);
  assert.match(value.result.args[2], /^ws:\/\/127\.0\.0\.1:\d+$/);
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
  assert.equal(state.state, 'connected'); assert.ok(state.desktopInitializedAt);
  const ended = once(child, 'exit'); child.stdin.end();
  await ended;
  const stopped = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
  assert.equal(stopped.state, 'stopped'); assert.equal(stopped.reason, 'desktop_closed');
  assert.throws(() => process.kill(state.appServerPid, 0), {code:'ESRCH'});
});
