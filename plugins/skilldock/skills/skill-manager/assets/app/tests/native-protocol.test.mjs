import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('distributed native artifacts match their build inputs and hashes', async () => {
  const app = fileURLToPath(new URL('../', import.meta.url));
  const root = path.resolve(app, '../native');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'build.json'), 'utf8'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [name, expected] of Object.entries(manifest.inputs)) assert.equal(sha(await fs.readFile(path.resolve(app, name))), expected, 'Run npm run build:native after editing ' + name);
  for (const [name, expected] of Object.entries(manifest.artifacts)) assert.equal(sha(await fs.readFile(path.join(root, name))), expected, 'Native artifact changed: ' + name);
});

test('distributed MCP starts without app dependencies or a backend; entry/UI/tools have bounded metadata', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock packaged '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const skill = path.join(root, 'different path/skills/skill-manager');
  await fs.mkdir(path.join(skill, 'assets/app'), { recursive: true });
  await fs.mkdir(path.join(skill, 'scripts'));
  await fs.cp(fileURLToPath(new URL('../../native', import.meta.url)), path.join(skill, 'assets/native'), { recursive: true });
  await fs.copyFile(fileURLToPath(new URL('../package.json', import.meta.url)), path.join(skill, 'assets/app/package.json'));
  await fs.copyFile(fileURLToPath(new URL('../../../scripts/native.sh', import.meta.url)), path.join(skill, 'scripts/native.sh'));
  const transport = new StdioClientTransport({ command: '/bin/sh', args: [path.join(skill, 'scripts/native.sh')], env: {
    HOME: root, PATH: '/usr/bin:/bin', CODEX_HOME: path.join(root, 'codex'), SKILLDOCK_NODE_BIN: process.execPath, SKILLDOCK_STATE_DIR: path.join(root, 'state'),
  } });
  const client = new Client({ name: 'skilldock-test', version: '1' });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'skilldock');
    const { tools } = await client.listTools();
    const open = tools.find(item => item.name === 'open_skilldock');
    assert.equal(client.getServerVersion().icons[0].mimeType, 'image/svg+xml');
    assert.ok(client.getServerVersion().icons[0].src.startsWith('data:image/svg+xml;base64,'));
    assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }]);
    for (const tool of tools.filter(item => item.name !== 'open_skilldock')) assert.deepEqual(tool._meta.ui.visibility, ['app']);
    assert.equal(tools.find(item => item.name === 'skilldock_action').annotations.destructiveHint, true);
    const resource = (await client.readResource({ uri: open._meta.ui.resourceUri })).contents[0];
    assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.deepEqual(resource._meta.ui.permissions, { clipboardWrite: {} });
    assert.ok(resource.text.includes('data-skilldock-host="mcp"'));
    assert.ok(!resource.text.includes('/Users/kailaichen'));
    for (const match of resource.text.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
    await assert.rejects(fs.stat(path.join(root, 'state')), { code: 'ENOENT' });
    const denied = await client.callTool({ name: 'skilldock_read', arguments: { route: 'https://evil.invalid' } });
    assert.equal(denied.isError, true);
    await assert.rejects(fs.stat(path.join(root, 'state')), { code: 'ENOENT' });
  } finally { await client.close(); }
});
