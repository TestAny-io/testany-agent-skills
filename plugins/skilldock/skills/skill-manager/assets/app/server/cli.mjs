import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AppError, fail, redact, exists, inside, safeSegment, publicSource } from './files.mjs';
import { pluginSourceInfo } from './sources.mjs';
import { resolveCodexCli } from './codex-runtime.mjs';
import { resolveGithubDirectory } from './git-source.mjs';
import { gitNetworkEnvironment, gitAccessError } from './git-access.mjs';

export function runProcess(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = ''; let settled = false;
    const child = spawn(binary, args, { shell: false, cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new AppError(504, 'CLI_TIMEOUT', '命令超时，未确认执行结果；请刷新查看实际状态后再操作。')); }, options.timeout ?? 20000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > (options.maxOutput ?? 8 * 1024 * 1024)) { child.kill('SIGKILL'); finish(new AppError(502, 'CLI_OUTPUT_LIMIT', '命令输出超过限制，无法确认结果。')); } });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-16000); });
    child.on('error', e => finish(new AppError(422, 'CLI_UNAVAILABLE', `无法启动命令：${redact(e.message)}`)));
    child.on('close', code => { if (code !== 0) finish(new AppError(502, 'CLI_FAILED', `命令失败（${code ?? 'signal'}）：${redact(stderr || stdout) || '没有返回详情'}`)); else finish(null, { stdout, stderr: redact(stderr) }); });
  });
}

