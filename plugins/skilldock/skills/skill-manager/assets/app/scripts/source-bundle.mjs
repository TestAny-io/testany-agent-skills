#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const APP_FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'playwright.config.ts'];
export const APP_TREES = ['src', 'shared', 'server', 'scripts', 'tests'];
export const ROOT_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SKILL.md', 'scripts/launch.mjs', 'scripts/launch.sh', 'scripts/bootstrap.mjs'];
const EXCLUDED = new Set(['node_modules', '.git', '.codex', '.agents', '.state', '.source-snapshot', 'dist', 'test-results', 'playwright-report']);
const APP_PREFIX = 'assets/app/';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const comparePath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const within = (root, file) => { const relative = path.relative(root, file); return relative === '' || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); };
const cleanPath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => !part || part === '.' || part === '..' || EXCLUDED.has(part) || part.startsWith('.env'));

function allowed(relative) {
  if (!cleanPath(relative)) return false;
  if (ROOT_FILES.includes(relative)) return true;
  if (!relative.startsWith(APP_PREFIX)) return false;
  const appPath = relative.slice(APP_PREFIX.length);
  return APP_FILES.includes(appPath) || APP_TREES.some(tree => appPath.startsWith(`${tree}/`));
}

async function appEntries(appDir) {
  const entries = []; let total = 0;
  async function visit(file, relative, boundary) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error(`源码归档拒绝符号链接：${relative}`);
    if (!within(boundary, await fs.realpath(file))) throw new Error(`源码路径越界：${relative}`);
    if (stat.isDirectory()) {
      for (const child of (await fs.readdir(file)).sort()) {
        if (EXCLUDED.has(child) || child.startsWith('.env') || child === '.DS_Store') continue;
        await visit(path.join(file, child), `${relative}/${child}`, boundary);
      }
    } else if (stat.isFile()) {
      if (!allowed(relative)) throw new Error(`文件不在源码允许列表：${relative}`);
      const bytes = await fs.readFile(file);
      total += bytes.length;
      if (total > 64 * 1024 * 1024 || entries.length >= 10000) throw new Error('源码归档超过大小或文件数量限制。');
      entries.push({ path: relative, bytes, mode: stat.mode & 0o111 ? 0o755 : 0o644 });
    } else throw new Error(`源码包含不支持的文件类型：${relative}`);
  }
  const app = await fs.realpath(appDir);
  for (const name of [...APP_FILES, ...APP_TREES]) await visit(path.join(app, name), `${APP_PREFIX}${name}`, app);
  return entries;
}

function digest(entries) {
  const hash = crypto.createHash('sha256');
  for (const entry of [...entries].sort(comparePath)) hash.update(entry.path).update('\0').update(String(entry.mode)).update('\0').update(entry.bytes).update('\0');
  return hash.digest('hex');
}

export async function captureSource(appDir) {
  const app = await fs.realpath(appDir); const root = await fs.realpath(path.join(app, '../..'));
  if (app !== path.join(root, 'assets/app')) throw new Error('源码归档需要完整的 skill-manager/assets/app 目录结构。');
  const entries = await appEntries(app);
  for (const relative of ROOT_FILES) {
    let current = root;
    for (const segment of relative.split('/')) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`源码归档拒绝符号链接：${relative}`);
    }
    const stat = await fs.lstat(current);
    if (!stat.isFile() || !within(root, await fs.realpath(current))) throw new Error(`无效的必要源码文件：${relative}`);
    entries.push({ path: relative, bytes: await fs.readFile(current), mode: stat.mode & 0o111 ? 0o755 : 0o644 });
  }
  entries.sort(comparePath);
  return { entries, sourceDigest: digest(entries) };
}

function tarHeader(name, length, mode, type = '0') {
  const header = Buffer.alloc(512); let leaf = name; let prefix = '';
  if (Buffer.byteLength(leaf) > 100) {
    const segments = name.split('/'); leaf = segments.pop(); prefix = segments.join('/');
    if (Buffer.byteLength(leaf) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`源码路径超过 tar 格式限制：${name}`);
  }
  const string = (offset, value, size) => { if (Buffer.byteLength(value) > size) throw new Error('Invalid tar header.'); header.write(value, offset, size, 'utf8'); };
  const octal = (offset, value, size) => string(offset, value.toString(8).padStart(size - 1, '0') + '\0', size);
  string(0, leaf, 100); octal(100, mode, 8); octal(108, 0, 8); octal(116, 0, 8);
  octal(124, length, 12); octal(136, 0, 12); header.fill(32, 148, 156);
  string(156, type, 1); string(257, 'ustar\0', 6); string(263, '00', 2); string(345, prefix, 155);
  const sum = header.reduce((total, byte) => total + byte, 0);
  string(148, sum.toString(8).padStart(6, '0') + '\0 ', 8);
  return header;
}

