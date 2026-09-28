// SPDX-License-Identifier: AGPL-3.0-only
import { App } from '@modelcontextprotocol/ext-apps';
import packageInfo from '../package.json';

export const nativeMode = document.documentElement.dataset.skilldockHost === 'mcp';
let bridge: App | undefined;
let connecting: Promise<App> | undefined;

async function connect() {
  if (!connecting) {
    bridge = new App({ name: 'SkillDock', version: packageInfo.version }, {}, { autoResize: false });
    connecting = bridge.connect().then(() => bridge!).catch(error => { connecting = undefined; throw error; });
  }
  return connecting;
}

async function call(name: string, args: Record<string, unknown>) {
  const host = await connect();
  let result;
  try { result = await host.callServerTool({ name, arguments: args }, { timeout: 660000 }); }
  catch (error) {
    if (name === 'skilldock_action') throw new Error('操作响应中断，结果尚未确认。请先刷新操作记录和清单，确认后再决定是否重试。');
    throw error;
  }
  if (result.isError) throw new Error(String(result._meta?.error || 'SkillDock request failed.'));
  return result._meta?.response as { status: number; data: unknown; url?: string };
}

function withSignal<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function apiFetch(route: string, options: RequestInit = {}): Promise<Response> {
  if (!nativeMode) return fetch(route, { credentials: 'same-origin', ...options });
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const method = options.method || 'GET';
  let result;
  if (method === 'POST' && route === '/api/actions') {
    result = await withSignal(call('skilldock_action', { body: JSON.parse(String(options.body)), session: new Headers(options.headers).get('X-SkillDock-Token') || '' }), options.signal);
  } else if (method === 'GET') result = await withSignal(call('skilldock_read', { route }), options.signal);
  else throw new Error('Unsupported SkillDock request.');
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return Response.json(result.data, { status: result.status });
}

export async function openDownload(name: 'license' | 'source') {
  if (!nativeMode) { window.open('/api/' + name, '_blank', 'noopener,noreferrer'); return; }
  const response = await call('skilldock_download', { name });
  if (!response.url) throw new Error('Download is unavailable.');
  await (await connect()).openLink({ url: response.url });
}

export async function openExternalLink(url: string) {
  if (new URL(url).protocol !== 'https:') throw new Error('Unsupported external link.');
  await (await connect()).openLink({ url });
}
