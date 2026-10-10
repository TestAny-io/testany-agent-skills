// SPDX-License-Identifier: AGPL-3.0-only
// Phase 5b: updating a Claude plugin installed from a marketplace (HLD 3.3, 3.3A; DEC-SDX-005,
// 019, 026). SkillDock stages what Claude would install, shows the difference, checks it again
// before Claude's command line runs, and reads back what Claude installed. What needs the network
// (a Git checkout, an npm package, an archive) goes through functions the service can replace.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, inspectTree, copySkill, inside } from './files.mjs';
import { checkoutGit, runProcess } from './cli.mjs';

/** What Claude writes into an installation, left out of its fingerprint (HLD 3.3A; 9.3 V11). */
export const INSTALL_SKIP = new Set(['node_modules', '.in_use', '.orphaned_at']);

/** A plugin's entry in a marketplace copy, and the copy's `metadata.pluginRoot`. */
export async function marketplaceEntry(installLocation, name) {
  let catalog;
  try { catalog = JSON.parse(await fs.readFile(path.join(installLocation, '.claude-plugin/marketplace.json'), 'utf8')); }
  catch { fail(409, 'SOURCE_MISSING', '无法读取这个插件所在 marketplace 的本机副本；请刷新 marketplace 后再检查。'); }
  const entry = Array.isArray(catalog?.plugins) ? catalog.plugins.find(item => item?.name === name) : undefined;
  if (!entry) fail(404, 'NOT_FOUND', '这个插件已不在它的 marketplace 中；请刷新 marketplace 后再检查。');
  return { entry, pluginRoot: typeof catalog.metadata?.pluginRoot === 'string' ? catalog.metadata.pluginRoot : null };
}

const githubUrl = repo => `https://github.com/${repo}.git`;
const gitUrl = value => value.startsWith('file://') ? fileURLToPath(value) : /^[\w.-]+\/[\w.-]+$/.test(value) ? githubUrl(value) : value;

/**
 * How SkillDock follows a plugin's source. `kind` is one of local, git-market, git, npm, archive
 * (updatable), or command, helper, unknown (shown with the reason, DEC-SDX-019).
 */
export function pluginSource(entry, market) {
  if (entry.headersHelper) return { kind: 'helper' };
  const source = entry.source;
  if (typeof source === 'string') {
    const kind = ['directory', 'file'].includes(market.source) ? 'local' : ['github', 'git'].includes(market.source) ? 'git-market' : 'unknown';
    return { kind, relative: source };
  }
  if (!source || typeof source !== 'object') return { kind: 'unknown' };
  const ref = typeof source.sha === 'string' ? source.sha : typeof source.ref === 'string' ? source.ref : undefined;
  switch (source.source) {
    case 'github': return typeof source.repo === 'string' ? { kind: 'git', url: githubUrl(source.repo), ref } : { kind: 'unknown' };
    case 'url': return typeof source.url === 'string' ? { kind: 'git', url: gitUrl(source.url), ref } : { kind: 'unknown' };
    case 'git-subdir': return typeof source.url === 'string' && typeof source.path === 'string' ? { kind: 'git', url: gitUrl(source.url), ref, subpath: source.path } : { kind: 'unknown' };
    // A package name that reads as an option is not one SkillDock passes to npm (5a/5b review P3-06).
    case 'npm': return typeof source.package === 'string' && !source.package.startsWith('-') ? { kind: 'npm', spec: !source.package.startsWith('https:') && typeof source.version === 'string' && !/@[^/]+$/.test(source.package.replace(/^@/, '')) ? `${source.package}@${source.version}` : source.package, ...(typeof source.registry === 'string' ? { registry: source.registry } : {}) } : { kind: 'unknown' };
    case 'archive': return typeof source.url === 'string' ? { kind: 'archive', url: source.url, ...(typeof source.sha256 === 'string' ? { sha256: source.sha256.toLowerCase() } : {}) } : { kind: 'unknown' };
    case 'command': return { kind: 'command' };
    default: return { kind: 'unknown' };
  }
}

/** Why SkillDock leaves a source to Claude (DEC-SDX-019). */
export const OWNER_REASON = {
  command: '这个插件由 marketplace 声明的命令生成；SkillDock 不代为运行这个命令。可在 Claude Code 中用 /plugin 更新。',
  helper: '这个插件的下载需要 marketplace 声明的凭证命令；SkillDock 不代为运行。可在 Claude Code 中用 /plugin 更新。',
  unknown: '无法识别这个插件的来源；可在 Claude Code 中用 /plugin 更新。',
};

