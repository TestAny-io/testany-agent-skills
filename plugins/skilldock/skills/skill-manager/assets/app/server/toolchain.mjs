// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { nodeCandidates, readSavedNode, writeSavedNode } from './node-candidates.mjs';

const execute = promisify(execFile);
export const NODE_RELEASE = Object.freeze({
  version: '24.21.0',
  sha256: Object.freeze({
    arm64: 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
    x64: '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
  }),
});
const npmRelative = 'lib/node_modules/npm/bin/npm-cli.js';
const unique = values => [...new Set(values.filter(Boolean))];
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const run = (file, args) => execute(file, args, { timeout: 10000, maxBuffer: 1024 * 1024 });

export function compatibleVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return Boolean(match && (Number(match[1]) > 22 || Number(match[1]) === 22 && Number(match[2]) >= 12));
}

export function hasLibraryRestriction(description) {
  const flags = /CodeDirectory[^\n]*flags=0x([a-f\d]+)/i.exec(description);
  const requiresValidation = flags && (parseInt(flags[1], 16) & (0x10000 | 0x2000));
  return Boolean(requiresValidation && !/<key>com\.apple\.security\.cs\.disable-library-validation<\/key>\s*<true\s*\/>/.test(description));
}

export async function inspectNode(file, { platform = process.platform } = {}) {
  try {
    if (!path.isAbsolute(file)) throw new Error('Node 路径必须为绝对路径。');
    const node = await fs.realpath(file);
    const { stdout } = await run(node, ['--version']);
    const nodeVersion = stdout.trim();
    if (!compatibleVersion(nodeVersion)) throw new Error(`Node ${nodeVersion} 不满足 22.12+ 的要求。`);
    if (platform === 'darwin') {
      let description;
      try { const value = await run('/usr/bin/codesign', ['-dvv', '--entitlements', ':-', node]); description = value.stdout + value.stderr; }
      catch (error) {
        if (!/code object is not signed at all/.test(error.stderr || '')) throw new Error('无法核实 Node 的原生模块加载权限。');
      }
      if (description && hasLibraryRestriction(description)) throw new Error('此 Node 的 macOS 签名限制外部原生模块加载，只能用于引导。');
    }
    return { node, nodeVersion };
  } catch (error) { return { reason: error.message }; }
}

export function appRoots(env = process.env, home = os.homedir()) {
  return unique([env.SKILLDOCK_CODEX_APP_DIR, '/Applications/ChatGPT.app', '/Applications/Codex.app',
    path.join(home, 'Applications/ChatGPT.app'), path.join(home, 'Applications/Codex.app')]);
}

function onPath(name, env) {
  return (env.PATH || '').split(path.delimiter).filter(directory => path.isAbsolute(directory) && path.resolve(directory) !== process.cwd())
    .map(directory => path.join(directory, name));
}

/**
 * The npm CLI paired with `node` (its real path). `via` is the path the Node was found at,
 * when that is a link: Homebrew links npm under the prefix it links Node from, and keeps
 * its own copy in libexec beside the real Node, neither next to the real Node itself.
 */
export async function findNpm(node, { env = process.env, apps = appRoots(env), via } = {}) {
  const candidates = env.SKILLDOCK_NPM_CLI ? [env.SKILLDOCK_NPM_CLI] : unique([
    env.SKILLDOCK_SELECTED_NPM_CLI,
    path.resolve(path.dirname(node), '..', npmRelative),
    ...via ? [path.resolve(path.dirname(via), '..', npmRelative)] : [],
    path.resolve(path.dirname(node), '..', 'libexec', npmRelative),
    ...apps.map(app => path.join(app, 'Contents/Resources/cua_node', npmRelative)),
    ...onPath('npm', env),
  ]);
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try {
      const npmCli = await fs.realpath(candidate);
      // npm launch scripts/shell shims are not JavaScript entrypoints.
      if (!npmCli.endsWith('/npm-cli.js')) continue;
      const { stdout } = await run(node, [npmCli, '--version']);
      const npmVersion = stdout.trim();
      if (/^\d+\.\d+\.\d+$/.test(npmVersion)) return { npmCli, npmVersion };
    } catch { /* Try the next independently installed npm CLI. */ }
  }
  return null;
}

