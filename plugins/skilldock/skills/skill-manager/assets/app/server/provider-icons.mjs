// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { hash, inside } from './files.mjs';

const IMAGE_LIMIT = 512 * 1024;
const CATALOG_LIMIT = 8 * 1024 * 1024;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

// Assets are data, never HTML, scripts, remote URLs, or arbitrary file routes.
// Resolve declarations relative to the package, including their realpath boundary.
async function readWithin(root, relative, limit) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0')
    || path.isAbsolute(relative) || relative.includes(':') || relative.split('/').includes('..')) return null;
  let handle;
  try {
    const boundary = await fs.realpath(root);
    const file = await fs.realpath(path.resolve(boundary, relative));
    if (!inside(boundary, file)) return null;
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) return null;
    const buffer = Buffer.alloc(limit + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!chunk.bytesRead) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > limit) return null;
    return buffer.subarray(0, bytesRead);
  } catch { return null; }
  finally { await handle?.close(); }
}

async function json(root, relative) {
  const bytes = await readWithin(root, relative, 128 * 1024);
  try { const value = JSON.parse(bytes?.toString() || 'null'); return object(value) ? value : null; }
  catch { return null; }
}

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return 'image/x-icon';
  // SVG is used only as an <img> data URL. Keep it self-contained as well:
  // reject active/embedded documents, entities and external resource references.
  const svg = bytes.toString('utf8');
  const body = svg.replace(/^\uFEFF/, '').replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim();
  const externalCss = [...body.matchAll(/url\s*\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^["']|["']$/g, '').startsWith('#'));
  if (/^<svg(?:\s|>)/i.test(body) && /<\/svg\s*>\s*$/i.test(body)
    && !externalCss && !/<!|<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|@import/i.test(body)
    && !/(?:href|src)\s*=\s*["']\s*(?!#)[^"']/i.test(body)) return 'image/svg+xml';
  return null;
}

export function imageData(bytes) {
  if (!bytes || bytes.length > IMAGE_LIMIT) return null;
  const type = imageType(bytes);
  return type ? `data:${type};base64,${bytes.toString('base64')}` : null;
}

export function createIconCatalog({ budget = CATALOG_LIMIT } = {}) {
  const assets = {}; let size = 0;
  const reads = new Map(); const plugins = new Map();
  async function image(root, relative) {
    const key = JSON.stringify([root, relative]);
    if (!reads.has(key)) reads.set(key, (async () => {
      const bytes = await readWithin(root, relative, IMAGE_LIMIT);
      if (!bytes) return undefined;
      const type = imageType(bytes); if (!type) return undefined;
      const id = hash(bytes);
      if (assets[id]) return id;
      const data = `data:${type};base64,${bytes.toString('base64')}`;
      if (size + data.length > budget) return undefined;
      size += data.length; assets[id] = data; return id;
    })());
    return reads.get(key);
  }
  async function fromInterface(root, value) {
    if (!object(value)) return undefined;
    const small = await image(root, value.composerIcon);
    const large = await image(root, value.logo);
    const dark = await image(root, value.logoDark);
    return small || large || dark ? { ...(small ? { small } : {}), ...(large ? { large } : {}), ...(dark ? { dark } : {}) } : undefined;
  }
  async function plugin(root) {
    if (!root) return undefined;
    if (!plugins.has(root)) plugins.set(root, (async () => {
      const portable = await json(root, 'plugin.json');
      const inline = portable?.extensions?.['com.openai'];
      // The inline OpenAI extension replaces, rather than merges, the overlay.
      if (object(inline)) return fromInterface(root, inline.interface);
      const manifest = await json(root, '.codex-plugin/plugin.json') || await json(root, '.claude-plugin/plugin.json') || portable;
      return fromInterface(root, manifest?.interface);
    })());
    return plugins.get(root);
  }
  async function skill(root, fallback) {
    try {
      const bytes = await readWithin(root, 'agents/openai.yaml', 64 * 1024);
      const meta = bytes && parseYaml(bytes.toString(), { uniqueKeys: true, maxAliasCount: 20 });
      const small = await image(root, meta?.interface?.icon_small);
      const large = await image(root, meta?.interface?.icon_large);
      if (small || large) return { ...(small ? { small } : {}), ...(large ? { large } : {}) };
    } catch { /* Optional presentation metadata must not hide a valid skill. */ }
    return fallback;
  }
  return { assets, plugin, skill };
}
