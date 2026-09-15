import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createService } from './service.mjs';
import { AppError, fail, inside, redact } from './files.mjs';
import { createSelfUpdater } from './self-update.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
export async function createApp(options = {}) {
  let updater;
  const service = await createService({ ...options, onInstallationChange: () => { updater?.request(); options.onInstallationChange?.(); } });
  const token = crypto.randomBytes(32).toString('hex'); const instanceId = crypto.randomUUID();
  updater = createSelfUpdater({ service, codexHome: service.environments.local.codexHome, startTimer: options.selfUpdate !== false });
  const dist = path.resolve(options.distDir || path.join(currentDirectory, '../dist'));
  function send(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data));
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const port = server.address()?.port; const host = request.headers.host;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) fail(403, 'HOST_REJECTED', '仅允许本机服务地址。');
      if (request.headers.origin && request.headers.origin !== `http://${host}`) fail(403, 'ORIGIN_REJECTED', '拒绝跨来源访问。');
      if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'CROSS_SITE', '拒绝跨站请求。');
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { app: 'skilldock', pid: process.pid, project: service.project, launchProject: service.launchProject, projectContext: service.projectContext, state: service.stateDir, instanceId, sourceDigest: process.env.SKILLDOCK_SOURCE_DIGEST, restart: await updater.status() });
      if (['GET', 'HEAD'].includes(request.method) && ['/api/license', '/api/source'].includes(url.pathname)) {
        const filename = url.pathname === '/api/license' ? 'LICENSE.txt' : 'skilldock-source.tar.gz';
        const file = path.join(dist, filename); let real;
        try { real = await fs.realpath(file); } catch { fail(404, 'DOWNLOAD_MISSING', '下载文件尚未构建，请重新构建应用。'); }
        if (!inside(await fs.realpath(dist), real)) fail(403, 'PATH_REJECTED', '下载资源链接越界。');
        response.writeHead(200, { 'Content-Type': filename.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/gzip', 'Content-Disposition': `attachment; filename="${filename}"` });
        return response.end(request.method === 'HEAD' ? undefined : await fs.readFile(file));
      }
      if (request.method === 'GET' && url.pathname === '/api/session') return send(response, 200, { token, defaultMode: service.defaultMode });
      if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, await service.snapshot(url.searchParams.get('mode') || 'local', url.searchParams.get('refresh') === 'true'));
      if (request.method === 'GET' && url.pathname === '/api/updates/progress') return send(response, 200, { progress: service.updateProgress(url.searchParams.get('mode') || 'local') });
      if (request.method === 'GET' && url.pathname === '/api/skill') return send(response, 200, await service.skill(url.searchParams.get('mode') || 'local', url.searchParams.get('id')));
      if (request.method === 'POST' && url.pathname === '/api/actions') {
        const supplied = request.headers['x-skilldock-token'];
        if (typeof supplied !== 'string' || supplied.length !== token.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) fail(403, 'TOKEN_REJECTED', '请求凭证已失效，请刷新页面。');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) fail(415, 'CONTENT_TYPE', '操作需要 application/json。');
        let length = 0; const chunks = [];
        for await (const chunk of request) { length += chunk.length; if (length > 32768) fail(413, 'BODY_TOO_LARGE', '请求内容超过限制。'); chunks.push(chunk); }
        let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'INVALID_JSON', '请求不是有效 JSON。'); }
        return send(response, 200, await service.action(data));
      }
      if (url.pathname.startsWith('/api/')) fail(404, 'NOT_FOUND', 'API 不存在。');
      if (request.method !== 'GET' && request.method !== 'HEAD') fail(405, 'METHOD', '不支持该请求方法。');
      let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { fail(400, 'INVALID_PATH', '路径编码无效。'); }
      if (pathname.includes('\0') || pathname.includes('\\')) fail(400, 'INVALID_PATH', '路径无效。');
      let file = path.resolve(dist, `.${pathname}`);
      if (!inside(dist, file)) fail(403, 'PATH_REJECTED', '路径越界。');
      try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); await fs.access(file); }
      catch { if (path.extname(pathname)) fail(404, 'NOT_FOUND', '资源不存在。'); file = path.join(dist, 'index.html'); }
      let real;
      try { real = await fs.realpath(file); } catch { fail(503, 'BUILD_MISSING', '前端尚未构建，请在 app 目录执行 npm run build。'); }
      if (!inside(await fs.realpath(dist), real)) fail(403, 'PATH_REJECTED', '资源链接越界。');
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : await fs.readFile(file));
    } catch (e) {
      if (!response.headersSent) send(response, e instanceof AppError ? e.status : 500, { error: { code: e.code && e instanceof AppError ? e.code : 'INTERNAL_ERROR', message: redact(e.message || '操作失败。') } });
      else response.end();
    }
  });
  server.requestTimeout = 60000; server.headersTimeout = 10000;
  return { server, token, service, updater, close: async () => { await updater.close(); await service.close(); await new Promise((resolve, reject) => { if (!server.listening) return resolve(); server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp(); const port = Number(process.env.PORT || 4771);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  app.server.listen(port, '127.0.0.1', () => process.stdout.write(`SkillDock ready at http://127.0.0.1:${port}\n`));
  app.server.on('error', error => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
