// SPDX-License-Identifier: AGPL-3.0-only
// Claude plugin and marketplace writes (HLD 3.3, 3.5; API-SDX-001 36c §7). Every write
// takes the Claude lock, re-reads Claude and compares the object's revision, asks for
// confirmation where the native rules say so, runs one whitelisted command and reads the
// result back from Claude's own lists.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError, fail, redact } from './errors.mjs';
import { acquireFileLock, operationLock } from './process-lock.mjs';
import { localSettingsExposure, excludeLocalSettings } from './local-settings.mjs';
import { patchClaudeSetting } from './claude-settings.mjs';

export const CLAUDE_WRITES = new Set(['skill.toggle', 'plugin.toggle', 'plugin.previewMarketplace', 'plugin.install', 'plugin.remove', 'marketplace.add', 'marketplace.refresh', 'marketplace.remove']);
// Whole sentences per case, so that each translates as one message.
const SETTINGS = { user: '用户设置', project: '项目共享设置', local: '项目本地设置' };
const RELOAD_NOTE = '新会话生效，已打开的会话需要重载插件。';
// A middle visibility is the user's own choice in Claude: turning it on or off drops it.
const MIDDLE = {
  'name-only': { true: '这个技能当前为“仅显示名称”；设为可见后，这一档会被取消。', false: '这个技能当前为“仅显示名称”；关闭后，这一档会被取消。' },
  'user-invocable-only': { true: '这个技能当前为“仅用户调用”；设为可见后，这一档会被取消。', false: '这个技能当前为“仅用户调用”；关闭后，这一档会被取消。' },
};
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
  // A user-scope write runs from the current project if it still exists, else from Claude's home (4a review P3-02).
  const userCwd = async state => await isDirectory(state.project) ? state.project : path.dirname(state.claudeRoot.configDir);
  let targetName;
  function find(list, id, label) {
    const object = list.find(item => item.id === id);
    if (object) targetName = object.name;
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
    // HLD 3.4: a Claude skill's visibility is an entry in a settings file; Claude has no command for it.
    async 'skill.toggle'(request, state) {
      // The Claude side of a skill both Agents share is switched by 4c (36c §6); its ID is Codex's.
      if (!request.id.startsWith('claude:')) fail(422, 'UNSUPPORTED_FOR_AGENT', '两侧共用的技能在 Claude 一侧的切换随后续版本提供。');
      const skill = state.claude.skills.find(item => item.id === request.id);
      if (!skill) fail(404, 'NOT_FOUND', '未找到这个 Claude 技能，请刷新后重试。');
      targetName = skill.name;
      if (!skill.canToggle) fail(403, skill.protection ? 'HOST_MANAGED' : 'PROTECTED_SKILL', skill.reason || '这个技能不支持切换。');
      checkRevision(skill, request);
      const value = request.enabled ? 'on' : 'off';
      // Default layer: a personal skill in user settings, unless the project's settings decide
      // it now (local beats project and user, and is not shared); a project skill in local settings.
      const decided = skill.enablement?.decidedBy;
      const layer = request.scope ?? (skill.scope === 'user' && !['local', 'project'].includes(decided) ? 'user' : 'local');
      // Every rule the change touches is confirmed at once (4b review P2-01): a middle tier that
      // is dropped, the shared project settings, and other skills with the same name, which
      // share the entry (P3-03).
      const sameName = state.claude.skills.filter(item => item.name === skill.name && item.id !== skill.id);
      const rules = [
        ...(MIDDLE[skill.visibility] ? [{ kind: 'visibility', message: MIDDLE[skill.visibility][request.enabled] }] : []),
        ...(sameName.length ? [{ kind: 'visibility', message: '同名的其他 Claude 技能共用这一可见性条目，会一并改变：', items: sameName.map(item => item.path) }] : []),
        ...(layer === 'project' ? [SHARED] : []),
      ];
      if (rules.length && !request.confirm) needConfirmation('修改这个技能的可见性前需要确认。', [...rules, RELOAD]);
      const project = layer === 'user' ? null : await projectFor(state.project);
      const exposure = await scopeChecks(layer, project ?? state.project, { ...request, confirm: true }, [...rules, RELOAD]);
      const file = layer === 'user' ? path.join(state.claudeRoot.configDir, 'settings.json') : path.join(project, '.claude', layer === 'project' ? 'settings.json' : 'settings.local.json');
      // The decision above came from an earlier read: the entry as the patch reads it must still
      // agree (P3-02), and a middle tier in this very file is never dropped unasked (P3-08).
      const expected = decided === layer ? { enabled: 'on', disabled: 'off' }[skill.visibility] ?? skill.visibility : undefined;
      const patch = await patchClaudeSetting(file, 'skillOverrides', skill.name, value, { beforeWrite: previous => {
        if (expected !== undefined && (previous ?? 'on') !== expected) fail(409, 'SNAPSHOT_STALE', 'Claude 中已有改动，请刷新后重试。');
        if (['name-only', 'user-invocable-only'].includes(previous) && !request.confirm)
          needConfirmation('修改这个技能的可见性前需要确认。', [{ kind: 'visibility', message: MIDDLE[previous][request.enabled] }, RELOAD]);
      } });
      const restore = { kind: 'claude-visibility', file: patch.file, section: 'skillOverrides', key: skill.name, previous: patch.previous ?? null, created: patch.created };
      const after = (await read()).claude.skills.find(item => item.id === skill.id);
      if (!after || after.visibility !== (request.enabled ? 'enabled' : 'disabled'))
        throw Object.assign(new AppError(502, 'READBACK_FAILED', `已写入 ${file}，但读回的可见性与预期不同：可能由更高层级的设置决定，请刷新核实。`), { restore });
      const where = layer === 'user' ? '' : `\n设置文件：${path.relative(state.project, file)}`;
      return { message: `已在${SETTINGS[layer]}中把 Claude 技能 ${skill.name} 设为${request.enabled ? '可见' : '关闭'}。新会话生效。${where}${await afterLocal(exposure, request)}`,
        needsReload: true, agent: 'claude', target: skill.name, ...(rules.length ? { nativeRules: rules } : {}), restore };
    },
    async 'plugin.toggle'(request, state, run) {
      const plugin = find(state.claude.plugins, request.id, 'plugin');
      if (!plugin.installed) fail(404, 'NOT_FOUND', '这个 Claude 插件尚未安装。');
      if (plugin.installation?.readOnlyReason) fail(422, 'PROJECT_PATH_MISSING', plugin.installation.readOnlyReason);
      if (!plugin.canToggle) fail(403, plugin.protection ? 'HOST_MANAGED' : 'PROTECTED_PLUGIN', plugin.reason || '这个插件不支持切换。');
      checkRevision(plugin, request);
      // Default: an installation for the user is switched for the user; one in a project (and a
      // project skills-directory plugin, whose key has no directory) in that project's local
      // settings, so that no other project with the same plugin is affected (HLD 3.3).
      // A user installation that the project's own settings decide now is switched in the local
      // settings too: the user settings would not take effect here and would change every other
      // project (4a review P2-01). A project skills-directory plugin, which may sit in a parent
      // directory, is switched in the current project (P3-06).
      const installScope = plugin.installation?.scope ?? 'user';
      const decided = plugin.enablement?.decidedBy;
      const scope = request.scope ?? (installScope === 'user' && !['local', 'project'].includes(decided) ? 'user' : 'local');
      const home = plugin.installation?.projectPath ?? state.project;
      const cwd = scope === 'user' ? await userCwd(state) : await projectFor(installScope === 'user' ? state.project : home);
      const exposure = await scopeChecks(scope, cwd, request, [RELOAD]);
      await run(['plugin', request.enabled ? 'enable' : 'disable', cliId(plugin), '--scope', scope, '--json'], { cwd });
      const after = (await read()).claude.plugins.find(item => item.id === plugin.id);
      if (!after || after.enabled !== request.enabled) readbackFailed(`已写入${SETTINGS[scope]}，但读回的启用状态与预期不同：可能由更高层级的设置决定，请刷新核实。`);
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
      const cwd = scope === 'user' ? await userCwd(state) : await projectFor(state.project);
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
      if (plugin.installed && plugin.installation?.readOnlyReason) fail(422, 'PROJECT_PATH_MISSING', plugin.installation.readOnlyReason);
      if (!plugin.installed || !plugin.canRemove) fail(403, plugin.protection ? 'HOST_MANAGED' : 'PROTECTED_PLUGIN', plugin.reason || '这个插件不能在这里卸载。');
      checkRevision(plugin, request);
      const scope = plugin.installation.scope;
      const rules = [
        ...(request.keepData ? [] : [{ kind: 'data-removal', message: '卸载默认删除插件数据（~/.claude/plugins/data 中该插件的目录）；可以选择保留。' }]),
        ...(scope === 'project' ? [SHARED] : []), RELOAD];
      if (!request.confirm) needConfirmation(`卸载 Claude 插件 ${plugin.name} 前需要确认。`, rules);
      const cwd = scope === 'user' ? await userCwd(state) : await projectFor(plugin.installation.projectPath);
      await run(['plugin', 'uninstall', cliId(plugin), '--scope', scope, ...(request.keepData ? ['--keep-data'] : []), '--json'], { cwd });
      if ((await read()).claude.plugins.some(item => item.id === plugin.id && item.installed)) readbackFailed('Claude 命令行已返回，但插件仍在已安装清单中，请刷新核实。');
      return { message: `已卸载 Claude 插件 ${plugin.name}${request.keepData ? '，插件数据已保留' : ''}。${RELOAD_NOTE}`, needsReload: true, agent: 'claude', target: plugin.name, nativeRules: rules };
    },
    async 'marketplace.add'(request, state, run) {
      if (request.ref !== undefined) fail(422, 'UNSUPPORTED_FOR_AGENT', 'Claude 的 marketplace 不能在这里指定 Git ref；请在 Claude Code 中添加。');
      const scope = request.scope ?? 'user';
      const cwd = scope === 'user' ? await userCwd(state) : await projectFor(state.project);
      const exposure = await scopeChecks(scope, cwd, request, []);
      const before = new Set(state.claude.marketplaces.map(item => item.name));
      await run(['plugin', 'marketplace', 'add', request.source, '--scope', scope, '--json'], { cwd });
      const added = (await read()).claude.marketplaces.filter(item => !before.has(item.name));
      if (added.length !== 1) readbackFailed(added.length ? 'Claude 中同时出现了多个新的 marketplace，请刷新核实。' : 'Claude 命令行已返回，但读回的清单中没有新的 marketplace；它可能已经存在，请刷新核实。');
      return { message: `已在 Claude 中添加 marketplace ${added[0].name}，可以浏览并安装其中的插件。${await afterLocal(exposure, request)}`, agent: 'claude', target: added[0].name };
    },
    async 'marketplace.refresh'(request, state, run) {
      const market = find(state.claude.marketplaces, request.id, 'marketplace');
      if (!market.canRefresh) fail(403, market.protection ? 'HOST_MANAGED' : 'PROTECTED_MARKETPLACE', market.reason || '这个 marketplace 不能刷新。');
      checkRevision(market, request);
      await run(['plugin', 'marketplace', 'update', market.name, '--json'], { cwd: await userCwd(state) });
      if (!(await read()).claude.marketplaces.some(item => item.id === market.id)) readbackFailed('Claude 命令行已返回，但读回的清单中没有这个 marketplace，请刷新核实。');
      return { message: `已刷新 Claude 的 marketplace ${market.name}；这不表示已安装的插件已经更新。`, agent: 'claude', target: market.name };
    },
    async 'marketplace.remove'(request, state, run) {
      const market = find(state.claude.marketplaces, request.id, 'marketplace');
      if (!market.canRemove) fail(403, market.protection ? 'HOST_MANAGED' : 'PROTECTED_MARKETPLACE', market.reason || '这个 marketplace 不能移除。');
      // The revision covers the plugins installed from it, so the list confirmed is the list removed (36c 7.3).
      checkRevision(market, request);
      const installs = state.claude.plugins.filter(item => item.installed && item.marketplace === market.name);
      const affected = [...new Set(installs.map(item => item.name))].sort();
      // Claude removes the declaration from every settings layer, and uninstalls what came from
      // it: the shared project settings change when they declare it or hold such an installation (4a review P1-01).
      const shared = (state.claude.declarations?.[market.name] ?? []).includes('project') || installs.some(item => item.installation?.scope === 'project');
      const rules = [{ kind: 'affected-plugins', message: affected.length ? '移除后，从它安装的这些插件也会被卸载：' : '没有从它安装的插件。', ...(affected.length ? { items: affected } : {}) },
        ...(shared ? [{ kind: 'scope', message: '这会改动协作者共享的 .claude/settings.json：其中这个 marketplace 的声明或从它安装的插件条目会被删除。' }] : []), ...(affected.length ? [RELOAD] : [])];
      if (!request.confirm) needConfirmation(`移除 Claude 的 marketplace ${market.name} 前需要确认。`, rules);
      await run(['plugin', 'marketplace', 'remove', market.name, '--json'], { cwd: state.project });
      const after = await read();
      if (after.claude.marketplaces.some(item => item.id === market.id)) readbackFailed('Claude 命令行已返回，但这个 marketplace 仍在清单中，请刷新核实。');
      // Say only what the readback shows (P3-04).
      const remaining = installs.filter(item => after.claude.plugins.some(other => other.id === item.id && other.installed)).length;
      const removed = installs.length - remaining;
      return { message: `已从 Claude 中移除 marketplace ${market.name}${removed ? `，并卸载了从它安装的 ${removed} 个插件` : ''}。${remaining ? `\n仍有 ${remaining} 个从它安装的插件留在 Claude 中，请在插件页核实。` : ''}`,
        ...(removed ? { needsReload: true } : {}), agent: 'claude', target: market.name, nativeRules: rules };
    },
  };

  return async function claudeAction(request) {
    const handler = handlers[request.action];
    if (!handler) fail(422, 'UNSUPPORTED_FOR_AGENT', '这一版 SkillDock 还不能在 Claude 中执行这个操作。');
    // DEC-SDX-010: the Claude lock comes after the instance and Codex locks the caller holds;
    // taking it never creates the Claude root. Claude is read afresh under it.
    targetName = undefined;
    const { configDir } = await root();
    const release = await isDirectory(configDir) ? acquireFileLock(operationLock(configDir)) : () => {};
    const id = crypto.randomUUID();
    try {
      const state = await read();
      // The checks before the lock may be stale: an unconfirmed Claude is never written (4a review P3-05).
      if (state.claude.unconfirmed) fail(409, 'AGENT_UNCONFIRMED', state.claude.unconfirmed);
      const result = await handler(request, state, writer(state));
      // `restore` holds only the entry an undo needs; it never reaches a snapshot.
      const { target, restore, ...visible } = result;
      if (request.action !== 'plugin.previewMarketplace') await journal({ id, action: request.action, agent: 'claude', target: target ?? request.id ?? request.source, createdAt: now(), status: 'success', message: visible.message, canRestore: false, ...(restore ? { restore } : {}) });
      return visible;
    } catch (error) {
      if (!['CONFIRMATION_REQUIRED', 'SNAPSHOT_STALE', 'NOT_FOUND'].includes(error.code) && request.action !== 'plugin.previewMarketplace')
        await journal({ id, action: request.action, agent: 'claude', target: targetName ?? request.id ?? request.source, createdAt: now(), status: 'error', message: redact(error.message), reasonCode: error.code || 'OPERATION_FAILED', canRestore: false, ...(error.restore ? { restore: error.restore } : {}) }).catch(() => {});
      throw error;
    } finally { release(); }
  };
}
