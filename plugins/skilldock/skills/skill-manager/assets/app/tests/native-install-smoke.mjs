import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installedFixture, call } from './native-fixture.mjs';

const fixture = await installedFixture();
let client;
try {
  client = await fixture.connect();
  assert.equal(client.getServerVersion().version, fixture.install.version);
  const tools = await client.listTools();
  const open = tools.tools.find(item => item.name === 'open_skilldock');
  await client.readResource({ uri: open._meta.ui.resourceUri });
  await assert.rejects(fs.stat(path.join(fixture.state, 'launcher.json')), { code: 'ENOENT' });
  console.log('PASS: isolated CLI install, relocatable MCP discovery, UI resource; backend not started by discovery.');
  const began = Date.now();
  const first = await call(client, 'skilldock_read', { route: '/api/session' });
  const health = await call(client, 'skilldock_read', { route: '/api/health' });
  assert.equal(health.data.project, fixture.project);
  const snapshot = await call(client, 'skilldock_read', { route: '/api/state?mode=local' });
  const skill = snapshot.data.skills.find(item => item.name === 'native-sentinel'); assert.ok(skill);
  const action = { mode: 'local', action: 'tags.set', target: { kind: 'skill', id: skill.id }, tags: ['native-verified'] };
  assert.equal((await call(client, 'skilldock_action', { session: first.data.token, body: action })).status, 200);
  assert.deepEqual((await call(client, 'skilldock_read', { route: '/api/state?mode=local' })).data.skills.find(item => item.id === skill.id).tags, ['native-verified']);
  console.log('PASS: cold launcher prepared runtime, saved project preserved, real skill tag write/readback (' + Math.round((Date.now() - began) / 1000) + 's).');
  await fixture.stop();
  const next = await call(client, 'skilldock_read', { route: '/api/session' });
  assert.notEqual(next.data.token, first.data.token);
  assert.equal((await call(client, 'skilldock_action', { session: first.data.token, body: action })).status, 409);
  assert.deepEqual((await call(client, 'skilldock_read', { route: '/api/state?mode=local' })).data.skills.find(item => item.id === skill.id).tags, ['native-verified']);
  console.log('PASS: backend stopped, automatically restarted on use, stale writes rejected, data preserved.');
  await client.close(); client = await fixture.connect();
  const reopened = await call(client, 'skilldock_read', { route: '/api/health' });
  assert.equal(reopened.data.instanceId, next.data.token);
  console.log('PASS: independent MCP restart reused the owned backend. Version ' + fixture.install.version);
} finally { await client?.close(); await fixture.cleanup(); }
