// SPDX-License-Identifier: AGPL-3.0-only
import { imageData } from './provider-icons.mjs';

// Never expose an arbitrary URL proxy or send Codex credentials to asset hosts.
const hosts = new Set(['files.openai.com', 'cdn.openai.com', 'persistent.oaistatic.com']);
function permitted(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && hosts.has(url.hostname) && !url.port && !url.username && !url.password; }
  catch { return false; }
}
export function createDirectoryIcons({ fetchImpl = fetch, maxBytes = 16 * 1024 * 1024 } = {}) {
  const cache = new Map(); let bytes = 0, active = 0; const waiting = [];
  async function download(url) {
    if (!permitted(url)) return null;
    if (active >= 4) await new Promise(resolve => waiting.push(resolve));
    active++;
    try {
      const signal = AbortSignal.timeout(5000);
      for (let redirect = 0; redirect < 4; redirect++) {
        if (!permitted(url)) return null;
        const response = await fetchImpl(url, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'image/*' } });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); url = new URL(response.headers.get('location'), url).href; continue; }
        if (!response.ok || Number(response.headers.get('content-length')) > 512 * 1024) { await response.body?.cancel(); return null; }
        const chunks = []; let length = 0;
        for await (const chunk of response.body || []) {
          length += chunk.length; if (length > 512 * 1024) return null;
          chunks.push(Buffer.from(chunk));
        }
        return imageData(Buffer.concat(chunks));
      }
    } catch { /* Presentation failures keep the normal fallback icon. */ }
    finally { active--; waiting.shift()?.(); }
    return null;
  }
  async function get(url) {
    if (!permitted(url)) return null;
    const prior = cache.get(url);
    if (prior && prior.expires > Date.now()) return prior.promise;
    if (prior) { bytes -= prior.size; cache.delete(url); }
    const entry = { expires: Date.now() + 60000, size: 0 };
    entry.promise = download(url).then(data => {
      if (cache.get(url) !== entry) return data;
      entry.size = data?.length || 0; bytes += entry.size;
      entry.expires = Date.now() + (data ? 3600000 : 60000);
      while (cache.size && (cache.size > 256 || bytes > maxBytes)) { const key = cache.keys().next().value; bytes -= cache.get(key).size; cache.delete(key); }
      return data;
    });
    cache.set(url, entry); return entry.promise;
  }
  return { get };
}
