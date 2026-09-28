// SPDX-License-Identifier: AGPL-3.0-only
// Bundled to skill-manager/assets/native/server.mjs for dependency-free discovery.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { createNativeBackend } from './native-backend.mjs';

const skillRoot = fileURLToPath(new URL('../../', import.meta.url));
const assets = path.join(skillRoot, 'assets/native');
const pkg = JSON.parse(await fs.readFile(path.join(skillRoot, 'assets/app/package.json'), 'utf8'));
const html = await fs.readFile(path.join(assets, 'ui.html'), 'utf8');
const resourceUri = 'ui://skilldock/main-' + createHash('sha256').update(html).digest('hex').slice(0, 16) + '.html';
const svg = await fs.readFile(path.join(assets, 'icon.svg'));
const icons = [{ src: 'data:image/svg+xml;base64,' + svg.toString('base64'), mimeType: 'image/svg+xml' }];
const server = new McpServer({ name: 'skilldock', title: 'SkillDock', version: pkg.version, icons }, { capabilities: { tools: {}, resources: {} } });
const backend = createNativeBackend({ skillRoot });

registerAppTool(server, 'open_skilldock', {
  title: 'SkillDock', description: 'Open SkillDock to manage local skills, plugins, marketplaces and updates.', inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  _meta: { ui: { resourceUri }, 'openai/ui': { entrypoints: [{ type: 'global' }], preferredModelDisplayMode: 'fullscreen' } },
}, async () => ({ content: [{ type: 'text', text: 'SkillDock is ready to open.' }] }));

function appTool(name, description, inputSchema, handler, destructiveHint = false) {
  registerAppTool(server, name, {
    description, inputSchema,
    annotations: { readOnlyHint: false, destructiveHint, idempotentHint: !destructiveHint, openWorldHint: true },
    _meta: { ui: { visibility: ['app'] } },
  }, async input => {
    try {
      return { content: [{ type: 'text', text: 'SkillDock request completed.' }], _meta: { response: await handler(input) } };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: 'SkillDock request failed.' }], _meta: { error: error.message } };
    }
  });
}
appTool('skilldock_read', 'Read the SkillDock application. Starts its owned local service when necessary.', { route: z.string().max(8192) }, ({ route }) => backend.read(route));
appTool('skilldock_action', 'Perform a user-selected SkillDock action. May install, update, disable or remove local skills, plugins and scheduled tasks.', {
  body: z.record(z.string(), z.unknown()), session: z.string().max(256),
}, ({ body, session }) => backend.action(body, session), true);
appTool('skilldock_download', 'Get a local link to the software license or corresponding source archive.', { name: z.enum(['license', 'source']) }, async ({ name }) => ({ url: await backend.download(name) }));

registerAppResource(server, 'skilldock', resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{
  uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html,
  _meta: { ui: { prefersBorder: false, permissions: { clipboardWrite: {} }, csp: { connectDomains: [], resourceDomains: [] } }, 'openai/ui': { availableDisplayModes: ['fullscreen'] } },
}] }));
await server.connect(new StdioServerTransport());
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