function archive(snapshot, manifest) {
  const parts = APP_TREES.map(tree => tarHeader(`skilldock/assets/app/${tree}/`, 0, 0o755, '5'));
  const entries = [...snapshot.entries, { path: 'SOURCE_MANIFEST.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), mode: 0o644 }];
  for (const entry of entries) {
    if (entry.path !== 'SOURCE_MANIFEST.json' && !allowed(entry.path)) throw new Error('Invalid source snapshot entry.');
    parts.push(tarHeader(`skilldock/${entry.path}`, entry.bytes.length, entry.mode), entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

async function writeArtifacts(snapshot, destination, runtime) {
  const manifest = { format: 1, sourceDigest: snapshot.sourceDigest, files: snapshot.entries.map(entry => ({ path: entry.path, mode: entry.mode, sha256: sha(entry.bytes) })) };
  const bundle = archive(snapshot, manifest); const license = snapshot.entries.find(entry => entry.path === 'LICENSE')?.bytes;
  if (!license) throw new Error('源码快照缺少许可证。');
  await writeSafe(destination, 'skilldock-source.tar.gz', bundle);
  await writeSafe(destination, 'LICENSE.txt', license);
  await writeSafe(destination, 'manifest.json', JSON.stringify({ ...manifest, runtime, archiveSha256: sha(bundle), licenseSha256: sha(license) }, null, 2) + '\n');
}

async function writeSafe(directory, name, bytes, mode = 0o644) {
  try { if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('源码输出目录不能是符号链接。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.source-${crypto.randomUUID()}`);
  try { await fs.writeFile(temporary, bytes, { mode, flag: 'wx' }); await fs.rename(temporary, path.join(directory, name)); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function materializeRuntime(snapshot, runtime) {
  // These exact in-memory bytes also form the archive; no second read of a moving checkout.
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  for (const tree of APP_TREES) await fs.mkdir(path.join(runtime, tree), { recursive: true });
  for (const entry of snapshot.entries.filter(item => item.path.startsWith(APP_PREFIX))) {
    const relative = entry.path.slice(APP_PREFIX.length); const file = path.join(runtime, relative);
    await writeSafe(path.dirname(file), path.basename(file), entry.bytes, entry.mode);
  }
  await writeArtifacts(snapshot, path.join(runtime, '.source-snapshot'), true);
}

export async function verifySourceArtifacts(appDir) {
  const directory = path.join(appDir, '.source-snapshot');
  const read = async name => {
    const file = path.join(directory, name);
    if ((await fs.lstat(directory)).isSymbolicLink() || (await fs.lstat(file)).isSymbolicLink()) throw new Error('源码快照不能是符号链接。');
    return fs.readFile(file);
  };
  const manifest = JSON.parse(await read('manifest.json'));
  if (manifest.format !== 1 || typeof manifest.runtime !== 'boolean' || !Array.isArray(manifest.files) || manifest.files.some(entry => !allowed(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw new Error('源码快照清单无效。');
  const current = await appEntries(appDir);
  const expected = manifest.files.filter(entry => entry.path.startsWith(APP_PREFIX));
  if (current.length !== expected.length || current.some(entry => !expected.some(item => item.path === entry.path && item.mode === entry.mode && item.sha256 === sha(entry.bytes)))) throw new Error('源码在构建过程中发生变化；请重新构建，未发布不匹配的源码包。');
  if (!manifest.runtime && (await captureSource(appDir)).sourceDigest !== manifest.sourceDigest) throw new Error('许可证或启动器在构建过程中发生变化，请重新构建。');
  const bundle = await read('skilldock-source.tar.gz'); const license = await read('LICENSE.txt');
  if (sha(bundle) !== manifest.archiveSha256 || sha(license) !== manifest.licenseSha256) throw new Error('源码归档或许可证与快照不一致。');
  return { manifest, bundle, license };
}

export async function stageBuild(appDir) {
  const file = path.join(appDir, '.source-snapshot/manifest.json'); let prior;
  try { prior = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (prior?.runtime === true) { await verifySourceArtifacts(appDir); return; }
  await writeArtifacts(await captureSource(appDir), path.join(appDir, '.source-snapshot'), false);
}

export async function publishSource(appDir, output = path.join(appDir, 'dist')) {
  const { manifest, bundle, license } = await verifySourceArtifacts(appDir);
  await writeSafe(output, 'skilldock-source.tar.gz', bundle);
  await writeSafe(output, 'LICENSE.txt', license);
  return { sourceDigest: manifest.sourceDigest, archiveSha256: manifest.archiveSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = fileURLToPath(new URL('../', import.meta.url));
  if (process.argv[2] === '--stage') await stageBuild(app);
  else if (process.argv.length === 2) await publishSource(app);
  else throw new Error('用法：node scripts/source-bundle.mjs [--stage]');
}
