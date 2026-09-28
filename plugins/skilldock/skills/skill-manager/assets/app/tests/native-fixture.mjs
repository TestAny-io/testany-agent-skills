// Isolated installed-package fixture: never targets the user's Codex state.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveCodexCli } from '../server/codex-runtime.mjs';
import { findNpm } from '../server/toolchain.mjs';

const execute = promisify(execFile);
export async function installedFixture() {
  const cli = await resolveCodexCli(); if (!cli.available) throw new Error(cli.error);
  const npm = await findNpm(process.execPath); if (!npm) throw new Error('Test requires npm.');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock installed native ')));
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), state = path.join(root, 'state'), project = path.join(home, 'saved project');
  const marketplace = path.join(root, 'marketplace');
  await fs.mkdir(path.join(marketplace, '.agents/plugins'), { recursive: true });
  await fs.mkdir(path.join(codexHome, 'skills/native-sentinel'), { recursive: true });
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(state);
  await fs.writeFile(path.join(state, 'project.json'), JSON.stringify({ path: project }));
  await fs.writeFile(path.join(codexHome, 'skills/native-sentinel/SKILL.md'), '---\nname: native-sentinel\ndescription: Isolated native app acceptance skill\n---\n# Native sentinel\n');
  const plugin = path.join(marketplace, 'plugins/skilldock');
  await fs.cp(fileURLToPath(new URL('../../../../../', import.meta.url)), plugin, { recursive: true,
    filter: file => !file.split(path.sep).some(part => ['node_modules', 'dist', '.source-snapshot', 'test-results', 'playwright-report', 'skilldock-preview'].includes(part)),
  });
  await fs.writeFile(path.join(marketplace, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'native-fixture', plugins: [{
    name: 'skilldock', source: './plugins/skilldock', policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity',
  }] }));
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const env = { HOME: home, CODEX_HOME: codexHome, PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    SKILLDOCK_STATE_DIR: state, SKILLDOCK_NODE_BIN: process.execPath, SKILLDOCK_NPM_CLI: npm.npmCli,
    SKILLDOCK_CODEX_BIN: cli.path, PORT: String(port),
  };
  const run = async args => JSON.parse((await execute(cli.path, args, { env, maxBuffer: 4 * 1024 * 1024 })).stdout);
  await run(['plugin', 'marketplace', 'add', marketplace, '--json']);
  const install = await run(['plugin', 'add', 'skilldock@native-fixture', '--json']);
  const server = (await run(['mcp', 'list', '--json'])).find(item => item.name === 'skilldock');
  if (server?.transport.cwd !== install.installedPath + '/.' || server.transport.args[0] !== './skills/skill-manager/scripts/native.sh') throw new Error('Installed MCP path did not resolve relative to the plugin cache.');
  const skill = path.join(install.installedPath, 'skills/skill-manager');
  const connect = async () => {
    const client = new Client({ name: 'skilldock-installed-test', version: '1' });
    await client.connect(new StdioClientTransport({ command: server.transport.command, args: server.transport.args, cwd: server.transport.cwd, env }));
    return client;
  };
  const stop = async () => execute('/bin/sh', [path.join(skill, 'scripts/launch.sh'), 'stop'], { env, cwd: project, timeout: 20000 });
  return { root, home, codexHome, state, project, skill, env, install, connect, stop,
    cleanup: async () => { await stop(); await fs.rm(root, { recursive: true, force: true }); },
  };
}

export async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 660000 });
  if (result.isError) throw new Error(result._meta?.error || 'Native tool failed');
  return result._meta.response;
}
