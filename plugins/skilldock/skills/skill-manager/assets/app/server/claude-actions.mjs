// SPDX-License-Identifier: AGPL-3.0-only
// Claude plugin and marketplace writes (HLD 3.3, 3.5; API-SDX-001 36c §7). Every write
// takes the Claude lock, re-reads Claude and compares the object's revision, asks for
// confirmation where the native rules say so, runs one whitelisted command and reads the
// result back from Claude's own lists.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError, fail } from './errors.mjs';
import { acquireFileLock, operationLock } from './process-lock.mjs';
import { localSettingsExposure, excludeLocalSettings } from './local-settings.mjs';

export const CLAUDE_WRITES = new Set(['plugin.toggle', 'plugin.previewMarketplace', 'plugin.install', 'plugin.remove', 'marketplace.add', 'marketplace.refresh', 'marketplace.remove']);
// Whole sentences per case, so that each translates as one message.
const SETTINGS = { user: '用户设置', project: '项目共享设置', local: '项目本地设置' };
const RELOAD_NOTE = '新会话生效，已打开的会话需要重载插件。';
const INSTALLED = { user: name => `已为当前用户安装 Claude 插件 ${name}。`, local: name => `已在当前项目中安装 Claude 插件 ${name}，只给你自己使用。`, project: name => `已在当前项目中为所有协作者安装 Claude 插件 ${name}。` };
const RELOAD = { kind: 'reload', message: '新会话生效；已打开的 Claude 会话需要重载插件（/reload-plugins）。' };
const SHARED = { kind: 'scope', message: '这会改动协作者共享的 .claude/settings.json。' };
const needConfirmation = (message, nativeRules) => { throw new AppError(409, 'CONFIRMATION_REQUIRED', message, { nativeRules }); };
const isDirectory = directory => fs.stat(directory).then(stat => stat.isDirectory(), () => false);
const real = directory => fs.realpath(directory).catch(() => path.resolve(directory));
// The identity Claude's command line uses: <name>@<marketplace>.
const cliId = plugin => `${plugin.name}@${plugin.marketplace}`;

/**
 * @param {object} deps
 * @param {() => Promise<{ configDir: string }>} deps.root  The Claude root, for the lock.
 * @param {() => Promise<{ claude: object, claudeRoot: object, cli: object, project: string }>} deps.read
 *   A fresh read of Claude (never cached) and the current project.
 * @param {(state: object) => (args: string[], options: { cwd: string }) => Promise<object>} deps.writer
 * @param {(entry: object) => Promise<void>} deps.journal  Appends an activity record.
 * @param {(directory: string, args: string[]) => Promise<string>} [deps.git]
 */