function privateLocation(stateDir, arch) {
  const name = `node-v${NODE_RELEASE.version}-darwin-${arch}`;
  return { name, root: path.join(stateDir, 'node', name), sha256: NODE_RELEASE.sha256[arch] };
}

async function privateReady(root, sha256) {
  try { return Boolean(sha256 && JSON.parse(await fs.readFile(path.join(root, '.skilldock-runtime.json'), 'utf8')).archiveSha256 === sha256); }
  catch { return false; }
}

export async function downloadVerified(url, destination, expected, { fetcher = fetch } = {}) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error(`Node.js 下载失败（HTTP ${response.status}）。`);
  let size = 0; const hash = crypto.createHash('sha256');
  const check = new Transform({ transform(chunk, _encoding, next) {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) return next(new Error('Node.js 下载超过大小限制。'));
    hash.update(chunk); next(null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body), check, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    if (hash.digest('hex') !== expected) throw new Error('Node.js 下载的 SHA-256 不匹配；未提取或启用该文件。');
  } catch (error) { if (error.code !== 'EEXIST') await fs.rm(destination, { force: true }); throw error; }
}

export async function installPrivateRuntime({ stateDir, arch = process.arch, platform = process.platform,
  download = downloadVerified, inspect = inspectNode, log = message => process.stderr.write(`SkillDock：${message}\n`) }) {
  const spec = privateLocation(stateDir, arch);
  if (platform !== 'darwin' || !spec.sha256) throw new Error('自动准备专用 Node.js 当前仅支持 macOS arm64/x64。');
  const directory = path.dirname(spec.root);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const lockFile = path.join(directory, 'install.lock'); let lock;
  try { lock = await fs.open(lockFile, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('另一个启动器正在准备 Node.js，请稍后重试。'); throw error; }
  let stage;
  try {
    if (await privateReady(spec.root, spec.sha256)) {
      const node = await inspect(path.join(spec.root, 'bin/node'), { platform });
      const npm = node.node && await findNpm(node.node, { env: {}, apps: [] });
      if (npm && node.nodeVersion === `v${NODE_RELEASE.version}`) return { ...node, ...npm, source: 'skilldock-private' };
    }
    stage = await fs.mkdtemp(path.join(directory, '.install-'));
    const archive = path.join(stage, 'node.tar.gz');
    log(`正在准备专用 Node.js ${NODE_RELEASE.version}（首次下载约 53 MB）…`);
    await download(`https://nodejs.org/dist/v${NODE_RELEASE.version}/${spec.name}.tar.gz`, archive, spec.sha256);
    // Only the archive matching the release's pinned digest reaches the extractor.
    await execute('/usr/bin/tar', ['-xzf', archive, '-C', stage], { timeout: 60000, maxBuffer: 1024 * 1024 });
    const extracted = path.join(stage, spec.name);
    const node = await inspect(path.join(extracted, 'bin/node'), { platform });
    if (!node.node || node.nodeVersion !== `v${NODE_RELEASE.version}`) throw new Error('下载的 Node.js 未通过运行验证。');
    const npm = await findNpm(node.node, { env: {}, apps: [] });
    if (!npm) throw new Error('下载的 npm 未通过运行验证。');
    await fs.writeFile(path.join(extracted, '.skilldock-runtime.json'), JSON.stringify({ archiveSha256: spec.sha256, version: NODE_RELEASE.version }), { mode: 0o600 });
    // Preserve an incomplete prior directory; never replace a running binary in place.
    try { await fs.rename(spec.root, `${spec.root}.incomplete-${crypto.randomUUID()}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(extracted, spec.root);
    return { node: path.join(spec.root, 'bin/node'), nodeVersion: node.nodeVersion,
      npmCli: path.join(spec.root, npmRelative), npmVersion: npm.npmVersion, source: 'skilldock-private' };
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await lock.close(); await fs.rm(lockFile, { force: true });
  }
}

/**
 * HLD 3.10 (DEC-SDX-012): the first candidate (node-candidates.mjs order) that passes the
 * version, signing and npm checks; the saved selection only gets a light check (file,
 * version, npm present) and is replaced when it fails. Nothing is downloaded: without a
 * usable Node the result is `available: false` and the entry shows guidance.
 * `save: false` (doctor) never writes; `system: false` leaves out fixed system paths (tests);
 * `fresh: true` (re-detect) scans without the saved selection.
 * An explicit Node is saved too, so background runs keep using it; an explicit npm CLI
 * is never replaced by a saved selection.
 */
export async function resolveToolchain({ stateDir, env = process.env, home = os.homedir(), apps = appRoots(env, home),
  platform = process.platform, inspect = inspectNode, save = true, system = true, fresh = false,
  log = message => process.stderr.write(`SkillDock：${message}\n`) } = {}) {
  const saved = fresh || env.SKILLDOCK_NODE_BIN || env.SKILLDOCK_NPM_CLI ? null : await readSavedNode(stateDir);
  const candidates = env.SKILLDOCK_NODE_BIN ? [{ file: env.SKILLDOCK_NODE_BIN, source: 'explicit' }]
    : await nodeCandidates({ env, home, stateDir, saved: saved?.node, system });
  const rejected = []; const seen = new Set();
  for (const { file, source } of candidates) {
    if (seen.has(file)) continue; seen.add(file);
    if (source === 'saved') {
      const reused = await savedStillUsable(saved);
      if (reused) return { node: saved.node, nodeVersion: saved.nodeVersion, npmCli: saved.npmCli, npmVersion: saved.npmVersion, source: 'saved', savedSource: saved.source };
      rejected.push({ source, path: file, reason: '保存的 Node 已不可用。' });
      log(`保存的 Node（${file}）已不可用，重新检测。`);
      continue;
    }
    const node = await inspect(file, { platform });
    if (!node.node) { rejected.push({ source, path: file, reason: node.reason }); continue; }
    const npm = await findNpm(node.node, { env, apps, via: file });
    if (!npm) { rejected.push({ source, path: file, reason: '未找到能由此 Node 执行的 npm CLI。' }); continue; }
    const selection = { ...node, ...npm, source };
    if (save) await writeSavedNode(stateDir, selection).catch(error => log(`未能保存所选 Node：${error.message}`));
    return selection;
  }
  if (env.SKILLDOCK_NODE_BIN || env.SKILLDOCK_NPM_CLI) throw new Error(`显式运行环境配置不可用：${rejected.map(item => item.reason).join('；')}`);
  return { available: false, rejected };
}

// Light reuse check (HLD 3.10): the files are still there and the version still matches.
async function savedStillUsable(saved) {
  try {
    await fs.access(saved.node, fs.constants.X_OK); await fs.access(saved.npmCli, fs.constants.R_OK);
    const { stdout } = await run(saved.node, ['--version']);
    return stdout.trim() === saved.nodeVersion && compatibleVersion(saved.nodeVersion);
  } catch { return false; }
}

export async function buildEnvironment(runtime, node, npmCli, env = process.env) {
  const bin = path.join(runtime, '.toolchain-bin');
  await fs.mkdir(bin, { recursive: true, mode: 0o700 });
  for (const [name, args] of [['node', []], ['npm', [npmCli]]]) {
    await fs.writeFile(path.join(bin, name), `#!/bin/sh\nexec ${[node, ...args].map(shellQuote).join(' ')} "$@"\n`, { mode: 0o700 });
  }
  return { ...env, PATH: `${bin}${path.delimiter}${env.PATH || ''}` };
}