// A relative source resolves from the marketplace root; a bare name under `metadata.pluginRoot`.
function relativeDirectory(installLocation, relative, pluginRoot) {
  const value = !relative.startsWith('./') && relative !== '.' && !relative.includes('/') && pluginRoot ? path.join(pluginRoot, relative) : relative;
  const directory = path.resolve(installLocation, value);
  // By the real path too: a link inside the copy must not bring in a directory outside it (5a/5b review P3-06).
  const real = value => { try { return fsSync.realpathSync(value); } catch { return null; } };
  const actual = real(directory);
  if (!inside(path.resolve(installLocation), directory) || actual && !inside(real(installLocation) ?? path.resolve(installLocation), actual)) fail(422, 'SOURCE_BOUNDARY', '插件来源越出 marketplace 根目录。');
  return directory;
}

/** The plugin directory a local or Git-hosted marketplace copy holds for a relative entry. */
export function localDirectory(source, installLocation, pluginRoot) {
  return relativeDirectory(installLocation, source.relative, pluginRoot);
}

/** Default network access, for the service; tests replace it. */
export function defaultFetchers({ env, timeout = 60000, fetchImpl = fetch, archiveLimit = 100 * 1024 * 1024 } = {}) {
  return {
    checkout: (url, ref, destination) => checkoutGit(url, ref, destination, { env, timeout }),
    // Exact names, in the order a checkout resolves them: a tag before a branch, an annotated tag by
    // the commit it points to. A short pattern would also match longer names (5c review P3-02).
    resolve: async (url, ref) => {
      if (ref && /^[a-f0-9]{40}$/.test(ref)) return ref;
      const names = !ref ? ['HEAD'] : ref.startsWith('refs/') ? [`${ref}^{}`, ref] : [`refs/tags/${ref}^{}`, `refs/tags/${ref}`, `refs/heads/${ref}`];
      const out = (await runProcess('git', ['-c', 'protocol.file.allow=always', 'ls-remote', '--', url, ...names], { env, timeout })).stdout.trim();
      const listed = new Map(out.split('\n').map(line => line.split(/\s+/)).map(([commit, name]) => [name, commit]));
      const commit = names.map(name => listed.get(name)).find(Boolean) ?? '';
      if (!/^[a-f0-9]{40,64}$/.test(commit)) fail(502, 'GIT_REPOSITORY_UNAVAILABLE', '无法解析来源的 Git 提交。');
      return commit;
    },
    npmPack: async (spec, registry, directory) => {
      const out = JSON.parse((await runProcess('npm', ['pack', spec, '--ignore-scripts', '--json', '--pack-destination', directory, ...(registry ? ['--registry', registry] : [])], { env, cwd: directory, timeout })).stdout);
      const [first] = Array.isArray(out) ? out : [];
      if (!first?.filename) fail(502, 'DOWNLOAD_MISSING', '无法下载这个 npm 包。');
      return { file: path.join(directory, path.basename(first.filename)), version: first.version, integrity: first.integrity };
    },
    // Redirects are followed by hand, to https hosts other than this computer only, and the size is
    // counted while reading (5a/5b review P3-06).
    download: async (url, file) => {
      const signal = AbortSignal.timeout(timeout); let current = url;
      for (let hops = 0; ; hops++) {
        const target = new URL(current);
        if (target.protocol !== 'https:') fail(422, 'INVALID_SOURCE', '压缩包来源只接受 https 地址。');
        if (/^(localhost\.?|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\]|\[::ffff:(127\.[\d.]+|7f[0-9a-f]{2}:[0-9a-f]{1,4})\])$/i.test(target.hostname)) fail(422, 'INVALID_SOURCE', '压缩包来源不能指向本机。');
        const response = await fetchImpl(current, { redirect: 'manual', signal });
        const next = response.headers.get('location');
        if ([301, 302, 303, 307, 308].includes(response.status) && next) {
          if (hops >= 5) fail(502, 'DOWNLOAD_MISSING', '下载压缩包失败：重定向过多。');
          current = new URL(next, current).href; continue;
        }
        if (!response.ok) fail(502, 'DOWNLOAD_MISSING', `下载压缩包失败：HTTP ${response.status}。`);
        const chunks = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > archiveLimit) fail(422, 'SOURCE_LIMIT', '压缩包超过 100 MB。'); chunks.push(chunk); }
        await fs.writeFile(file, Buffer.concat(chunks)); return;
      }
    },
    unzip: (file, destination) => runProcess(process.platform === 'darwin' ? '/usr/bin/ditto' : 'unzip', process.platform === 'darwin' ? ['-x', '-k', file, destination] : ['-q', file, '-d', destination], { env, timeout }),
    untar: (file, destination) => runProcess('tar', ['-xzf', file, '-C', destination], { env, timeout }),
  };
}

