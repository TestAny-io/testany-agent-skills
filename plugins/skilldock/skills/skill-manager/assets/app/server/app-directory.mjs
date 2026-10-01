// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import { AppError } from './files.mjs';

// Use the app metadata API only. The plugin/* app-server methods are explicitly
// not ready for production clients; installation remains a Codex CLI operation.
export async function withAppDirectory(binary, { env, timeout = 45000 } = {}, operation) {
  const child = spawn(binary, ['app-server', '--stdio'], { env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let sequence = 0, buffer = '', stopped = false;
  const error = message => new AppError(502, 'DIRECTORY_UNAVAILABLE', message);
  function rejectAll(failure) { for (const item of pending.values()) item.reject(failure); pending.clear(); }
  const timer = setTimeout(() => { rejectAll(error('Codex 应用目录读取超时，请稍后重试。')); child.kill('SIGKILL'); }, timeout);
  child.on('error', () => rejectAll(error('无法启动 Codex 应用目录连接。')));
  child.on('exit', () => { stopped = true; rejectAll(error('Codex 应用目录连接已关闭。')); });
  child.stderr.resume();
  child.stdin.on('error', () => rejectAll(error('Codex 应用目录连接已关闭。')));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 32 * 1024 * 1024) { rejectAll(error('Codex 应用目录响应超过限制。')); child.kill('SIGKILL'); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message; try { message = JSON.parse(line); } catch { continue; }
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      if (message.error) item.reject(error('Codex 应用目录暂不可用，请确认已登录并更新 Codex。'));
      else item.resolve(message.result);
    }
  });
  function request(method, params) {
    if (!['initialize', 'app/list', 'app/read'].includes(method)) throw error('不支持该应用目录操作。');
    if (stopped) return Promise.reject(error('Codex 应用目录连接已关闭。'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  try {
    await request('initialize', { clientInfo: { name: 'skilldock-directory', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    return await operation(request);
  } finally {
    clearTimeout(timer); stopped = true;
    rejectAll(error('Codex 应用目录连接已关闭。'));
    child.stdin.end(); child.kill('SIGTERM');
    const kill = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000); kill.unref();
  }
}

export function officialAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.port && !url.username && !url.password
      && /^\/(apps|plugins)\//.test(url.pathname) ? url.href : undefined;
  } catch { return undefined; }
}

export class AppDirectory {
  constructor({ binary, env, request = withAppDirectory, ttl = 10 * 60000 } = {}) {
    Object.assign(this, { binary, env, request, ttl }); this.cached = null; this.expires = 0;
  }
  async list(force = false) {
    if (!force && this.cached && Date.now() < this.expires) return this.cached;
    if (!force && this.failureUntil > Date.now()) throw this.lastError;
    if (this.loading) return this.loading;
    this.loading = this.request(this.binary, { env: this.env }, async request => {
      const apps = [], cursors = new Set(); let cursor;
      do {
        const result = await request('app/list', { limit: 500, ...(cursor ? { cursor } : {}), forceRefetch: force && !cursor });
        if (!Array.isArray(result?.data)) throw new Error('Codex 应用目录格式不受支持。');
        apps.push(...result.data);
        cursor = result.nextCursor;
        if (cursor && (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 100)) throw new Error('Codex 应用目录分页无效。');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const map = new Map();
      for (const app of apps) if (typeof app.id === 'string' && typeof app.name === 'string') map.set(`plugin_${app.id}`, app);
      this.cached = map; this.expires = Date.now() + this.ttl; this.failureUntil = 0; return map;
    }).catch(error => { this.lastError = error; this.failureUntil = Date.now() + 60000; throw error; }).finally(() => { this.loading = null; });
    return this.loading;
  }
  async read(appId) {
    return this.request(this.binary, { env: this.env }, async request => {
      const result = await request('app/read', { appIds: [appId], includeTools: false });
      const app = result?.apps?.find(item => item.id === appId);
      if (!app || typeof app.name !== 'string') throw new AppError(502, 'DIRECTORY_UNAVAILABLE', '无法读取这个插件的官方介绍，请刷新后重试。');
      return app;
    });
  }
}
