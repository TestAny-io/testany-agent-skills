// Real installed MCP + real backend, with isolated HOME and Codex configuration.
import http from 'node:http';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { installedFixture } from './native-fixture.mjs';

const fixture = await installedFixture(); const client = await fixture.connect();
const opener = (await client.listTools()).tools.find(item => item.name === 'open_skilldock');
const html = (await client.readResource({ uri: opener._meta.ui.resourceUri })).contents[0].text;
const script = (await build({ entryPoints: [fileURLToPath(new URL('./native-harness-client.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'chrome120' })).outputFiles[0].text;
const server = http.createServer(async (req, res) => {
  const origin = 'http://127.0.0.1:' + server.address().port;
  if (req.headers.host !== new URL(origin).host || req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return res.writeHead(403).end();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET' && new URL(req.url, origin).pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}aside{height:30px;background:#28392c;color:white;font:12px/30px sans-serif;text-align:center}iframe{border:0;width:100%;height:calc(100vh - 30px);display:block}</style><aside>隔离浏览器测试宿主 · 实际 MCP / 后台 · 不代表 Codex 原生界面 UAT</aside><iframe title="SkillDock"></iframe><script type="module" src="/host.js"></script>');
    } else if (req.method === 'GET' && req.url === '/ui') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; frame-ancestors 'self'");
      res.end(html);
    } else if (req.method === 'GET' && req.url === '/host.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(script); }
    else if (req.method === 'POST' && req.url === '/call') {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) return res.writeHead(413).end(); chunks.push(chunk); }
      const params = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!['skilldock_read', 'skilldock_action', 'skilldock_download'].includes(params.name)) return res.writeHead(403).end();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(await client.callTool(params, undefined, { timeout: 660000 })));
    } else if (req.method === 'POST' && req.url === '/fixture-stop') { await fixture.stop(); res.end('stopped'); }
    else res.writeHead(404).end();
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => server.listen(Number(process.env.SKILLDOCK_NATIVE_HARNESS_PORT || 4778), '127.0.0.1', resolve));
console.log('Isolated native harness at http://127.0.0.1:' + server.address().port);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  server.close(); server.closeAllConnections(); await client.close(); await fixture.cleanup(); process.exit(0);
});
