// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { AppError } from './files.mjs';
import { writeAtomic } from './generation.mjs';

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

// What SkillDock uses of an app, and so all that is kept of one: in memory and in the saved file alike.
const text = value => typeof value === 'string' ? value : undefined;
function kept(app) {
  return { id: app.id, name: app.name, description: text(app.description), installUrl: text(app.installUrl), isAccessible: app.isAccessible === true,
    pluginDisplayNames: Array.isArray(app.pluginDisplayNames) ? app.pluginDisplayNames.filter(value => typeof value === 'string') : undefined,
    iconAssets: { '256_square': text(app.iconAssets?.['256_square']), '256_circle': text(app.iconAssets?.['256_circle']) }, logoUrl: text(app.logoUrl),
    iconDarkAssets: { '256_square': text(app.iconDarkAssets?.['256_square']) }, logoUrlDark: text(app.logoUrlDark) };
}
function directoryOf(apps) {
  const map = new Map();
  for (const app of apps) if (typeof app?.id === 'string' && typeof app.name === 'string') map.set(`plugin_${app.id}`, kept(app));
  return map;
}

const SAVED_FORMAT = 1, SAVED_LIMIT = 8 * 1024 * 1024;
/**
 * The last app directory read, kept in a file between runs of the service (HLD 7.1). It is what was read
 * for this Codex home, and nothing Codex or 0.10.x reads. `writable`: asked before each write.
 */
export function savedDirectory(file, { codexHome, writable = async () => true } = {}) {
  return {
    async read() {
      try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.size > SAVED_LIMIT) return null;
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        return saved?.format === SAVED_FORMAT && saved.codexHome === codexHome && Number.isFinite(saved.readAt) && Array.isArray(saved.apps) ? { readAt: saved.readAt, apps: saved.apps } : null;
      } catch { return null; }
    },
    async write({ readAt, apps }) {
      if (!await writable()) return;
      const content = `${JSON.stringify({ format: SAVED_FORMAT, codexHome, readAt, apps })}\n`;
      if (Buffer.byteLength(content) <= SAVED_LIMIT) await writeAtomic(file, content);
    },
  };
}

export class AppDirectory {
  /** `saved`: where the last read is kept between runs (savedDirectory); `maxAge`: how old a read may be and still be served while the next is read. */
  constructor({ binary, env, request = withAppDirectory, ttl = 10 * 60000, maxAge = 7 * 24 * 3600000, now = Date.now, saved } = {}) {
    Object.assign(this, { binary, env, request, ttl, maxAge, now, saved }); this.cached = null; this.expires = 0; this.readAt = 0; this.failed = false;
  }
  /** `stale: false`: an expired list will not do (what is said to the user depends on it); the read is waited for, as before 0.11.2. */
  async list(force = false, { stale = true } = {}) {
    if (!force) await this.restore();
    if (!force && this.cached && this.now() < this.expires) return this.cached;
    if (!force && this.failureUntil > this.now()) throw this.lastError;
    // Reading the list takes 20 to 30 s on a real machine, and every snapshot waited for it once the
    // ten minutes were over (HLD 9.3 V26). Once read, an expired list is served while the next one is
    // read behind it; the last read of an earlier run of the service counts (0.11.3), so only a first
    // read ever, or one after a week without any, waits. A read that fails ends that until one
    // succeeds: the failure shows as it did.
    if (!force && stale && this.cached && !this.failed && this.now() - this.readAt < this.maxAge) { this.load(false).catch(() => {}); return this.cached; }
    return this.load(force);
  }
  // Takes up the saved read, once, where this run has read nothing yet. One dated after now is not believed.
  restore() {
    return this.restoring ||= (async () => {
      const saved = this.cached ? null : await this.saved?.read();
      if (!saved || this.cached || saved.readAt > this.now()) return;
      this.cached = directoryOf(saved.apps); this.readAt = saved.readAt; this.expires = saved.readAt + this.ttl;
    })();
  }
  load(force) {
    // A forced read does not ride on one under way that was not forced, now that one is under way
    // whenever the list has expired: it follows it, so what it returns was asked for anew (77 C13-P3-01).
    if (this.loading) return force && !this.forced ? this.loading.catch(() => {}).then(() => this.load(true)) : this.loading;
    this.forced = force;
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
      const map = directoryOf(apps);
      this.cached = map; this.readAt = this.now(); this.expires = this.readAt + this.ttl; this.failureUntil = 0; this.failed = false; return map;
    }).then(async map => {
      // Kept for the next run. Not being able to keep it is no failure of the read.
      await this.saved?.write({ readAt: this.readAt, apps: [...map.values()] }).catch(() => {});
      return map;
    }).catch(error => { this.lastError = error; this.failureUntil = this.now() + 60000; this.failed = true; throw error; }).finally(() => { this.loading = null; });
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