export function validateSource(value, sourceType) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\x00-\x1f]/.test(value) || value.startsWith('-')) fail(400, 'INVALID_SOURCE', '请输入有效的来源路径或 Git 地址。');
  if (sourceType === 'local') {
    if (!path.isAbsolute(value)) fail(400, 'INVALID_SOURCE', '本地来源需要绝对路径。');
    return path.resolve(value);
  }
  if (path.isAbsolute(value)) return path.resolve(value);
  if (/^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9_./-]+$/.test(value)) return value;
  let url; try { url = new URL(value); } catch { fail(400, 'INVALID_GIT', 'Git 来源仅支持 HTTPS、SSH 或本地仓库绝对路径。'); }
  if (!['https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.password || url.search || url.hash || (url.protocol === 'https:' && url.username)) fail(400, 'INVALID_GIT', 'Git 地址不能包含凭证、查询参数或不支持的协议。');
  return value;
}
export function validateSubpath(value = '') {
  if (typeof value !== 'string' || value.length > 1000 || path.isAbsolute(value) || value.split(/[\\/]/).includes('..') || /[\x00-\x1f]/.test(value)) fail(400, 'INVALID_SUBPATH', '子路径必须是来源目录内的相对路径。');
  return value || '.';
}
export function validateRef(value) {
  if (value !== undefined && (typeof value !== 'string' || !value || value.length > 200 || value.startsWith('-') || !/^[a-zA-Z0-9_./-]+$/.test(value) || value.includes('..'))) fail(400, 'INVALID_REF', 'Git ref 仅支持分支、标签或 commit ID。');
  return value;
}

export async function checkoutGit(source, ref, destination, options = {}) {
  validateSource(source, 'git'); validateRef(ref);
  const network = { ...gitNetworkEnvironment(options.env), GIT_ALLOW_PROTOCOL: path.isAbsolute(source) ? 'https:ssh:file' : 'https:ssh' };
  const config = ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always', '-c', 'protocol.ext.allow=never', '-c', `protocol.file.allow=${path.isAbsolute(source) ? 'always' : 'never'}`, '-c', 'submodule.recurse=false'];
  // Clone reads trusted user/system configuration for credentials, CA/proxy and
  // SSH settings. No checkout or template can execute a configured file filter.
  const parent = path.dirname(path.resolve(destination));
  try {
    await runProcess('git', [...config, 'clone', '--no-hardlinks', '--no-checkout', '--no-recurse-submodules', '--template=', '--origin', 'origin', '--', source, destination],
      { env: { ...network, GIT_CEILING_DIRECTORIES: parent }, cwd: parent, timeout: options.timeout ?? 45000 });
  } catch (error) { throw gitAccessError(error); }
  const env = { ...network, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const run = args => runProcess('git', [...config, ...args], { env, timeout: options.timeout ?? 45000 });
  if (options.githubDirectory) {
    const refs = (await run(['-C', destination, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin', 'refs/tags'])).stdout.trim().split('\n');
    const location = resolveGithubDirectory(options.githubDirectory, ref, refs);
    validateRef(location.ref); validateSubpath(location.subpath);
    ref = location.ref; options.onLocation?.(location);
  }
  let resolved;
  try { resolved = (await run(['-C', destination, 'rev-parse', '--verify', `${ref || 'HEAD'}^{commit}`])).stdout.trim(); }
  catch (error) {
    if (!ref || ref.startsWith('refs/')) throw error;
    resolved = (await run(['-C', destination, 'rev-parse', '--verify', `refs/remotes/origin/${ref}^{commit}`])).stdout.trim();
  }
  if (!/^[a-f0-9]{40,64}$/.test(resolved)) fail(422, 'INVALID_COMMIT', '无法解析 Git commit。');
  // Materialize files with hooks, system/global filters and submodules disabled.
  await run(['-C', destination, 'checkout', '--detach', resolved]);
  return resolved;
}

export class CodexAdapter {
  constructor({ codexHome, codexBin, timeout = 20000, env = process.env }) { this.codexHome = codexHome; this.explicit = codexBin; this.timeout = timeout; this.env = env; this.info = { available: false }; this.probePromise = null; }
  async probe() {
    if (this.probePromise) return this.probePromise;
    this.probePromise = resolveCodexCli({ codexHome: this.codexHome, explicit: this.explicit, env: this.env })
      .then(info => { this.info = info; return info; });
    return this.probePromise;
  }
  async command(args, { mutation = false } = {}) {
    await this.probe();
    if (!this.info.available) fail(422, 'CLI_UNAVAILABLE', this.info.error);
    const allowed = ['plugin list', 'plugin add', 'plugin remove', 'plugin marketplace list', 'plugin marketplace add', 'plugin marketplace upgrade', 'plugin marketplace remove'];
    if (!allowed.some(prefix => args.slice(0, prefix.split(' ').length).join(' ') === prefix)) fail(403, 'CLI_COMMAND', '不支持该 CLI 操作。');
    let result;
    try { result = await runProcess(this.info.path, args, { timeout: mutation ? Math.max(this.timeout, 45000) : this.timeout, env: { ...gitNetworkEnvironment(this.env), CODEX_HOME: this.codexHome } }); }
    catch (error) { throw gitAccessError(error); }
    try { return JSON.parse(result.stdout); } catch { fail(502, 'CLI_JSON', 'CLI 没有返回有效 JSON，无法确认实际状态。'); }
  }
  async list() {
    const diagnostics = []; let plugins = []; let marketplaces = [];
    await this.probe();
    if (!this.info.available) return { plugins, marketplaces, diagnostics: [this.info.error], cli: this.info };
    const results = await Promise.allSettled([this.command(['plugin', 'list', '--available', '--json']), this.command(['plugin', 'marketplace', 'list', '--json'])]);
    if (results[0].status === 'fulfilled') {
      const data = results[0].value;
      if (!Array.isArray(data.installed) || !Array.isArray(data.available)) diagnostics.push('CLI 插件清单形状不受支持。');
      else {
        const seen = new Set();
        for (const [records, installed] of [[data.installed, true], [data.available, false]]) for (const p of records) {
          if (!p || !safeSegment(p.name) || !safeSegment(p.marketplaceName) || p.pluginId !== `${p.name}@${p.marketplaceName}` || (p.version !== undefined && !safeSegment(p.version))) { diagnostics.push('CLI 返回了无法安全使用的插件身份或版本，已忽略该记录。'); continue; }
          if (seen.has(p.pluginId)) continue;
          seen.add(p.pluginId);
          const local = p.source?.source === 'local' && typeof p.source?.path === 'string';
          const managed = /^(openai-bundled|openai-primary-runtime|openai-curated-remote)$/.test(p.marketplaceName);
          const plugin = { id: p.pluginId, name: p.name, description: '', marketplace: p.marketplaceName, version: typeof p.version === 'string' ? p.version : undefined, installed, enabled: typeof p.enabled === 'boolean' ? p.enabled : null, skillCount: 0, sourcePath: local ? p.source.path : undefined, canInstall: !installed && !managed, canRemove: installed && local && !managed, canToggle: installed && local && !managed, reason: managed ? '平台托管插件，请使用 Codex 官方管理入口。' : !local && installed ? '未建立可靠的本地包管理边界。' : undefined };
          plugin.sourceInfo = pluginSourceInfo(plugin, { sourceType: local ? 'local' : undefined, remoteId: p.source?.id });
          plugin._updateSourcePath = local ? p.source.path : undefined;
          plugins.push(plugin);
        }
      }
    } else diagnostics.push(redact(results[0].reason.message));
    if (results[1].status === 'fulfilled') {
      if (!Array.isArray(results[1].value.marketplaces)) diagnostics.push('CLI 市场清单形状不受支持。');
      else for (const m of results[1].value.marketplaces) {
        if (!safeSegment(m.name) || typeof m.root !== 'string' || !path.isAbsolute(m.root)) continue;
        const type = m.marketplaceSource?.sourceType || 'managed'; const source = m.marketplaceSource?.source || m.root;
        const managed = /^(openai-bundled|openai-primary-runtime|openai-curated|openai-curated-remote)$/.test(m.name);
        marketplaces.push({ id: m.name, name: m.name, source: publicSource(typeof source === 'string' ? source : m.root), type, pluginCount: plugins.filter(p => p.marketplace === m.name).length, canRemove: !!m.marketplaceSource && !managed, canRefresh: type === 'git' && !managed, reason: managed ? '平台维护的市场来源。' : undefined, _root: m.root });
      }
    } else diagnostics.push(redact(results[1].reason.message));
    for (const plugin of plugins.filter(item => item.installed && item.sourcePath)) {
      const market = marketplaces.find(item => item.name === plugin.marketplace);
      try {
        if (!market?._root) throw new Error('市场来源不在当前已确认清单中。');
        const entry = await readComponentEntry(market._root, plugin.name, plugin.sourcePath);
        const manifest = await readPluginManifest(plugin.sourcePath, market._root);
        plugin.description = typeof manifest.description === 'string' ? manifest.description : typeof entry.description === 'string' ? entry.description : '';
        const sourceReal = await fs.realpath(plugin.sourcePath);
        const roots = await discoverSkillRoots(plugin.sourcePath, { marketRoot: market._root, entry });
        const relatives = roots.map(root => path.relative(sourceReal, root) || '.');
        if (relatives.some(relative => relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) throw new Error('组件复用路径位于插件根外，初版无法证明缓存映射。');
        plugin._componentRoots = relatives;
      } catch (e) { plugin.canRemove = false; plugin.reason = '无法完整确认市场声明的组件范围，暂不提供卸载。'; plugin.sourceInfo.confidence = 'inferred'; diagnostics.push(`插件 ${plugin.name}：${redact(e.message)}`); }
    }
    return { plugins, marketplaces, diagnostics, cli: this.info };
  }
}

export async function readMarketplace(root) {
  const realRoot = await fs.realpath(root); let catalog;
  for (const relative of ['.agents/plugins/marketplace.json', '.codex-plugin/marketplace.json', '.claude-plugin/marketplace.json', 'marketplace.json']) {
    const file = path.join(realRoot, relative);
    if (!(await exists(file))) continue;
    if (!inside(realRoot, await fs.realpath(file))) fail(422, 'MARKETPLACE_BOUNDARY', '市场清单链接越出来源根目录。');
    try { catalog = JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail(422, 'INVALID_MARKETPLACE', '市场清单不是有效 JSON。'); }
    break;
  }
  if (!catalog || !safeSegment(catalog.name) || !Array.isArray(catalog.plugins)) fail(422, 'INVALID_MARKETPLACE', '未发现有效 marketplace.json（安全的 name、plugins）。');
  const plugins = [];
  for (const entry of catalog.plugins) {
    if (!entry || !safeSegment(entry.name)) fail(422, 'INVALID_MARKETPLACE', '市场插件名称无效。');
    const relative = typeof entry.source === 'string' ? entry.source : entry.source?.source === 'local' ? entry.source.path : undefined;
    if (typeof relative !== 'string' || (relative !== '.' && !relative.startsWith('./'))) fail(422, 'UNSUPPORTED_MARKETPLACE', '初版本地市场仅支持明确的 ./ 相对插件来源。');
    const directory = path.resolve(realRoot, relative);
    if (!inside(realRoot, directory) || !(await exists(directory)) || !inside(realRoot, await fs.realpath(directory))) fail(422, 'MARKETPLACE_BOUNDARY', '市场插件路径缺失、悬空或越出市场根目录。');
    let manifest = {};
    for (const name of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'plugin.json']) if (await exists(path.join(directory, name))) {
      if (!inside(realRoot, await fs.realpath(path.join(directory, name)))) fail(422, 'MARKETPLACE_BOUNDARY', '插件 manifest 链接越出市场根目录。');
      manifest = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')); break;
    }
    if (entry.version !== undefined && manifest.version !== undefined) fail(422, 'VERSION_AUTHORITY', '插件版本在市场和 manifest 中重复声明。');
    if (manifest.version !== undefined && !safeSegment(manifest.version) || entry.version !== undefined && !safeSegment(entry.version)) fail(422, 'INVALID_VERSION', '插件版本必须是安全的单段字符串，不能包含路径。');
    if (entry.strict === false && ['skills', 'commands', 'agents', 'hooks', 'mcpServers'].some(key => key in manifest)) fail(422, 'STRICT_CONFLICT', 'strict:false 与插件 manifest 组件声明冲突。');
    const skillRoots = await discoverSkillRoots(directory, { marketRoot: realRoot, entry });
    const sourceReal = await fs.realpath(directory);
    plugins.push({ id: `${entry.name}@${catalog.name}`, name: entry.name, description: typeof manifest.description === 'string' ? manifest.description : typeof entry.description === 'string' ? entry.description : '', marketplace: catalog.name, sourcePath: directory, version: String(manifest.version ?? entry.version ?? 'local'), installed: false, enabled: false, skillCount: 0, canInstall: true, canRemove: false, canToggle: false, _skillRoots: skillRoots, _componentRoots: skillRoots.map(root => path.relative(sourceReal, root) || '.') });
  }
  return { name: catalog.name, root: realRoot, plugins };
}

export async function readComponentEntry(marketRoot, pluginName, sourcePath) {
  const boundary = await fs.realpath(marketRoot); let catalog;
  for (const relative of ['.agents/plugins/marketplace.json', '.codex-plugin/marketplace.json', '.claude-plugin/marketplace.json', 'marketplace.json']) {
    const file = path.join(boundary, relative); if (!(await exists(file))) continue;
    if (!inside(boundary, await fs.realpath(file))) fail(422, 'MARKETPLACE_BOUNDARY', '市场清单越出来源根。');
    try { catalog = JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail(422, 'INVALID_MARKETPLACE', '市场清单无法解析。'); }
    break;
  }
  const entry = catalog?.plugins?.find(item => item.name === pluginName);
  if (!entry) fail(422, 'COMPONENT_ENTRY_MISSING', '市场中未找到该插件的组件声明。');
  const relative = typeof entry.source === 'string' ? entry.source : entry.source?.source === 'local' ? entry.source.path : undefined;
  if (typeof relative !== 'string' || relative !== '.' && !relative.startsWith('./')) fail(422, 'UNSUPPORTED_COMPONENTS', '该插件不是可核对的本地来源。');
  const expected = path.resolve(boundary, relative);
  if (!inside(boundary, expected) || !inside(boundary, await fs.realpath(expected)) || await fs.realpath(expected) !== await fs.realpath(sourcePath)) fail(422, 'COMPONENT_SOURCE_MISMATCH', 'CLI 插件来源与市场声明不一致。');
  return entry;
}

export async function readPluginManifest(directory, boundary = directory) {
  const realBoundary = await fs.realpath(boundary);
  for (const relative of ['.codex-plugin/plugin.json', 'plugin.json', '.claude-plugin/plugin.json']) {
    const file = path.join(directory, relative); if (!(await exists(file))) continue;
    if (!inside(realBoundary, await fs.realpath(file))) fail(422, 'PLUGIN_BOUNDARY', '插件 manifest 越出来源范围。');
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail(422, 'INVALID_MANIFEST', '插件 manifest 无法解析。'); }
  }
  return {};
}

export async function discoverSkillRoots(directory, { marketRoot = directory, entry = {} } = {}) {
  const boundary = await fs.realpath(marketRoot); const realDirectory = await fs.realpath(directory); let manifest = {};
  if (!inside(boundary, realDirectory)) fail(422, 'PLUGIN_BOUNDARY', '插件目录越出来源范围。');
  for (const relative of ['.codex-plugin/plugin.json', 'plugin.json', '.claude-plugin/plugin.json']) {
    const file = path.join(directory, relative); if (!(await exists(file))) continue;
    if (!inside(boundary, await fs.realpath(file))) fail(422, 'PLUGIN_BOUNDARY', '插件 manifest 越出来源范围。');
    try { manifest = JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail(422, 'INVALID_MANIFEST', '插件 manifest 不是有效 JSON。'); }
    break;
  }
  if (entry.strict === false && ['skills', 'commands', 'agents', 'hooks', 'mcpServers'].some(key => key in manifest)) fail(422, 'STRICT_CONFLICT', 'strict:false 与 manifest 组件声明冲突。');
  const validate = value => {
    if (value === undefined) return [];
    const values = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(values) || !values.every(item => typeof item === 'string' && (item === '.' || item.startsWith('./') && item.length > 2))) fail(422, 'UNSUPPORTED_COMPONENTS', 'skills 组件路径必须是 . 或 ./ 相对路径数组。');
    return values;
  };
  const manifestPaths = validate(manifest.skills); const entryPaths = validate(entry.skills);
  let relativePaths = ['skills', ...manifestPaths, ...entryPaths];
  if (entry.strict === false) relativePaths = ['skills', ...entryPaths];
  // Repository root entries with explicit existing subdirectories restrict discovery.
  if (realDirectory === boundary && entryPaths.length && !entryPaths.some(value => ['.', './', './skills', './skills/'].includes(value))) {
    const existing = [];
    for (const value of entryPaths) if (await exists(path.resolve(directory, value))) existing.push(value);
    if (existing.length) relativePaths = existing;
  }
  const roots = [];
  for (const relative of relativePaths) {
    const absolute = path.resolve(realDirectory, relative);
    if (!inside(boundary, absolute)) fail(422, 'PLUGIN_BOUNDARY', '技能组件路径越出市场根目录。');
    if (!(await exists(absolute))) continue;
    if (!inside(boundary, await fs.realpath(absolute))) fail(422, 'PLUGIN_BOUNDARY', '技能组件链接越出市场根目录。');
    if (!roots.includes(absolute)) roots.push(absolute);
  }
  return roots;
}