const sha256 = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
// The plugin root may be at the top of an archive or one directory down.
async function archiveRoot(directory) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).filter(entry => !entry.name.startsWith('.') && entry.name !== '__MACOSX');
  const plugin = await fs.stat(path.join(directory, '.claude-plugin')).then(() => true, () => false);
  return !plugin && entries.length === 1 && entries[0].isDirectory() ? path.join(directory, entries[0].name) : directory;
}

/**
 * Stages what Claude would install into `staging/candidate` (HLD 3.3A), leaving out what the
 * installation's fingerprint leaves out (`node_modules`; 5a/5b review P2-01). Returns the candidate's
 * tree and the facts the pre-apply check and the version need (commit, digest, package).
 */
export async function stageCandidate(source, { installLocation, pluginRoot, staging, fetchers }) {
  const candidate = path.join(staging, 'candidate');
  switch (source.kind) {
    case 'local': case 'git-market': {
      const tree = await copySkill(localDirectory(source, installLocation, pluginRoot), candidate, { skip: INSTALL_SKIP });
      return { candidate, tree };
    }
    case 'git': {
      const repository = path.join(staging, 'repository');
      const commit = await fetchers.checkout(source.url, source.ref, repository);
      const directory = source.subpath ? path.resolve(repository, source.subpath) : repository;
      if (!inside(repository, directory) || !inside(await fs.realpath(repository), await fs.realpath(directory).catch(() => directory))) fail(422, 'SOURCE_BOUNDARY', '插件子目录越出仓库。');
      const tree = await copySkill(directory, candidate, { skip: INSTALL_SKIP });
      return { candidate, tree, commit };
    }
    case 'npm': {
      const packed = await fetchers.npmPack(source.spec, source.registry, staging);
      const extract = path.join(staging, 'extract'); await fs.mkdir(extract);
      await fetchers.untar(packed.file, extract);
      const tree = await copySkill(path.join(extract, 'package'), candidate, { skip: INSTALL_SKIP });
      return { candidate, tree, packageVersion: packed.version, integrity: packed.integrity };
    }
    case 'archive': {
      const file = path.join(staging, 'archive.zip');
      await fetchers.download(source.url, file);
      const digest = await sha256(file);
      if (source.sha256 && source.sha256 !== digest) fail(409, 'SOURCE_CHANGED', '下载的压缩包摘要与 marketplace 条目声明的不一致，已中止。');
      const extract = path.join(staging, 'extract'); await fs.mkdir(extract);
      await fetchers.unzip(file, extract);
      const tree = await copySkill(await archiveRoot(extract), candidate, { skip: INSTALL_SKIP });
      return { candidate, tree, sha256: digest };
    }
    default: fail(422, 'UNSUPPORTED_FOR_AGENT', OWNER_REASON[source.kind] ?? OWNER_REASON.unknown);
  }
}

/**
 * The version Claude will compute for the candidate (Plugin loading reference): the manifest's,
 * then the entry's, then by source. Null when SkillDock cannot tell in advance.
 */
export async function predictVersion(candidate, entry, source, facts) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(candidate, '.claude-plugin/plugin.json'), 'utf8'));
    if (typeof manifest?.version === 'string') return manifest.version;
  } catch { /* No manifest, or none with a version. */ }
  if (typeof entry.version === 'string') return entry.version;
  if (source.kind === 'git') return source.subpath ? null : facts.commit?.slice(0, 12) ?? null;
  if (source.kind === 'archive') return (source.sha256 ?? facts.sha256)?.slice(0, 12) ?? null;
  if (source.kind === 'local' || source.kind === 'npm') return 'unknown';
  return null;
}

/**
 * What a check found: current when the installation already holds the candidate; blocked when
 * the content changed but Claude would compute the same version and so not update (9.3, 5b probe);
 * otherwise available.
 */
export function checkOutcome({ installedVersion, installedFingerprint, candidateFingerprint, predicted }) {
  if (installedFingerprint === candidateFingerprint) return { status: 'current', message: '已安装内容与来源一致。' };
  if (predicted && predicted !== 'unknown' && predicted === installedVersion)
    return { status: 'blocked', reasonCode: 'VERSION_UNCHANGED', message: `来源内容有变化，但版本仍是 ${installedVersion}；Claude 只在版本变化时更新，请维护者递增版本。` };
  return { status: 'available', message: predicted && predicted !== 'unknown' ? `发现新版本 ${predicted}；经 Claude 命令行更新。` : '来源内容有变化；经 Claude 命令行更新。' };
}

/** Copies an installation, its dependencies included and Claude's markers left out (HLD 3.3A). */
export async function copyInstallation(installPath, destination) {
  await fs.cp(installPath, destination, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false,
    filter: file => { const relative = path.relative(installPath, file); return !['.in_use', '.orphaned_at'].includes(relative.split(path.sep)[0]); } });
}
