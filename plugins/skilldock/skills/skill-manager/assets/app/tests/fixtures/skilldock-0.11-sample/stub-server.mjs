// SPDX-License-Identifier: AGPL-3.0-only
// Minimal 0.11.x service sample: only the health fields frozen by API-SDX-001 36c §4,
// plus the session and state routes a 0.10.x native UI reads through its proxy.
import http from 'node:http';
import crypto from 'node:crypto';

const instanceId = crypto.randomUUID();
const project = process.env.STUB_PROJECT;
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api/health') return response.end(JSON.stringify({
    app: 'skilldock', pid: process.pid, instanceId, state: process.env.STUB_STATE, sourceDigest: process.env.STUB_DIGEST,
    project, launchProject: project, projectContext: null, restart: null,
    appVersion: process.env.STUB_VERSION, apiVersion: 2, dataGeneration: 2, minimumCompatibleGeneration: 2, installations: [],
  }));
  if (url.pathname === '/api/session') return response.end(JSON.stringify({ token: 'stub-token', defaultMode: 'local' }));
  if (url.pathname === '/api/state') return response.end(JSON.stringify({ mode: 'local', skills: [], plugins: [], marketplaces: [], activity: [], diagnostics: [] }));
  response.statusCode = 404; response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'stub' } }));
});
server.listen(Number(process.env.PORT), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