export function createClaudeActions({ root, read, writer, journal, git, now = () => new Date().toISOString() }) {
  const gitOptions = git ? { git } : {};
  function find(list, id, label) {
    const object = list.find(item => item.id === id);
    if (!object) fail(404, 'NOT_FOUND', label === 'plugin' ? '未找到这个 Claude 插件，请刷新后重试。' : '未找到这个 Claude marketplace，请刷新后重试。');
    return object;
  }
  // 36c 7.1: a single existing object is written only against the revision the page showed.
  function checkRevision(object, request) {
    if (!request.expectedRevision || request.expectedRevision !== object.revision) fail(409, 'SNAPSHOT_STALE', 'Claude 中已有改动，请刷新后重试。');
  }
  async function projectFor(directory) {
    if (!directory) fail(422, 'PROJECT_PATH_MISSING', '这条安装的项目目录未知，暂不能修改。');
    if (!await isDirectory(directory)) fail(422, 'PROJECT_PATH_MISSING', `项目目录 ${directory} 不存在，这条安装只读。`);
    return directory;
  }
  // Project-shared settings need the user's confirmation; a new local settings file inside a
  // Git repository that does not ignore it needs the user's choice about .git/info/exclude.
  async function scopeChecks(scope, cwd, request, rules) {
    if (scope === 'project' && !request.confirm) needConfirmation('写入项目共享设置会改动协作者共享的 .claude/settings.json，请确认后重试。', [SHARED, ...rules]);
    if (scope !== 'local') return null;
    const exposure = await localSettingsExposure(cwd, gitOptions);
    if (exposure && typeof request.gitExclude !== 'boolean')
      needConfirmation(`这次会新建 ${exposure.relative}，它不在 Git 的忽略规则中；请选择是否把它写入本机的 .git/info/exclude。`,
        [{ kind: 'scope', message: '项目本地设置只属于你；不忽略它可能被误提交。写入 .git/info/exclude 只影响本机，不改动受版本管理的 .gitignore。', items: [exposure.relative] }, ...rules]);
    return exposure;
  }
  async function afterLocal(exposure, request) {
    if (!exposure) return '';
    if (!request.gitExclude) return `\n${exposure.relative} 不在 Git 的忽略规则中，注意不要提交它。`;
    if (!await fs.lstat(exposure.file).then(() => true, () => false)) return '';
    await excludeLocalSettings(exposure, gitOptions);
    return `\n已把 ${exposure.relative} 写入本机的 .git/info/exclude。`;
  }
  const readbackFailed = message => fail(502, 'READBACK_FAILED', message);

  const handlers = {
    async 'plugin.toggle'(request, state, run) {
      const plugin = find(state.claude.plugins, request.id, 'plugin');
      if (!plugin.installed) fail(404, 'NOT_FOUND', '这个 Claude 插件尚未安装。');
      if (!plugin.canToggle) fail(403, plugin.protection ? 'HOST_MANAGED' : 'PROTECTED_PLUGIN', plugin.reason || '这个插件不支持切换。');
      checkRevision(plugin, request);
      // Default: an installation for the user is switched for the user; one in a project (and a
      // project skills-directory plugin, whose key has no directory) in that project's local
      // settings, so that no other project with the same plugin is affected (HLD 3.3).
      const installScope = plugin.installation?.scope ?? 'user';
      const scope = request.scope ?? (installScope === 'user' ? 'user' : 'local');
      const home = plugin.installation?.projectPath ?? (plugin.installation?.skillsDir ? path.dirname(path.dirname(plugin.installation.skillsDir)) : undefined);
      const cwd = scope === 'user' ? state.project : await projectFor(installScope === 'user' ? state.project : home);
      const exposure = await scopeChecks(scope, cwd, request, [RELOAD]);
      await run(['plugin', request.enabled ? 'enable' : 'disable', cliId(plugin), '--scope', scope, '--json'], { cwd });
      const after = (await read()).claude.plugins.find(item => item.id === plugin.id);
      if (!after || after.enabled !== request.enabled) readbackFailed('Claude 命令行已返回，但读回的启用状态与预期不同：可能由更高层级的设置决定，请刷新核实。');
      return { message: `已在${SETTINGS[scope]}中${request.enabled ? '启用' : '停用'} Claude 插件 ${plugin.name}。${RELOAD_NOTE}${await afterLocal(exposure, request)}`,
        needsReload: true, agent: 'claude', target: plugin.name };
    },
    async 'plugin.previewMarketplace'(request, state) {
      const plugin = find(state.claude.plugins, request.id, 'plugin');
      if (plugin.installed || !plugin.canInstall) fail(403, 'PROTECTED_PLUGIN', plugin.reason || '这个插件不能在这里安装。');
      const market = state.claude.marketplaces.find(item => item.name === plugin.marketplace);
      return { message: '插件安装预览已就绪。', agent: 'claude', pluginPreview: {
        agent: 'claude', id: `claude-preview:${plugin.id}`, name: plugin.name, version: plugin.version || '', description: plugin.description || '', source: plugin.marketplace,
        sourceType: ['directory', 'file'].includes(market?.type) ? 'local' : 'git', marketplace: plugin.marketplace, pluginId: plugin.id,
        scopes: ['user', 'local', 'project'], defaultScope: 'user', skills: [], skillDetails: [], canSelectSkills: false, components: [], duplicates: [],
        nativeRules: [{ kind: 'scope', message: '可以安装给当前用户（默认）、只在当前项目中给你自己用（本地设置），或给项目的所有协作者（共享设置，需要确认）。' }, RELOAD] } };
    },
    async 'plugin.install'(request, state, run) {
      if (request.enabledSkills !== undefined) fail(422, 'UNSUPPORTED_FOR_AGENT', 'Claude 插件不能只启用部分技能。');
      const plugin = find(state.claude.plugins, request.id, 'plugin');
      if (plugin.installed || !plugin.canInstall) fail(403, 'PROTECTED_PLUGIN', plugin.reason || '这个插件不能在这里安装。');
      checkRevision(plugin, request);
      const scope = request.scope ?? 'user';
      const cwd = scope === 'user' ? state.project : await projectFor(state.project);
      const exposure = await scopeChecks(scope, cwd, request, [RELOAD]);
      await run(['plugin', 'install', cliId(plugin), '--scope', scope, '--json'], { cwd });
      const project = scope === 'user' ? null : await real(cwd);
      const installed = await Promise.all((await read()).claude.plugins.filter(item => item.installed && cliId(item) === cliId(plugin) && item.installation?.scope === scope)
        .map(async item => ({ item, project: item.installation.projectPath ? await real(item.installation.projectPath) : null })));
      if (!installed.some(entry => entry.project === project)) readbackFailed('Claude 命令行已返回，但读回的插件清单中没有这次安装，请刷新核实。');
      return { message: `${INSTALLED[scope](plugin.name)}${RELOAD_NOTE}${await afterLocal(exposure, request)}`,
        needsReload: true, agent: 'claude', target: plugin.name };
    },
    async 'plugin.remove'(request, state, run) {
      const plugin = find(state.claude.plugins, request.id, 'plugin');
      if (!plugin.installed || !plugin.canRemove) fail(403, plugin.protection ? 'HOST_MANAGED' : 'PROTECTED_PLUGIN', plugin.reason || '这个插件不能在这里卸载。');
      checkRevision(plugin, request);
      const scope = plugin.installation.scope;
      const rules = [
        ...(request.keepData ? [] : [{ kind: 'data-removal', message: '卸载默认删除插件数据（~/.claude/plugins/data 中该插件的目录）；可以选择保留。' }]),
        ...(scope === 'project' ? [SHARED] : []), RELOAD];
      if (!request.confirm) needConfirmation(`卸载 Claude 插件 ${plugin.name} 前需要确认。`, rules);
      const cwd = scope === 'user' ? state.project : await projectFor(plugin.installation.projectPath);
      await run(['plugin', 'uninstall', cliId(plugin), '--scope', scope, ...(request.keepData ? ['--keep-data'] : []), '--json'], { cwd });
      if ((await read()).claude.plugins.some(item => item.id === plugin.id && item.installed)) readbackFailed('Claude 命令行已返回，但插件仍在已安装清单中，请刷新核实。');
      return { message: `已卸载 Claude 插件 ${plugin.name}${request.keepData ? '，插件数据已保留' : ''}。${RELOAD_NOTE}`, needsReload: true, agent: 'claude', target: plugin.name, nativeRules: rules };
    },
    async 'marketplace.add'(request, state, run) {
      if (request.ref !== undefined) fail(422, 'UNSUPPORTED_FOR_AGENT', 'Claude 的 marketplace 不能在这里指定 Git ref；请在 Claude Code 中添加。');
      const scope = request.scope ?? 'user';
      const cwd = scope === 'user' ? state.project : await projectFor(state.project);
      const exposure = await scopeChecks(scope, cwd, request, []);
      const before = new Set(state.claude.marketplaces.map(item => item.name));
      await run(['plugin', 'marketplace', 'add', request.source, '--scope', scope, '--json'], { cwd });
      const added = (await read()).claude.marketplaces.filter(item => !before.has(item.name));
      if (added.length !== 1) readbackFailed(added.length ? 'Claude 中同时出现了多个新的 marketplace，请刷新核实。' : 'Claude 命令行已返回，但读回的清单中没有新的 marketplace；它可能已经存在，请刷新核实。');
      return { message: `已在 Claude 中添加 marketplace ${added[0].name}，可以浏览并安装其中的插件。${await afterLocal(exposure, request)}`, agent: 'claude', target: added[0].name };
    },
    async 'marketplace.refresh'(request, state, run) {
      const market = find(state.claude.marketplaces, request.id, 'marketplace');
      if (!market.canRefresh) fail(403, 'PROTECTED_MARKETPLACE', market.reason || '这个 marketplace 不能刷新。');
      checkRevision(market, request);
      await run(['plugin', 'marketplace', 'update', market.name, '--json'], { cwd: state.project });
      if (!(await read()).claude.marketplaces.some(item => item.id === market.id)) readbackFailed('Claude 命令行已返回，但读回的清单中没有这个 marketplace，请刷新核实。');
      return { message: `已刷新 Claude 的 marketplace ${market.name}；这不表示已安装的插件已经更新。`, agent: 'claude', target: market.name };
    },
    async 'marketplace.remove'(request, state, run) {
      const market = find(state.claude.marketplaces, request.id, 'marketplace');
      if (!market.canRemove) fail(403, 'PROTECTED_MARKETPLACE', market.reason || '这个 marketplace 不能移除。');
      // The revision covers the plugins installed from it, so the list confirmed is the list removed (36c 7.3).
      checkRevision(market, request);
      const affected = [...new Set(state.claude.plugins.filter(item => item.installed && item.marketplace === market.name).map(item => item.name))].sort();
      const rules = [{ kind: 'affected-plugins', message: affected.length ? '移除后，从它安装的这些插件也会被卸载：' : '没有从它安装的插件。', ...(affected.length ? { items: affected } : {}) }, ...(affected.length ? [RELOAD] : [])];
      if (!request.confirm) needConfirmation(`移除 Claude 的 marketplace ${market.name} 前需要确认。`, rules);
      await run(['plugin', 'marketplace', 'remove', market.name, '--json'], { cwd: state.project });
      if ((await read()).claude.marketplaces.some(item => item.id === market.id)) readbackFailed('Claude 命令行已返回，但这个 marketplace 仍在清单中，请刷新核实。');
      return { message: `已从 Claude 中移除 marketplace ${market.name}${affected.length ? `，并卸载了从它安装的 ${affected.length} 个插件` : ''}。`, ...(affected.length ? { needsReload: true } : {}), agent: 'claude', target: market.name, nativeRules: rules };
    },
  };

  return async function claudeAction(request) {
    const handler = handlers[request.action];
    if (!handler) fail(422, 'UNSUPPORTED_FOR_AGENT', '这一版 SkillDock 还不能在 Claude 中执行这个操作。');
    // DEC-SDX-010: the Claude lock comes after the instance and Codex locks the caller holds;
    // taking it never creates the Claude root. Claude is read afresh under it.
    const { configDir } = await root();
    const release = await isDirectory(configDir) ? acquireFileLock(operationLock(configDir)) : () => {};
    const id = crypto.randomUUID();
    try {
      const state = await read();
      const result = await handler(request, state, writer(state));
      const { target, ...visible } = result;
      if (request.action !== 'plugin.previewMarketplace') await journal({ id, action: request.action, agent: 'claude', target: target ?? request.id ?? request.source, createdAt: now(), status: 'success', message: visible.message, canRestore: false });
      return visible;
    } catch (error) {
      if (!['CONFIRMATION_REQUIRED', 'SNAPSHOT_STALE', 'NOT_FOUND'].includes(error.code) && request.action !== 'plugin.previewMarketplace')
        await journal({ id, action: request.action, agent: 'claude', target: request.id ?? request.source, createdAt: now(), status: 'error', message: error.message, reasonCode: error.code || 'OPERATION_FAILED', canRestore: false }).catch(() => {});
      throw error;
    } finally { release(); }
  };
}
