import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createIconCatalog } from './provider-icons.mjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppError, fail, exists, inside, identity, hash, now, metadata, inspectTree, copySkill, objectFingerprint, diffFiles, readJson, writeJson, safeName, safeSegment, redact, captureDirectoryRoot, verifyDirectoryRoot, verifyDescendantDirectory, publicSource } from './files.mjs';
import { toggleConfig, toggleSkillConfigs, readConfig } from './config.mjs';
import { CodexAdapter, listCovers, validateSource, validateSubpath, validateRef, checkoutGit, readMarketplace, readComponentEntry, readPluginManifest, readPluginDefinition, discoverSkillRoots } from './cli.mjs';
import { initializeSandbox, emptyRegistry } from './fixtures.mjs';
import { scan, sandboxCatalog, rootsFor } from './scanner.mjs';
import { pluginCacheRoot, pluginPath, verifyPluginPath, protectedRoots, skillLocation } from './paths.mjs';
import { moveObject } from './move.mjs';
import { enrichSources, buildUpdateItems, targetKey } from './sources.mjs';
import { createScheduler, validateTarget, validateSchedule } from './scheduler.mjs';
import { resolveProject, projectContext, validateProjectPath } from './project-context.mjs';
import { githubDirectory } from './git-source.mjs';
import { previewFileDiff } from './preview-diff.mjs';
import { normalizeTags, tagKey, enrichTags } from './tags.mjs';
import { acquireFileLock, operationLock, isOperationActive } from './process-lock.mjs';
import { instanceLock } from './state-locks.mjs';
import { createBackgroundManager, backgroundPaths } from './background.mjs';
import { readGeneration, CURRENT_GENERATION } from './generation.mjs';
import { projectCatalog, createProjectIntegration } from './projects.mjs';
import { inspectPlugin, directLocation, writeDirectMarketplace, decorateDirectCatalog, inspectClaudePlugin, claudeDirectLocation, writeClaudeDirectMarketplace, decorateClaudeDirect, ownClaudeDirect, claudeDirectRoot } from './direct-plugins.mjs';
import { localSettingsExposure, excludeLocalSettings } from './local-settings.mjs';
import { pluginContents } from './plugin-contents.mjs';
import { officialAppUrl } from './app-directory.mjs';
import { createDirectoryIcons } from './directory-icons.mjs';
import { createAgentLayer, readManagement, writeManagement, AGENT_NAME } from './agents.mjs';
import { claudeCatalog, claudeIds, claudeLists } from './claude-catalog.mjs';
import { INSTALL_SKIP, marketplaceEntry, pluginSource, OWNER_REASON, stageCandidate, predictVersion, checkOutcome, copyInstallation, localDirectory, defaultFetchers } from './claude-plugin-updates.mjs';
import { claudeWriter } from './claude-writer.mjs';
import { createClaudeActions, CLAUDE_WRITES } from './claude-actions.mjs';
import { mergeClaude, markReadOnly } from './multi-agent.mjs';
import { claudeUpdateItems, claudeLedSkills } from './claude-updates.mjs';
import { writeClaudeRoot } from './claude-root.mjs';
import { inspectNode, findNpm, resolveToolchain } from './toolchain.mjs';
import { writeSavedNode } from './node-candidates.mjs';

const ACTION_FIELDS = {
  'tags.set': ['target', 'tags'],
  'skill.previewRemoval': ['ids', 'groupName'], 'skill.removeSelected': ['previewId'],
  'preview.diff': ['previewId', 'path'],
  'project.select': ['projectDir'],
  'project.chooseDirectory': ['projectDir'],
  'skill.toggle': ['id', 'enabled'], 'skill.previewInstall': ['sourceType', 'source', 'subpath', 'ref', 'name'],
  'skill.install': ['previewId'], 'skill.checkUpdate': ['id'], 'skill.update': ['id', 'previewId'],
  'skill.remove': ['id'], 'activity.restore': ['id'], 'plugin.install': ['id', 'previewId', 'enabledSkills'], 'plugin.remove': ['id'],
  'plugin.previewInstall': ['sourceType', 'source', 'subpath', 'ref'], 'plugin.installSource': ['previewId', 'enabledSkills'],
  'plugin.previewMarketplace': ['id'],
  'plugin.connectionStatus': ['id'],
  'plugin.toggle': ['id', 'enabled'], 'marketplace.add': ['sourceType', 'source', 'ref'],
  'marketplace.refresh': ['id'], 'marketplace.remove': ['id'],
  'skill.previewSource': ['id', 'sourceType', 'source', 'subpath', 'ref'], 'skill.connectSource': ['id', 'previewId'],
  'update.check': ['target'], 'update.apply': ['target', 'previewId'], 'updates.run': ['targets', 'autoApply'], 'schedule.configure': ['schedule'],
  'agent.setManagement': ['management'], 'agent.updateSkilldock': [], 'settings.setClaudeRoot': ['claudeRoot'], 'settings.setNodePath': ['nodePath'], 'settings.redetectNode': [],
};
// Actions that change an Agent's skills, plugins or marketplaces: they edit its files or
// configuration, or run a mutating command (plugin add/remove, marketplace add/upgrade/remove).
// 36c §5: refused while that environment is read-only. Previews, tags, sources and settings
// change SkillDock's own data only. A plugin update check stays read-only inside
// preparePluginUpdate (it would otherwise upgrade the marketplace and repair the skill
// configuration), and its result cannot be applied.
const HOST_WRITES = new Set(['skill.toggle', 'skill.install', 'skill.update', 'skill.remove', 'skill.removeSelected', 'activity.restore',
  'plugin.install', 'plugin.installSource', 'plugin.remove', 'plugin.toggle', 'marketplace.add', 'marketplace.refresh', 'marketplace.remove', 'update.apply']);
// Global and multi-target actions: `agent` only marks a version-2 request (36c §6).
const AGENT_FLAG_ONLY = new Set(['schedule.configure', 'updates.run', 'skill.previewRemoval', 'skill.removeSelected', 'project.select', 'project.chooseDirectory']);
export const CODEX_READ_ONLY_REASON = 'Codex 环境当前为只读；在 SkillDock 的“Agent 环境”页启用 Codex 管理后才能修改。';
export const CLAUDE_READ_ONLY_REASON = 'Claude 环境当前为只读；在 SkillDock 的“Agent 环境”页启用 Claude 管理后才能修改。';
// Version-2 request fields (36c 7.1); a request without `agent` keeps the 0.10.2 fields only.
const VERSION_2_FIELDS = ['scope', 'confirm', 'gitExclude', 'keepData', 'expectedRevision'];
const validPath = value => typeof value === 'string' && path.isAbsolute(value) && value.length <= 2000 && !/[\x00-\x1f]/.test(value);
export function validateAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'INVALID_ACTION', '请求需要 JSON 对象。');
  if (!['local', 'sandbox'].includes(input.mode)) fail(400, 'INVALID_MODE', '请求的环境无效。');
  const fields = ACTION_FIELDS[input.action];
  if (!fields) fail(400, 'INVALID_ACTION', '不支持该操作。');
  for (const key of Object.keys(input)) if (!['mode', 'action', 'agent', ...fields, ...(input.agent !== undefined ? VERSION_2_FIELDS : [])].includes(key)) fail(400, 'INVALID_ACTION', `该操作不支持参数 ${key}。`);
  if (input.agent !== undefined && !['codex', 'claude'].includes(input.agent)) fail(400, 'INVALID_ACTION', 'agent 只能是 codex 或 claude。');
  if (input.scope !== undefined && !['user', 'project', 'local'].includes(input.scope)) fail(400, 'INVALID_ACTION', 'scope 只能是 user、project 或 local。');
  for (const key of ['confirm', 'gitExclude', 'keepData']) if (input[key] !== undefined && typeof input[key] !== 'boolean') fail(400, 'INVALID_ACTION', `${key} 必须为布尔值。`);
  if (input.expectedRevision !== undefined && (typeof input.expectedRevision !== 'string' || !/^[a-f0-9]{1,64}$/.test(input.expectedRevision))) fail(400, 'INVALID_ACTION', 'expectedRevision 无效。');
  if (input.action.startsWith('agent.') && !input.agent) fail(400, 'INVALID_ACTION', '需要 agent。');
  if (fields.includes('management') && !['enabled', 'read-only'].includes(input.management)) fail(400, 'INVALID_ACTION', 'management 只能是 enabled 或 read-only。');
  if (fields.includes('claudeRoot') && (!input.claudeRoot || typeof input.claudeRoot !== 'object' || Object.keys(input.claudeRoot).some(key => !['configDir', 'pluginCacheDir'].includes(key))
    || !validPath(input.claudeRoot.configDir) || !validPath(input.claudeRoot.pluginCacheDir))) fail(400, 'INVALID_PATH', 'Claude 根目录需要配置目录与插件缓存目录的绝对路径。');
  if (fields.includes('nodePath') && !validPath(input.nodePath)) fail(400, 'INVALID_PATH', '需要 Node 的绝对路径。');
  for (const field of ['id', 'previewId']) {
    if (field === 'previewId' && input.action === 'plugin.install' && input.previewId === undefined && input.enabledSkills === undefined) continue;
    if (fields.includes(field) && (typeof input[field] !== 'string' || !input[field] || input[field].length > 300 || /[\x00-\x1f]/.test(input[field]))) fail(400, 'INVALID_ACTION', `缺少有效的 ${field}。`);
  }
  if (input.enabledSkills !== undefined && (!Array.isArray(input.enabledSkills) || input.enabledSkills.length > 3000 || new Set(input.enabledSkills).size !== input.enabledSkills.length || input.enabledSkills.some(value => typeof value !== 'string' || !value.endsWith('/SKILL.md') && value !== 'SKILL.md' || path.isAbsolute(value) || value.split(/[\\/]/).some(part => !part || part === '..' || part === '.') || /[\x00-\x1f]/.test(value)))) fail(400, 'INVALID_SELECTION', '请选择预览中有效且不重复的技能。');
  if (fields.includes('enabled') && typeof input.enabled !== 'boolean') fail(400, 'INVALID_ACTION', 'enabled 必须为布尔值。');
  if (fields.includes('ids') && (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 100 || input.ids.some(id => typeof id !== 'string' || !(/^[a-f0-9]{24}$/.test(id) || input.agent !== undefined && /^claude:skill:(user|project):[a-f0-9]{12}$/.test(id))) || new Set(input.ids).size !== input.ids.length)) fail(400, 'INVALID_SELECTION', '请选择 1 至 100 份不同的技能。');
  if (fields.includes('groupName') && (typeof input.groupName !== 'string' || !input.groupName.trim() || input.groupName.length > 200 || /[\x00-\x1f]/.test(input.groupName))) fail(400, 'INVALID_SELECTION', '需要有效的同名技能组。');
  if (fields.includes('source')) {
    if (!['local', 'git'].includes(input.sourceType)) fail(400, 'INVALID_SOURCE', 'sourceType 必须为 local 或 git。');
    const location = input.sourceType === 'git' ? githubDirectory(input.source) : null;
    validateSource(location?.source || input.source, input.sourceType); validateRef(input.ref);
    if (input.sourceType === 'local' && input.ref !== undefined) fail(400, 'INVALID_REF', '本地目录不使用 Git ref。');
  }
  if (input.subpath !== undefined) validateSubpath(input.subpath);
  if (fields.includes('path') && (typeof input.path !== 'string' || !input.path || input.path.length > 2000 || path.isAbsolute(input.path) || input.path.split(/[\\/]/).some(part => !part || part === '..' || part === '.') || /[\x00-\x1f]/.test(input.path))) fail(400, 'INVALID_DIFF_PATH', '请选择预览中的有效文件路径。');
  if (input.name !== undefined && !safeName(input.name)) fail(400, 'INVALID_NAME', '安装名称只支持小写字母、数字、点、短横线和下划线。');
  if (fields.includes('target')) validateTarget(input.target);
  if (fields.includes('tags')) {
    if (!['skill', 'plugin'].includes(input.target.kind)) fail(400, 'INVALID_TARGET', '标签只适用于技能或插件。');
    normalizeTags(input.tags);
  }
  if (input.targets !== undefined) { if (!Array.isArray(input.targets) || input.targets.length > 1000) fail(400, 'INVALID_TARGET', '目标列表无效。'); input.targets.forEach(validateTarget); }
  if (fields.includes('autoApply') && typeof input.autoApply !== 'boolean') fail(400, 'INVALID_ACTION', 'autoApply 必须显式为布尔值。');
  if (fields.includes('schedule')) validateSchedule(input.schedule);
  if (fields.includes('projectDir')) { try { validateProjectPath(input.projectDir); } catch (error) { fail(error.status, error.code, error.message); } }
  return input;
}

import { compareVersions } from './versions.mjs';
export { compareVersions };

export async function createService(options = {}) {
  const homeInput = path.resolve(options.home || os.homedir()); const home = await fs.realpath(homeInput);
  let stateDir = path.resolve(options.stateDir || process.env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock'));
  let projectInfo = await resolveProject({ projectDir: options.projectDir, stateDir });
  const inherited = options.projectContext || JSON.parse(process.env.SKILLDOCK_PROJECT_CONTEXT || 'null');
  if (inherited?.effective === projectInfo.effective) projectInfo = { ...projectInfo, ...inherited };
  let project = projectInfo.effective;
  const launchProject = project;
  const codexHome = path.resolve(options.codexHome || process.env.CODEX_HOME || path.join(home, '.codex'));
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  stateDir = await fs.realpath(stateDir);
  // Fixed for the life of the service: a migration replaces the service (HLD 3.7).
  const generation = await readGeneration(stateDir);
  const applicationBoundary = await captureDirectoryRoot(stateDir);
  const localRoot = path.join(stateDir, 'local'); await fs.mkdir(localRoot, { recursive: true, mode: 0o700 });
  const local = { mode: 'local', root: localRoot, home, codexHome, project, config: path.join(codexHome, 'config.toml'), skills: path.join(codexHome, 'skills'), registryFile: path.join(localRoot, 'registry.json') };
  // Test fixtures are a programmatic opt-in, never an environment or HTTP switch.
  const environments = { local };
  if (options.enableTestSandbox === true) environments.sandbox = { mode: 'sandbox', ...await initializeSandbox(path.join(stateDir, 'sandbox')) };
  for (const env of Object.values(environments)) {
    env.stateBoundary = await captureDirectoryRoot(env.root);
    env.codexBoundary = await captureDirectoryRoot(env.codexHome); env.codexRootReal = env.codexBoundary.real;
    env.discoveryRoots = await rootsFor(env);
    env.managedRoots = await Promise.all(env.discoveryRoots.filter(root => root.scope !== 'system').map(root => captureDirectoryRoot(root.directory)));
    env.cacheBoundary = await captureDirectoryRoot(pluginCacheRoot(env.codexHome));
    env.skillLinks = new Map();
  }
  const adapter = options.adapter || new CodexAdapter({ codexHome, codexBin: options.codexBin || process.env.SKILLDOCK_CODEX_BIN, timeout: options.cliTimeout });
  const appDir = options.appSource ?? process.env.SKILLDOCK_APP_SOURCE ?? fileURLToPath(new URL('..', import.meta.url));
  const agentEnv = options.env ?? process.env;
  const agentLayer = createAgentLayer({ stateDir, home, codexHome, appDir, env: agentEnv, claudeCli: options.claudeCli,
    codexCli: async () => {
      let info;
      try { info = typeof adapter.probe === 'function' ? await adapter.probe() : (await adapter.list()).cli; } catch (error) { info = { available: false, error: error.message }; }
      return info?.available ? { available: true, version: info.version, path: info.path } : { available: false, error: info?.error || '未找到可用的 Codex CLI。' };
    } });
  const directoryIcons = options.directoryIcons || createDirectoryIcons();
  const projectIntegration = options.projectIntegration || createProjectIntegration();
  const projects = () => projectCatalog({ codexHome, stateDir, current: project, integration: projectIntegration });
  const defaultMode = options.enableTestSandbox === true ? 'sandbox' : 'local'; const previews = new Map(); let busy = false; let cachedCatalog; let catalogTime = 0; let scheduler;
  const removalPreviews = new Map(); const pluginCatalogPreviews = new Map();
  const background = options.background === false || options.scheduler === false || options.enableTestSandbox === true ? null
    : options.backgroundManager || createBackgroundManager({ stateDir, home, codexHome, project: () => project });
  const disabledFile = mode => mode === 'local' ? backgroundPaths(stateDir, home).disabled : path.join(environments[mode].root, 'disabled.json');
  const disabledSchedule = mode => readJson(disabledFile(mode), null);
  let operationActive = false; let operationPromise; let migrationError;
  // DEC-SDX-009: the data moved past the generation this service started with (a newer
  // release, or a migration under a generation-1 worker); it stops writing.
  async function ensureGeneration() {
    if (await readGeneration(stateDir) > generation)
      fail(409, 'DATA_GENERATION_NEWER', 'SkillDock 的数据已由更高版本管理，这个 SkillDock 不再写入。请把 SkillDock 更新到最新版本后重新打开。');
  }
  async function withOperation(operation) {
    if (operationActive) fail(409, 'BUSY', '另一个操作或更新批次正在执行，请稍后重试。');
    await ensureGeneration();
    // DEC-SDX-010: instance lock → Codex lock on generation-2 data, where taking a lock
    // never creates the Codex root. Generation-1 data keeps 0.10.x locking.
    let release = () => {};
    if (!options.ownsOperationLock) {
      const current = generation >= CURRENT_GENERATION;
      const instance = current ? acquireFileLock(instanceLock(stateDir)) : () => {};
      try {
        const codex = !current || await fs.stat(codexHome).then(() => true, () => false) ? acquireFileLock(operationLock(codexHome)) : () => {};
        release = () => { codex(); instance(); };
      } catch (error) { instance(); throw error; }
    }
    // Checked again under the locks: a migration holds them while it writes the marker.
    try { await ensureGeneration(); } catch (error) { release(); throw error; }
    operationActive = true;
    const promise = (async () => { await scheduler.reload({ recover: true }); return operation(); })();
    operationPromise = promise;
    try { return await promise; } finally { operationActive = false; operationPromise = undefined; release(); }
  }
  let observedRun;
  async function refreshSchedule() {
    if (!operationActive) {
      await scheduler?.reload();
      if (scheduler?.progress('local')?.status === 'running' && !isOperationActive(codexHome)) {
        try { await withOperation(async () => {}); } catch (error) { if (error.code !== 'BUSY') throw error; }
      }
    }
    const record = scheduler?.progress('local');
    const key = `${record?.id || ''}:${record?.finishedAt || ''}`;
    if (key !== observedRun) { observedRun = key; catalogTime = 0; }
  }
  const previewNow = options.now || Date.now;
  const hasPreview = id => !!id && previews.has(id) && previewNow() - previews.get(id).created <= 30 * 60000;
  const environment = mode => {
    if (mode === 'sandbox' && !environments.sandbox) fail(403, 'MODE_DISABLED', '演练环境已移除，此服务仅提供本机模式。');
    if (!environments[mode]) fail(400, 'INVALID_MODE', '请求的环境无效。');
    return environments[mode];
  };
  const registryFor = env => readJson(env.registryFile, emptyRegistry());
  async function catalogFor(env, registry, force = false) {
    if (env.mode === 'sandbox') return decorateDirectCatalog(await sandboxCatalog(env, registry), registry, env);
    if (!cachedCatalog || force || Date.now() - catalogTime > 15000) { cachedCatalog = await adapter.list(); catalogTime = Date.now(); }
    return decorateDirectCatalog(structuredClone(cachedCatalog), registry, env);
  }
  async function removeStaging(env, directory) {
    const parent = path.join(env.root, 'staging');
    if (path.dirname(directory) !== parent || !/^[a-f0-9-]{36}$/.test(path.basename(directory))) fail(403, 'STAGING_BOUNDARY', '暂存清理路径不在自管目录。');
    await verifyDescendantDirectory(env.stateBoundary, directory);
    await fs.rm(directory, { recursive: true, force: true });
  }
  async function cleanupTemporary(env, registry, consumed) {
    if (consumed) await removeStaging(env, consumed.staging);
    for (const [id, preview] of previews) if (preview.mode === env.mode && previewNow() - preview.created > 30 * 60000) {
      await removeStaging(env, preview.staging); previews.delete(id);
    }
    const staging = path.join(env.root, 'staging');
    if (await exists(staging)) {
      await verifyDescendantDirectory(env.stateBoundary, staging);
      const active = new Set([...previews.values()].map(preview => preview.staging));
      for (const name of await fs.readdir(staging)) if (/^[a-f0-9-]{36}$/.test(name)) {
        const directory = path.join(staging, name); const stat = await fs.lstat(directory);
        if (!active.has(directory) && Date.now() - stat.mtimeMs > 30 * 60000) await removeStaging(env, directory);
      }
    }
    if (!registry) return;
    const roots = path.join(env.root, 'marketplace-sources'); if (!(await exists(roots))) return;
    await verifyDescendantDirectory(env.stateBoundary, roots);
    const retained = [...Object.values(registry.marketplaces).map(entry => entry.root), ...[...previews.values()].filter(preview => preview.mode === env.mode).flatMap(preview => [preview.source, preview.originalDirectory])].filter(Boolean);
    const unused = [];
    for (const name of await fs.readdir(roots)) if (/^[a-f0-9-]{36}$/.test(name)) {
      const directory = path.join(roots, name); const stat = await fs.lstat(directory);
      if (!retained.some(keep => inside(directory, keep))) unused.push({ directory, mtime: stat.mtimeMs });
    }
    unused.sort((a, b) => b.mtime - a.mtime);
    for (const entry of unused.slice(2)) { await verifyDescendantDirectory(env.stateBoundary, entry.directory); await fs.rm(entry.directory, { recursive: true, force: true }); }
  }
  async function snapshot(mode, force = false, { multiAgent = false } = {}) {
    await refreshSchedule();
    const started = performance.now(); const env = { ...environment(mode) }; const currentProjectInfo = projectInfo; await verifyDirectoryRoot(env.stateBoundary); const registry = await registryFor(env);
    if (!operationActive) {
      try { await withOperation(() => cleanupTemporary(env)); } catch { /* A writer owns the lock, or cleanup is unavailable; never interrupt its staging. */ }
    }
    const result = await enrichSources(await scan(env, registry, await catalogFor(env, registry, force)), env, registry);
    enrichTags(result, registry);
    // A version-1 snapshot keeps 0.10.2 semantics: Claude's activity is not Codex's, and it does not
    // take places among the 200 shown (4a review P3-05).
    if (!multiAgent) result.activity = result.activity.filter(item => (item.agent ?? 'codex') === 'codex');
    if (scheduler) { const { extraActivity, ...updateState } = scheduler.data(mode, result); Object.assign(result, updateState); result.activity = [...result.activity, ...extraActivity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200); }
    else { result.activity = result.activity.slice(0, 200); result.updates = buildUpdateItems(result, {}, hasPreview); }
    for (const file of (await fs.readdir(env.root)).filter(name => /^pending-plugin-update-[a-f0-9-]+\.json$/.test(name)).slice(0, 20)) result.diagnostics.push(`存在未确认的包更新记录 ${file}；请核对插件版本和启用状态，旧写请求不会自动重放。`);
    if (mode === 'local' && background && result.schedule) {
      result.schedule.background = await background.status(result.schedule.enabled);
      if (migrationError) result.schedule.background = { ...result.schedule.background, status: 'error', lastError: migrationError };
    }
    result.projectContext = mode === 'local' ? { ...currentProjectInfo, effective: env.project } : undefined;
    if (mode === 'local') result.projects = await projects();
    // 36c §5–6: only a client that declared multiAgent=1 sees Agent environments, and then
    // every object names its Agent explicitly.
    if (multiAgent && mode === 'local') {
      const found = await agentLayer.discover({ force });
      const claude = found.installed.claude ? await claudeFor(found, env.project, force) : null;
      if (claude) decorateClaudeDirect(claude, registry, env);
      mergeClaude(result, claude ?? { skills: [], plugins: [], marketplaces: [], diagnostics: [] });
      if (claude) {
        const roots = { user: path.join(found.claudeRoot.configDir, 'skills'), project: path.join(env.project, '.claude/skills') };
        const conflicts = await decorateClaudeSkills(result, registry, roots);
        // 36c §6: different sources leave neither side able to update; a batch or a plan skips it too (phase 5c).
        for (const item of result.updates) if (item.target.kind === 'skill' && !item.target.agent && conflicts.has(item.target.id))
          Object.assign(item, { status: 'blocked', canCheck: false, canApply: false, canAutoApply: false, reasonCode: 'SOURCE_CONFLICT', message: result.skills.find(skill => skill.id === item.target.id).reason });
        // Phase 5a: Claude objects join the update list, before any side is marked read-only (which
        // then leaves its items checkable or not, but never applicable); a shared skill Claude leads
        // is listed once, under Claude.
        const led = claudeLedSkills(result); const items = claudeUpdateItems(result, await claudeUpdateMaps(result, registry, roots));
        result.updates = [...result.updates.filter(item => !(item.target.kind === 'skill' && !item.target.agent && led.has(item.target.id))), ...(scheduler ? scheduler.decorate(mode, items) : items)];
      }
      if (found.stored.codex?.management === 'read-only') markReadOnly(result, 'codex', CODEX_READ_ONLY_REASON);
      // Claude objects offer changes only while Claude management is enabled and confirmed.
      const claudeState = agentLayer.effective('claude', found, side => side === 'claude' ? claude?.unconfirmed : null);
      if (claudeState.management !== 'enabled') markReadOnly(result, 'claude', claudeState.management === 'unconfirmed' && claudeState.reason ? claudeState.reason : CLAUDE_READ_ONLY_REASON);
      // Codex is shown as unconfirmed when its command line cannot list its plugins; its writes keep
      // 0.10.2 behaviour (MR-SDX-001), so this is shown, not enforced.
      result.agents = await agentLayer.environments({ found, unconfirmed: agent => agent === 'claude' ? claude?.unconfirmed : null });
      // Shown, not enforced (4c review P2-05): Codex keeps its stored state, so its writes and the
      // switch that turns them off stay offered; the missing command line is a note.
      const codexEnvironment = result.agents.find(item => item.agent === 'codex');
      if (codexEnvironment?.installed && !result.cli?.available) (codexEnvironment.notes ??= []).unshift(codexEnvironment.management === 'enabled'
        ? 'Codex 命令行不可用，无法确认 Codex 中的插件状态；技能照常管理，插件操作需要可用的 Codex 命令行。' : 'Codex 命令行不可用，无法确认 Codex 中的插件状态。');
    } else if (multiAgent) {
      mergeClaude(result, { skills: [], plugins: [], marketplaces: [], diagnostics: [] }); result.agents = [];
    }
    result.durationMs = Math.round(performance.now() - started); return result;
  }
  // The Claude catalog for multi-agent snapshots, kept for 15 seconds like the Codex one.
  let claudeCache;
  async function claudeFor(found, projectDir, force) {
    const key = JSON.stringify([found.claudeRoot.configDir, found.claudeRoot.pluginCacheDir, projectDir, found.cli.claude.path]);
    if (!force && claudeCache?.key === key && Date.now() - claudeCache.at < 15000) return structuredClone(claudeCache.value);
    let value;
    try { value = await claudeCatalog({ claudeRoot: found.claudeRoot, project: projectDir, cli: found.cli.claude.available ? found.cli.claude : null, env: agentEnv, ...options.claudeCatalog }); }
    catch (error) { value = { skills: [], plugins: [], marketplaces: [], diagnostics: [], unconfirmed: `无法读取 Claude 环境：${redact(error.message)}` }; }
    claudeCache = { key, at: Date.now(), value };
    return structuredClone(value);
  }
  // Claude writes (36c §7.3) read Claude afresh, and journal into the local activity.
  const claudeAction = createClaudeActions({
    root: async () => (await agentLayer.discover()).claudeRoot,
    read: async () => {
      const found = await agentLayer.discover({ force: true });
      return { claude: await claudeFor(found, project, true), claudeRoot: found.claudeRoot, cli: found.cli.claude, project };
    },
    writer: state => options.claudeWriter ? options.claudeWriter(state) : claudeWriter({ cli: state.cli, claudeRoot: state.claudeRoot, env: agentEnv }),
    journal: async (entry, change) => {
      const env = environment('local'); await verifyDirectoryRoot(env.stateBoundary); const registry = await registryFor(env);
      change?.(registry); registry.activity.unshift(entry);
      await writeJson(env.registryFile, registry);
    },
    ...(options.claudeGit ? { git: options.claudeGit } : {}),
    removeSkillsDir: plugin => removeSkillsDirPlugin(plugin),
    cleanupDirect: market => cleanupClaudeDirect(market),
    // Codex standalone skills whose content lies in a directory (36c §6 cross-side prompts; 4d review P3-04).
    dependents: async directory => {
      const real = await fs.realpath(directory).catch(() => directory);
      return (await snapshot('local')).skills.filter(item => !item.pluginId && inside(real, path.dirname(item.realPath ?? item.path))).map(item => item.path);
    },
  });
  // Phase 4b2 (HLD 3.4; 36c 7.3): Claude skills reuse the file transactions — staging, guarded
  // moves, the restorable area and source records — inside Claude's own skill roots. Their source
  // records form a partition keyed by real directory (36c §6: an ID may change when a skill becomes
  // shared; its real path does not).
  const CLAUDE_SKILL_FILES = new Set(['skill.previewInstall', 'skill.install', 'skill.remove', 'skill.previewSource', 'skill.connectSource', 'skill.checkUpdate', 'skill.update']);
  const realDirectory = directory => fs.realpath(directory).catch(() => path.resolve(directory));
  async function claudeSkillRoots() {
    const found = await agentLayer.discover();
    return { found, user: path.join(found.claudeRoot.configDir, 'skills'), project: path.join(project, '.claude/skills') };
  }
  // Codex's protected roots and Claude's own plugin directories (4b review P3-06).
  async function claudeProtectedRoots(roots) {
    const own = [path.join(roots.found.claudeRoot.configDir, 'plugins'), roots.found.claudeRoot.pluginCacheDir].filter(Boolean);
    return [...await protectedRoots(environment('local')), ...await Promise.all(own.map(realDirectory))];
  }
  /**
   * The two sides of a shared skill (36c §6): the Claude side may be removed where Claude found it
   * (a link removes only the link); either side may update only from its own source record and
   * when its path is the real directory; with both able, Codex leads; records naming different
   * sources leave neither side able, and say why.
   */
  async function decorateSharedSkill(skill, registry, roots) {
    const claude = skill.perAgent.claude; const codex = skill.perAgent.codex; let conflict = false;
    const directory = path.dirname(claude.path); const real = await realDirectory(directory);
    const isLink = await fs.lstat(directory).then(stat => stat.isSymbolicLink(), () => false);
    const inRoot = path.dirname(directory) === (claude.scope === 'user' ? roots.user : roots.project) && !directory.split(path.sep).includes('.system') && !inside(real, fileURLToPath(import.meta.url));
    const claudeSource = registry.claudeSources?.[real]; const codexSource = registry.sources?.[skill.id];
    const repository = await exists(path.join(real, '.git'));
    // Organisation-managed settings hold the Claude side as they hold a Claude-only skill (4c review P3-05).
    const open = inRoot && !claude.protection;
    Object.assign(claude, { canRemove: open, ...(open ? { removeKind: isLink ? 'link' : 'directory' } : {}), canUpdate: false });
    if (claudeSource && codexSource && !await sameSourceAt(claudeSource, codexSource)) {
      const reason = `Codex 与 Claude 两侧为这个技能关联了不同的来源（${codexSource.source}、${claudeSource.source}），两侧都不能更新；请在一侧重新关联到相同的来源。`;
      Object.assign(skill, { canUpdate: false, reason }); Object.assign(codex, { canUpdate: false, reason }); claude.reason = reason;
      conflict = true;
    } else if (codex.canUpdate) {
      if (claudeSource) claude.reason = '由 Codex 侧的来源记录管理更新。';
    } else if (claudeSource && !isLink && open && !repository) claude.canUpdate = true;
    if (!claude.canToggle && !claude.reason) claude.reason = claude.protection ? '可见性由组织托管设置决定，不能在这里修改。' : '这个技能在 Claude 一侧不能在这里修改。';
    if (claude.canToggle && claude.canRemove && claude.reason === undefined) delete claude.reason;
    return conflict;
  }
  /** Removal and updates of Claude-only skills, from SkillDock's own records (snapshots only). */
  /** Returns the shared skills whose two sides name different sources. */
  async function decorateClaudeSkills(result, registry, roots) {
    const conflicts = new Set();
    for (const skill of result.skills) {
      if (skill.agents?.length === 2 && skill.perAgent?.claude) { if (await decorateSharedSkill(skill, registry, roots)) conflicts.add(skill.id); continue; }
      if (skill.agents?.length !== 1 || skill.agents[0] !== 'claude' || !['user', 'project'].includes(skill.scope) || skill.protection) continue;
      const directory = path.dirname(skill.path);
      // Only the personal skills directory and the current project's .claude/skills: a parent
      // directory's skills belong to the repository and its other projects (4b review P3-04).
      if (path.dirname(directory) !== (skill.scope === 'user' ? roots.user : roots.project)) continue;
      // The same key as the operations: the directory's real path (P3-06).
      const real = await realDirectory(directory);
      // SkillDock itself and system content are never offered (review r2 P3-05), as the operations refuse them.
      if (inside(real, fileURLToPath(import.meta.url)) || directory.split(path.sep).includes('.system')) continue;
      const source = registry.claudeSources?.[real];
      const repository = await exists(path.join(directory, '.git'));
      Object.assign(skill, { canRemove: true, removeKind: skill.isLink ? 'link' : 'directory', canUpdate: !!source && !skill.isLink && !repository });
      if (skill.canToggle) delete skill.reason;
    }
    return conflicts;
  }
  const trackedInfo = source => ({ kind: 'tracked', confidence: source.confidence || 'verified', owner: 'SkillDock', label: source.confidence === 'user-confirmed' ? '用户关联来源' : '已追踪来源',
    evidence: '已记录来源及当前安装内容指纹；更新前重新校验。', source: publicSource(source.source), sourceType: source.sourceType, subpath: source.subpath, ref: source.ref, commit: source.commit });
  /** Whether a skills-directory plugin can be updated by the file transaction (phase 5a): only in the two roots, a directory, from a recorded source. */
  async function skillsDirState(plugin, registry, roots) {
    const directory = plugin.installedPath;
    if (!directory || ![roots.user, roots.project].includes(path.dirname(directory))) return { canUpdate: false };
    const isLink = await fs.lstat(directory).then(stat => stat.isSymbolicLink(), () => false);
    const source = registry.claudeSources?.[await realDirectory(directory)];
    return { canUpdate: !!source && !isLink && !await exists(path.join(directory, '.git')), isLink, source };
  }
  /** The Claude-side source of each updatable object, and which skills-directory plugins can update; reads only. */
  async function claudeUpdateMaps(result, registry, roots) {
    const sources = new Map(); const skillsDir = new Map();
    for (const skill of result.skills) {
      const view = skill.agents?.length === 2 ? skill.perAgent?.claude?.canUpdate && skill.perAgent.claude : skill.agents?.join() === 'claude' && skill;
      const source = view && registry.claudeSources?.[await realDirectory(path.dirname(view.path))];
      if (source) sources.set(skill.id, trackedInfo(source));
    }
    for (const plugin of result.plugins) {
      if (plugin.marketplace !== 'skills-dir' || !plugin.installed || plugin.agents?.join() !== 'claude') continue;
      const state = await skillsDirState(plugin, registry, roots); skillsDir.set(plugin.id, state);
      if (state.source) sources.set(plugin.id, trackedInfo(state.source));
    }
    return { sources, skillsDir };
  }
  async function claudeSkillRecord(id, capability, request) {
    const current = await snapshot('local', true, { multiAgent: true });
    // A skills-directory plugin updates by the same file transaction as a skill (phase 5a).
    if (id.startsWith('claude:plugin:')) return claudePluginDirRecord(current, id, capability, request);
    const record = current.skills.find(item => item.id === id);
    if (!record) fail(404, 'NOT_FOUND', '未找到这个 Claude 技能，请刷新后重试。');
    // A shared skill acts through its Claude side (36c §6): that side's path, link and capabilities;
    // its ID and revision stay the shared object's.
    const shared = record.agents?.length === 2 && record.perAgent?.claude;
    if (!shared && record.agents?.join() !== 'claude') fail(422, 'UNSUPPORTED_FOR_AGENT', '这个技能在 Claude 一侧没有可以修改的对象。');
    const view = shared ? { ...record.perAgent.claude, isLink: record.perAgent.claude.removeKind === 'link' } : record;
    if (!view[capability]) fail(403, view.protection ? 'HOST_MANAGED' : 'PROTECTED_SKILL', view.reason || '这个技能不支持此操作。');
    if (request.expectedRevision === undefined || request.expectedRevision !== record.revision) fail(409, 'SNAPSHOT_STALE', 'Claude 中已有改动，请刷新后重试。');
    const directory = path.dirname(view.path);
    const roots = await claudeSkillRoots();
    if (path.dirname(directory) !== (view.scope === 'user' ? roots.user : roots.project)) fail(403, 'ROOT_BOUNDARY', '只能修改个人技能目录或当前项目 .claude/skills 中的 Claude 技能。');
    const boundary = await captureDirectoryRoot(path.dirname(directory));
    if ((await claudeProtectedRoots(roots)).some(root => inside(root, boundary.real))) fail(403, 'TARGET_BOUNDARY', 'Claude 的技能根指向插件或系统管理目录，不能修改其中的内容。');
    // A directory must stay inside its root; only a link may point elsewhere, and then only the link moves.
    if (!view.isLink && !inside(boundary.real, await fs.realpath(directory))) fail(403, 'ROOT_BOUNDARY', '技能实际位置越出 Claude 的技能根。');
    if (inside(await realDirectory(directory), fileURLToPath(import.meta.url)) || directory.split(path.sep).includes('.system')) fail(403, 'PROTECTED_SKILL', '应用自身或系统内容不可修改。');
    if (capability === 'canUpdate' && await exists(path.join(directory, '.git'))) fail(422, 'GIT_OWNER_MANAGED', '该目录本身是 Git 仓库，SkillDock 不替换工作树或 .git 元数据。');
    return { record: shared ? { ...record, path: view.path, isLink: view.isLink } : record, directory, boundary, key: await realDirectory(directory) };
  }
  async function claudePluginDirRecord(current, id, capability, request) {
    const plugin = current.plugins.find(item => item.id === id && item.marketplace === 'skills-dir' && item.installed);
    if (!plugin) fail(404, 'NOT_FOUND', '未找到这个 Claude 技能目录插件，请刷新后重试。');
    if (capability !== 'canUpdate') fail(422, 'UNSUPPORTED_FOR_AGENT', '技能目录插件经插件操作修改。');
    if (request.expectedRevision === undefined || request.expectedRevision !== plugin.revision) fail(409, 'SNAPSHOT_STALE', 'Claude 中已有改动，请刷新后重试。');
    const roots = await claudeSkillRoots(); const directory = plugin.installedPath;
    const state = await skillsDirState(plugin, await registryFor(environment('local')), roots);
    if (!state.canUpdate) fail(403, 'PROTECTED_PLUGIN', state.isLink ? '这个技能目录插件通过链接接入；更新请在真实来源目录进行。' : '这个技能目录插件没有 SkillDock 记录的来源，或位于其他位置；请在它的来源处更新。');
    const boundary = await captureDirectoryRoot(path.dirname(directory));
    if ((await claudeProtectedRoots(roots)).some(root => inside(root, boundary.real))) fail(403, 'TARGET_BOUNDARY', 'Claude 的技能根指向插件或系统管理目录，不能修改其中的内容。');
    if (!inside(boundary.real, await fs.realpath(directory))) fail(403, 'ROOT_BOUNDARY', '插件目录的实际位置越出 Claude 的技能根。');
    return { record: { ...plugin, plugin: true }, directory, boundary, key: await realDirectory(directory) };
  }
  // One implementation of the skill file transactions for both sides (4b review P2-04; DEC-SDX-020).
  // A side says how it finds a writable record and its source key, where its source records live,
  // where it installs, which places a restore may return to, which roots its moves add, and what
  // its messages say. The Codex side returns exactly what 0.10.2 did.
  function codexSkillSide(env, registry) {
    return {
      agent: 'codex', sources: registry.sources, tag: {}, linkKeepsSource: false,
      async record(id, capability) { const { record, directory } = await assertWritableSkill(env, id, capability); return { record, directory, key: record.id, boundaries: [] }; },
      installKey: async target => identity(target),
      async installTarget(request, name) { return { root: env.skills, destination: path.join(env.skills, name) }; },
      async prepareInstall() { await assertTargetRoot(env); return []; },
      async restorePlace(entry) {
        if (entry.kind !== 'remove') return [];
        const parent = await fs.realpath(path.dirname(entry.directory));
        const managedRoots = await Promise.all((env.discoveryRoots || await rootsFor(env)).filter(root => root.scope !== 'system').map(async root => { try { return await fs.realpath(root.directory); } catch { return root.directory; } }));
        if (!managedRoots.some(root => inside(root, parent)) || parent.split(path.sep).includes('.system')) fail(403, 'RESTORE_BOUNDARY', '原位置的管理边界已变化。');
        return [];
      },
      restoreKey: async entry => entry.skillId,
      // The Claude record of the same real directory, when Claude has one.
      otherRecord: async (record, directory) => { const key = await realDirectory(directory); return registry.claudeSources?.[key] ? { partition: 'claude', key } : null; },
      afterRestore: entry => env.skillLinks.delete(entry.directory),
      dropStaging: staging => fs.rm(staging, { recursive: true, force: true }),
      messages: { installed: name => `已安装 ${name}。请开启新的 Codex 会话以加载。`, linked: name => `已关联 ${name} 的更新来源，本机文件保持原样。`,
        updated: name => `已更新 ${name}，旧版已保留，可从操作记录恢复。`, removed: name => `已将 ${name} 移至可恢复区；可从操作记录恢复。`, restored: name => `已恢复 ${name}。` },
    };
  }
  function claudeSkillSide(env, registry, roots, request) {
    return {
      agent: 'claude', sources: (registry.claudeSources ??= {}), tag: { agent: 'claude' }, linkKeepsSource: true,
      async record(id, capability) { const { record, directory, boundary, key } = await claudeSkillRecord(id, capability, request); return { record, directory, key, boundaries: [boundary] }; },
      installKey: target => realDirectory(target),
      // Checked before the source is staged, as before the merge (4c review P3-04).
      validateInstall(input) { if ((input.scope ?? 'user') === 'local') fail(400, 'INVALID_ACTION', 'Claude 技能只能安装到个人技能目录或项目的 .claude/skills。'); },
      async installTarget(input, name) {
        const scope = input.scope ?? 'user';
        if (scope === 'local') fail(400, 'INVALID_ACTION', 'Claude 技能只能安装到个人技能目录或项目的 .claude/skills。');
        const root = scope === 'user' ? roots.user : roots.project;
        return { root, destination: path.join(root, name), scope };
      },
      async prepareInstall(preview) {
        const boundary = await captureDirectoryRoot(preview.root);
        if ((await claudeProtectedRoots(roots)).some(root => inside(root, boundary.real))) fail(403, 'TARGET_BOUNDARY', '技能安装根指向插件或系统管理目录，不能写入。');
        await fs.mkdir(preview.root, { recursive: true }); await verifyDirectoryRoot(boundary);
        return [await captureDirectoryRoot(preview.root)];
      },
      async restorePlace(entry) {
        // The original place must still be one of Claude's skill roots.
        const parent = path.dirname(entry.directory);
        const allowed = parent === roots.user || parent.split(path.sep).slice(-2).join('/') === '.claude/skills';
        if (!allowed || parent.split(path.sep).includes('.system')) fail(403, 'RESTORE_BOUNDARY', '原位置的管理边界已变化。');
        return [await captureDirectoryRoot(parent)];
      },
      restoreKey: entry => realDirectory(entry.directory),
      // The Codex record of a shared skill, kept under its Codex ID.
      otherRecord: async record => record.agents?.length === 2 && registry.sources?.[record.id] ? { partition: 'codex', key: record.id } : null,
      afterRestore: () => {},
      dropStaging: staging => removeStaging(env, staging),
      messages: { installed: name => `已在 Claude 中安装技能 ${name}。新的 Claude 会话会加载它。`, linked: name => `已关联 Claude 技能 ${name} 的更新来源，本机文件保持原样。`,
        updated: (name, record) => record?.plugin ? `已更新 Claude 插件 ${name}，旧版已保留，可从操作记录恢复。` : `已更新 Claude 技能 ${name}，旧版已保留，可从操作记录恢复。`, removed: name => `已把 Claude 技能 ${name} 移至可恢复区；可从操作记录恢复。`, restored: (name, entry) => entry?.plugin ? `已恢复 Claude 插件 ${name}。` : `已恢复 Claude 技能 ${name}。` },
    };
  }
  /**
   * The skill file transactions of one side. Returns `{ early }` for a preview (nothing
   * changed, nothing journaled), else `{ result, target, restore, activityPath, consumed }`.
   */
  async function skillOperation(side, request, { env, registry, undo, activityId }) {
    const sources = side.sources;
    switch (request.action) {
      case 'skill.previewSource': {
        const { record, directory } = await side.record(request.id, 'canRemove');
        if ((await fs.lstat(directory)).isSymbolicLink() || await exists(path.join(directory, '.git'))) fail(422, 'GIT_OWNER_MANAGED', '链接或 Git 仓库根由原所有者管理；请选择独立技能副本关联来源。');
        const current = await inspectTree(directory); const staged = await stageSource(env, request); const id = crypto.randomUUID();
        previews.set(id, { ...staged, id, mode: env.mode, kind: 'source-link', ...side.tag, target: directory, skillId: record.id, baseline: current.fingerprint, installedFiles: current.entries, targetBoundary: await captureDirectoryRoot(directory), created: previewNow() });
        return { early: { message: '请确认来源与本机差异；关联本身不会替换内容。', ...side.tag, sourcePreview: { id, skillId: record.id, name: record.name, source: staged.source, subpath: staged.subpath, ref: staged.ref, commit: staged.commit, target: record.path, matchesInstalled: current.fingerprint === staged.tree.fingerprint, changes: diffFiles(current.entries, staged.tree.entries) } } };
      }
      case 'skill.connectSource': {
        const preview = await assertPreview(env, request.previewId, 'source-link', side.agent);
        if (preview.skillId !== request.id) fail(409, 'PREVIEW_MISMATCH', '来源预览不属于该技能。');
        const { record, directory, key } = await side.record(request.id, 'canRemove'); await verifyDirectoryRoot(preview.targetBoundary);
        const current = await inspectTree(directory); if (current.fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '本机内容在来源预览后发生变化，请重新预览。');
        sources[key] = { ...provenance(preview, directory), confidence: 'user-confirmed', fingerprint: current.fingerprint, files: current.entries };
        return { result: { message: side.messages.linked(record.name), ...side.tag }, target: record.name, consumed: preview };
      }
      case 'skill.previewInstall': {
        side.validateInstall?.(request);
        const staged = await stageSource(env, request); const name = request.name || staged.detail.name;
        if (!safeName(name)) { await side.dropStaging(staged.staging); fail(422, 'INVALID_NAME', '技能 name 不适合作为安装目录，请在请求中指定有效 name。'); }
        let place;
        try { place = await side.installTarget(request, name); } catch (error) { await side.dropStaging(staged.staging); throw error; }
        if (await exists(place.destination)) { await side.dropStaging(staged.staging); fail(409, 'TARGET_EXISTS', '同名安装目录已存在，不能覆盖。'); }
        const id = crypto.randomUUID(); previews.set(id, { ...staged, id, mode: env.mode, kind: 'install', ...side.tag, target: place.destination, ...(side.agent === 'claude' ? { root: place.root, scope: place.scope } : {}), created: previewNow() });
        return { early: { message: '预览已准备；确认后才会安装。', ...side.tag, preview: { id, name: staged.detail.name, description: staged.detail.description, icon: staged.detail.icon, iconAssets: staged.detail.iconAssets, target: place.destination, source: staged.source, subpath: staged.subpath, ref: staged.ref, commit: staged.commit, files: staged.tree.files, bytes: staged.tree.bytes } } };
      }
      case 'skill.install': {
        const preview = await assertPreview(env, request.previewId, 'install', side.agent); const boundaries = await side.prepareInstall(preview);
        if (await exists(preview.target)) fail(409, 'TARGET_EXISTS', '安装目标已存在，请重新预览。');
        await move(preview.candidate, preview.target, boundaries); undo.push(async () => { if ((await inspectTree(preview.target)).fingerprint === preview.tree.fingerprint) await move(preview.target, preview.candidate, boundaries); });
        sources[await side.installKey(preview.target)] = provenance(preview, preview.target);
        return { result: { message: side.messages.installed(preview.detail.name), needsReload: true, ...side.tag }, target: preview.detail.name, consumed: preview };
      }
      case 'skill.checkUpdate': {
        const { record, directory, key } = await side.record(request.id, 'canUpdate'); const source = sources[key];
        const current = await inspectTree(directory);
        if (current.fingerprint !== source.fingerprint) fail(409, 'LOCAL_CHANGES', '已安装技能有本地修改；请先保留或整理修改，不能自动覆盖。');
        // A skills-directory plugin's source is a plugin directory, not a skill (phase 5a).
        const staged = await stageSource(env, source, record.plugin ? 'claude-plugin' : 'skill'); const changes = diffFiles(current.entries, staged.tree.entries); const id = crypto.randomUUID();
        if (changes.length) previews.set(id, { ...staged, id, mode: env.mode, kind: 'update', ...side.tag, target: directory, skillId: record.id, baseline: current.fingerprint, sourceIdentity: JSON.stringify(source), targetBoundary: await captureDirectoryRoot(directory), created: previewNow() });
        else await removeStaging(env, staged.staging);
        return { early: { message: changes.length ? '发现来源变化，请检查文件列表。' : '当前内容与来源一致。', ...side.tag, update: { id, skillId: record.id, name: record.name, available: changes.length > 0, changes, message: changes.length ? `${changes.length} 个文件有变化；更新前会保留旧版本。` : '当前内容与来源一致。' } } };
      }
      case 'skill.update': {
        const preview = await assertPreview(env, request.previewId, 'update', side.agent);
        if (request.id !== preview.skillId) fail(409, 'PREVIEW_MISMATCH', '更新预览不属于该技能。');
        const { record, directory, key, boundaries } = await side.record(request.id, 'canUpdate');
        if (JSON.stringify(sources[key]) !== preview.sourceIdentity) fail(409, 'SOURCE_RELINKED', '更新来源在预览后重新关联，请重新检查。');
        await verifyDirectoryRoot(preview.targetBoundary);
        if ((await inspectTree(directory)).fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '技能在预览后发生变化，请重新检查。');
        if (preview.tree.fingerprint === preview.baseline) fail(409, 'NO_UPDATE', '没有需要更新的内容。');
        const backup = path.join(env.root, 'quarantine', activityId); const previousSource = sources[key]; const parent = await parentIdentity(directory);
        await move(directory, backup, boundaries); undo.push(async () => { if (!(await exists(directory))) await move(backup, directory, boundaries); });
        await move(preview.candidate, directory, boundaries); undo.push(async () => { if ((await inspectTree(directory)).fingerprint === preview.tree.fingerprint) await move(directory, preview.candidate, boundaries); });
        sources[key] = { ...provenance(preview, directory), generation: previousSource.generation || crypto.randomUUID(), confidence: previousSource.confidence || 'verified' };
        // The other side's record of the same source sees the new content too, so it does not
        // later report it as a local change (36c §6); a restore puts it back.
        const other = await side.otherRecord(record, directory); let sync;
        if (other) {
          const partition = other.partition === 'claude' ? (registry.claudeSources ??= {}) : registry.sources; const before = partition[other.key];
          if (await sameSourceAt(before, previousSource)) { partition[other.key] = { ...before, fingerprint: preview.tree.fingerprint, files: preview.tree.entries }; sync = { partition: other.partition, key: other.key, previous: before }; }
        }
        const restore = { kind: 'update', ...side.tag, directory, backup, ...parent, expectedFingerprint: preview.tree.fingerprint, priorFingerprint: preview.baseline, source: previousSource, ...(side.agent === 'claude' ? { sourceKey: key } : {}), ...(sync ? { sync } : {}), skillId: record.id };
        if (record.plugin) restore.plugin = true;
        return { result: { message: side.messages.updated(record.name, record), needsReload: true, ...side.tag }, target: record.name, restore, consumed: preview };
      }
      case 'skill.remove': {
        const { record, directory, key, boundaries } = await side.record(request.id, 'canRemove'); const fingerprint = await objectFingerprint(directory); const parent = await parentIdentity(directory);
        const backup = path.join(env.root, 'quarantine', activityId); await move(directory, backup, boundaries); undo.push(async () => { if (!(await exists(directory))) await move(backup, directory, boundaries); });
        // Removing a link removes only the link: on the Claude side the source record belongs to
        // the directory it points to, which stays (4b review P2-03).
        const keep = side.linkKeepsSource && record.isLink;
        const restore = { kind: 'remove', ...side.tag, directory, backup, ...parent, priorFingerprint: fingerprint, ...(keep ? { link: true } : { source: sources[key], ...(side.agent === 'claude' ? { sourceKey: key } : {}) }), skillId: record.id };
        if (!keep) delete sources[key];
        return { result: { message: side.messages.removed(record.name), needsReload: true, ...side.tag }, target: record.name, restore, activityPath: record.path };
      }
      case 'activity.restore': {
        const previous = registry.activity.find(entry => entry.id === request.id);
        if (!previous?.canRestore || !previous.restore || (previous.agent ?? 'codex') !== side.agent) fail(404, 'RESTORE_MISSING', '没有可用的恢复记录。');
        const entry = previous.restore;
        if (!inside(path.join(env.root, 'quarantine'), entry.backup) || !(await exists(entry.backup))) fail(409, 'BACKUP_MISSING', '恢复备份缺失或不在受管理范围。');
        if (!inside(path.join(env.root, 'quarantine'), await fs.realpath(path.dirname(entry.backup)))) fail(403, 'BACKUP_BOUNDARY', '备份目录链接越出受管理范围。');
        await verifyRestoreParent(env, entry);
        if (await objectFingerprint(entry.backup) !== entry.priorFingerprint) fail(409, 'BACKUP_CHANGED', '备份内容发生变化，已停止恢复。');
        let boundaries;
        if (entry.kind === 'remove') {
          if (await exists(entry.directory)) fail(409, 'TARGET_EXISTS', '原位置已被占用，不能覆盖恢复。');
          boundaries = await side.restorePlace(entry);
          await move(entry.backup, entry.directory, boundaries); undo.push(async () => { await move(entry.directory, entry.backup, boundaries); });
        } else {
          boundaries = await side.restorePlace(entry);
          if (!(await exists(entry.directory)) || await objectFingerprint(entry.directory) !== entry.expectedFingerprint) fail(409, 'LOCAL_CHANGES', '更新后的技能有新的修改，不能覆盖恢复。');
          const discarded = path.join(env.root, 'quarantine', `${activityId}-replaced`);
          await move(entry.directory, discarded, boundaries); undo.push(async () => { if (!(await exists(entry.directory))) await move(discarded, entry.directory, boundaries); });
          await move(entry.backup, entry.directory, boundaries); undo.push(async () => { await move(entry.directory, entry.backup, boundaries); });
        }
        if (!entry.link) { const key = await side.restoreKey(entry); if (entry.source) sources[key] = entry.source; else delete sources[key]; }
        if (entry.sync) { const partition = entry.sync.partition === 'claude' ? (registry.claudeSources ??= {}) : registry.sources; partition[entry.sync.key] = entry.sync.previous; }
        side.afterRestore(entry);
        previous.canRestore = false;
        return { result: { message: side.messages.restored(previous.target, entry), needsReload: true, ...side.tag }, target: previous.target, activityPath: previous.path || path.join(entry.directory, 'SKILL.md') };
      }
      default: fail(422, 'UNSUPPORTED_FOR_AGENT', '这一版 SkillDock 还不能在 Claude 中执行这个操作。');
    }
  }
  // 36c §6 (AC-003): version-2 requests on a skill both Agents see, and on a standalone skill whose
  // content lives inside a plugin of the other side. The revision covers both sides; moving a
  // shared real directory, or rewriting the other side's plugin content, is confirmed first;
  // linking a source that differs from the other side's is a conflict. Version-1 requests keep
  // 0.10.2 behaviour (MR-SDX-001).
  const SHARED_GATED = new Set(['skill.toggle', 'skill.remove', 'skill.update', 'skill.connectSource', 'skill.checkUpdate', 'skill.previewSource']);
  const sameSource = (a, b) => !!a && !!b && a.source === b.source && (a.subpath ?? '.') === (b.subpath ?? '.') && (a.ref ?? '') === (b.ref ?? '');
  // Local directories compare by their real path, so a link to the same directory is the same source (4c review P3-01).
  const sameSourceAt = async (a, b) => sameSource(a, b) || !!a && !!b && path.isAbsolute(a.source ?? '') && path.isAbsolute(b.source ?? '')
    && (a.subpath ?? '.') === (b.subpath ?? '.') && (a.ref ?? '') === (b.ref ?? '') && await realDirectory(a.source) === await realDirectory(b.source);
  const BOTH_SEE = { kind: 'scope', message: '这个技能目录由 Codex 与 Claude 共用，两侧看到的内容都会改变。' };
  async function sharedSkillGate(request) {
    const pass = { request, notes: [] };
    if (request.mode !== 'local' || !request.agent || !SHARED_GATED.has(request.action) || typeof request.id !== 'string') return pass;
    const current = await snapshot('local', true, { multiAgent: true });
    const record = current.skills.find(item => item.id === request.id);
    if (!record) return pass;
    const shared = record.agents?.length === 2 && !!record.perAgent?.[request.agent];
    const writes = !['skill.checkUpdate', 'skill.previewSource'].includes(request.action);
    if (shared && writes && request.expectedRevision !== record.revision) fail(409, 'SNAPSHOT_STALE', '这个技能在 Codex 或 Claude 中已有改动，请刷新后重试。');
    const view = shared ? record.perAgent[request.agent] : record;
    const rules = [];
    if (shared && request.action === 'skill.remove' && view.removeKind === 'directory')
      rules.push({ kind: 'scope', message: '这会移走两侧共用的技能目录：Codex 与 Claude 中都会失去这个技能（可从操作记录恢复）。' });
    // A standalone skill whose content lies inside a plugin of the other side: removing or
    // updating the content rewrites that plugin; removing a link to it does not.
    if (!shared && (request.action === 'skill.update' || request.action === 'skill.remove' && record.removeKind === 'directory')) {
      const other = request.agent === 'codex' ? 'claude' : 'codex';
      const real = path.dirname(record.realPath ?? record.path);
      const affected = [...new Set(current.plugins.filter(plugin => (plugin.agents ?? ['codex']).includes(other) && plugin.installed && plugin.realPath && inside(plugin.realPath, real)).map(plugin => plugin.displayName || plugin.name))];
      if (affected.length) rules.push({ kind: 'affected-plugins', message: `这个技能的内容在 ${AGENT_NAME[other]} 插件的目录中，这次改动会改写这些插件：`, items: affected });
    }
    if (rules.length && !request.confirm) throw new AppError(409, 'CONFIRMATION_REQUIRED', '这次改动会影响另一侧，请确认后重试。', { nativeRules: rules });
    if (!shared) return { request, notes: rules };
    const registry = await registryFor(environment('local'));
    const records = { codex: registry.sources[record.id], claude: registry.claudeSources?.[await realDirectory(path.dirname(record.perAgent.claude.path))] };
    const other = records[request.agent === 'codex' ? 'claude' : 'codex']; const otherName = AGENT_NAME[request.agent === 'codex' ? 'claude' : 'codex'];
    if (request.action === 'skill.connectSource') {
      const preview = previews.get(request.previewId);
      if (preview && other && !await sameSourceAt(other, preview))
        fail(409, 'SOURCE_CONFLICT', `另一侧（${otherName}）已关联到不同的来源 ${other.source}；请在这一侧选择相同的来源，或在另一侧重新关联到这个来源。`);
    }
    // Said before the preview is made, so a conflict is known early (4c review P3-01).
    if (request.action === 'skill.previewSource' && other && !await sameSourceAt(other, request))
      rules.push({ kind: 'scope', message: `另一侧（${otherName}）已关联到来源 ${other.source}；只有关联到相同的来源，这一侧才能关联。`, items: [other.source] });
    // 36c §6: records naming different sources leave neither side able to update (4c review P2-02).
    if (['skill.checkUpdate', 'skill.update'].includes(request.action) && records.codex && records.claude && !await sameSourceAt(records.codex, records.claude))
      fail(409, 'SOURCE_CONFLICT', `Codex 与 Claude 两侧为这个技能关联了不同的来源（${records.codex.source}、${records.claude.source}），两侧都不能更新；请在一侧重新关联到相同的来源。`);
    const notes = [...rules, ...(['skill.checkUpdate', 'skill.update'].includes(request.action) ? [BOTH_SEE] : [])];
    // The Claude side of a shared skill is switched through Claude's own object, against the
    // revision of the same snapshot (4c review P3-02).
    if (request.agent === 'claude' && request.action === 'skill.toggle') {
      const view = record.perAgent.claude;
      return { request: { ...request, id: claudeIds.skill(view.scope, path.dirname(view.path)), expectedRevision: view.revision }, notes };
    }
    return { request, notes };
  }
  // Phase 4d (HLD 3.3, DEC-SDX-025): a Claude plugin from a local directory or Git. With a Claude
  // manifest it goes into a Claude skills directory as a skills-directory plugin, by the same file
  // transaction as a skill (no settings entry points into SkillDock's data); without one, through a
  // marketplace SkillDock writes into its data and registers with Claude, then the command line.
  const CLAUDE_PLUGIN_SOURCES = new Set(['plugin.previewInstall', 'plugin.installSource']);
  const claudeRunner = found => options.claudeWriter ? options.claudeWriter({ cli: found.cli.claude, claudeRoot: found.claudeRoot }) : claudeWriter({ cli: found.cli.claude, claudeRoot: found.claudeRoot, env: agentEnv });
  const SKILLS_DIR_PLACE = { user: '个人技能目录', project: '当前项目的 .claude/skills' };
  // Phase 5b (HLD 3.3, 3.3A; DEC-SDX-005, 026): a Claude plugin from a marketplace. SkillDock stages
  // what Claude would install, previews the difference, checks the installation and the source again
  // before Claude's command line updates it, and reads back that Claude installed the candidate.
  const claudeFetchers = { ...defaultFetchers({ env: agentEnv }), ...options.claudeFetchers };
  const userCwdFor = found => fs.stat(project).then(() => project, () => path.dirname(found.claudeRoot.configDir));
  const sha256File = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  async function claudeInstall(found, cliId, scope, cwd) {
    const lists = await claudeLists({ ...options.claudeCatalog, claudeRoot: found.claudeRoot, project, cli: found.cli.claude, env: agentEnv });
    if (!lists) fail(422, 'CLI_UNAVAILABLE', '未找到可用的 Claude 命令行，暂不能修改 Claude。');
    const real = scope === 'user' ? null : await realDirectory(cwd);
    let install = null;
    for (const item of lists.plugins) if (item.id === cliId && item.scope === scope && (scope === 'user' || item.projectPath && await realDirectory(item.projectPath) === real)) install = item;
    return { lists, install };
  }
  async function claudePluginUpdate(target, { applying, previewId, internal }) {
    const env = environment('local'); const found = await agentLayer.discover({ force: true });
    const release = await fs.stat(found.claudeRoot.configDir).then(stat => stat.isDirectory(), () => false) ? acquireFileLock(operationLock(found.claudeRoot.configDir)) : () => {};
    let name = target.id; let staging; let keep = false;
    const journal = async entry => {
      const registry = await registryFor(env);
      registry.activity.unshift({ id: crypto.randomUUID(), action: 'plugin.update', agent: 'claude', target: name, createdAt: now(), canRestore: false, ...entry });
      await writeJson(env.registryFile, registry);
    };
    try {
      await verifyDirectoryRoot(env.stateBoundary);
      const claude = await claudeFor(found, project, true);
      if (claude.unconfirmed) fail(409, 'AGENT_UNCONFIRMED', claude.unconfirmed);
      const plugin = claude.plugins.find(item => item.id === target.id && item.installed);
      if (!plugin) fail(404, 'NOT_FOUND', '这个 Claude 插件已不在，请刷新后重试。');
      name = plugin.displayName || plugin.name;
      const cliId = `${plugin.name}@${plugin.marketplace}`; const scope = plugin.installation.scope;
      const cwd = scope === 'user' ? await userCwdFor(found) : plugin.installation.projectPath;
      if (scope !== 'user' && !(cwd && await exists(cwd))) fail(422, 'PROJECT_PATH_MISSING', `项目目录 ${cwd} 不存在，这条安装只读。`);
      const run = claudeRunner(found);
      const { lists, install } = await claudeInstall(found, cliId, scope, cwd);
      if (!install?.installPath) fail(404, 'NOT_FOUND', '未找到这个插件的安装目录，请刷新后重试。');
      const market = lists.marketplaces.find(item => item.name === plugin.marketplace);
      if (!market) fail(404, 'NOT_FOUND', '这个插件的 marketplace 已不在 Claude 中，请刷新后重试。');
      // Phase 5c: a marketplace SkillDock generated follows the source it was made from (HLD 3.3).
      const tracked = (await registryFor(env)).claudeDirectPlugins?.[plugin.marketplace];
      const direct = !!tracked && ownClaudeDirect({ name: market.name, source: market.path ?? market.installLocation }, tracked, env);
      // A remote marketplace is refreshed first: its entry may have moved on (HLD 3.3A).
      if (!['directory', 'file'].includes(market.source)) await run(['plugin', 'marketplace', 'update', plugin.marketplace, '--json'], { cwd: await userCwdFor(found) });
      const location = market.installLocation ?? market.path;
      const { entry, pluginRoot } = await marketplaceEntry(location, plugin.name);
      const source = direct ? { kind: 'direct' } : pluginSource(entry, market);
      const installed = await inspectTree(install.installPath, { skip: INSTALL_SKIP });
      const registry = await registryFor(env); const baselines = (registry.claudePluginBaselines ??= {}); const baseline = baselines[target.id];
      // MR-SDX-003: content changed since SkillDock last saw this version is not overwritten.
      if (baseline && baseline.version === install.version && baseline.fingerprint !== installed.fingerprint) fail(409, 'LOCAL_CHANGES', '已安装的插件内容相对上次记录有本地修改，不能自动覆盖；请先核对。');
      if (!applying) {
        const item = (status, extra) => ({ target, agent: 'claude', name, owner: 'Claude', route: 'claude-plugin', status, canCheck: true, canApply: status === 'available', canAutoApply: status === 'available' && !registry.claudePluginReview?.[target.id], checkedAt: now(), installedVersion: install.version, ...extra });
        if (['command', 'helper', 'unknown'].includes(source.kind)) return { message: OWNER_REASON[source.kind], updateItem: item('blocked', { message: OWNER_REASON[source.kind], reasonCode: 'OWNER_MANAGED' }) };
        let staged;
        if (direct) {
          // Staged afresh from the original source; SkillDock's copy changes only when the update is applied.
          staged = await stageSource(env, { sourceType: tracked.sourceType, source: tracked.source, subpath: tracked.subpath, ref: tracked.ref }, 'claude-plugin'); staging = staged.staging;
          if (staged.detail.name !== plugin.name) fail(409, 'SOURCE_CHANGED', `来源中的插件名称已改为 ${staged.detail.name}；请卸载后从来源重新安装。`);
        } else {
          staging = path.join(env.root, 'staging', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(staging, { recursive: true, mode: 0o700 });
          staged = await stageCandidate(source, { installLocation: location, pluginRoot, staging, fetchers: claudeFetchers });
        }
        // SkillDock writes the generated entry's version from the source (HLD 3.3).
        const predicted = await predictVersion(staged.candidate, direct ? staged.detail.version ? { version: staged.detail.version } : {} : entry, direct ? { kind: 'local' } : source, staged);
        const outcome = checkOutcome({ installedVersion: install.version, installedFingerprint: installed.fingerprint, candidateFingerprint: staged.tree.fingerprint, predicted });
        // Without a record, the check's own view is the baseline (MR-SDX-003), checked again before applying.
        if (!baseline || baseline.version !== install.version) { baselines[target.id] = { version: install.version, fingerprint: installed.fingerprint }; await writeJson(env.registryFile, registry); }
        const id = crypto.randomUUID();
        if (outcome.status === 'available') {
          previews.set(id, { id, kind: 'claude-plugin-update', agent: 'claude', mode: env.mode, created: previewNow(), staging, candidate: staged.candidate, tree: staged.tree, pluginId: target.id, installPath: install.installPath,
            installedVersion: install.version, baseline: installed.fingerprint, entry: JSON.stringify(entry), facts: { commit: staged.commit, sha256: staged.sha256, integrity: staged.integrity, packageVersion: staged.packageVersion },
            ...(direct ? { direct: { detail: staged.detail, originalDirectory: staged.originalDirectory } } : {}) });
          keep = true;
        }
        const review = outcome.status === 'available' && registry.claudePluginReview?.[target.id];
        const message = review ? `${outcome.message}\n上次装入的内容与预览不同；自动应用已暂停，请在更新页重新检查并手动应用。` : outcome.message;
        return { message, updateItem: item(outcome.status, { message, ...(outcome.reasonCode ? { reasonCode: outcome.reasonCode } : {}), changes: diffFiles(installed.entries, staged.tree.entries),
          ...(predicted && predicted !== 'unknown' ? { availableVersion: predicted } : {}), ...(outcome.status === 'available' ? { previewId: id } : {}) }) };
      }
      const preview = await assertPreview(env, previewId, 'claude-plugin-update', 'claude'); staging = preview.staging; previews.delete(previewId);
      if (preview.pluginId !== target.id) fail(409, 'PREVIEW_MISMATCH', '更新预览不属于这个插件。');
      if (install.installPath !== preview.installPath || install.version !== preview.installedVersion) fail(409, 'INSTALLATION_CHANGED', '插件安装在预览后发生变化，请重新检查。');
      if (installed.fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '插件在预览后发生变化，请重新检查。');
      // The source once more, by its kind (HLD 3.3A 应用前核对).
      if (JSON.stringify(entry) !== preview.entry) fail(409, 'SOURCE_CHANGED', 'marketplace 中这个插件的条目在预览后发生变化，请重新检查。');
      if (source.kind === 'direct') {
        if (tracked.sourceType === 'git' ? await claudeFetchers.resolve(tracked.source, tracked.ref) !== preview.facts.commit : (await inspectTree(preview.direct.originalDirectory)).fingerprint !== preview.tree.fingerprint)
          fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新检查。');
      } else if (['local', 'git-market'].includes(source.kind)) { if ((await inspectTree(localDirectory(source, location, pluginRoot))).fingerprint !== preview.tree.fingerprint) fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新检查。'); }
      else if (source.kind === 'git') { if (await claudeFetchers.resolve(source.url, source.ref) !== preview.facts.commit) fail(409, 'SOURCE_CHANGED', '来源仓库在预览后有新的提交，请重新检查。'); }
      else if (source.kind === 'npm') { const view = await claudeFetchers.npmView(source.spec, source.registry); if (view.version !== preview.facts.packageVersion || view.integrity && preview.facts.integrity && view.integrity !== preview.facts.integrity) fail(409, 'SOURCE_CHANGED', 'npm 包在预览后发生变化，请重新检查。'); }
      else if (source.kind === 'archive' && !source.sha256) { const file = path.join(staging, 'recheck.zip'); await claudeFetchers.download(source.url, file); if (await sha256File(file) !== preview.facts.sha256) fail(409, 'SOURCE_CHANGED', '压缩包在预览后发生变化，请重新检查。'); }
      // Claude overwrites a plugin without a version in place: what it held is copied first,
      // dependencies included, and a failed copy stops the update (HLD 3.3A).
      const copies = path.join(env.root, 'claude-plugin-copies', hash(target.id).slice(0, 20)); let copyNote = '';
      if (install.version === 'unknown') {
        await verifyDescendantDirectory(env.stateBoundary, copies); await fs.mkdir(copies, { recursive: true, mode: 0o700 });
        const next = path.join(copies, `next-${crypto.randomUUID()}`); await copyInstallation(install.installPath, next);
        await fs.rm(path.join(copies, 'latest'), { recursive: true, force: true }); await fs.rename(next, path.join(copies, 'latest'));
        copyNote = `\n更新前的内容已复制到 ${path.join(copies, 'latest')}；Claude 原地覆盖这类插件，无法经 Claude 回到旧版本。`;
      }
      // A generated marketplace takes the new content and entry first; Claude reads it from there.
      let undoDirect;
      if (source.kind === 'direct') {
        const destination = path.join(tracked.root, 'plugins', plugin.name); await verifyDescendantDirectory(env.stateBoundary, destination);
        const catalogFile = path.join(tracked.root, '.claude-plugin/marketplace.json'); const catalog = await fs.readFile(catalogFile);
        const previous = path.join(staging, 'previous'); await move(destination, previous);
        undoDirect = async () => { await fs.rm(destination, { recursive: true, force: true }); await move(previous, destination); await fs.writeFile(catalogFile, catalog); };
        try { await copySkill(preview.candidate, destination); await writeClaudeDirectMarketplace(env, { detail: preview.direct.detail }, { market: plugin.marketplace, root: tracked.root }); }
        catch (error) { await undoDirect(); throw error; }
      }
      try {
        if (source.kind === 'direct') await run(['plugin', 'marketplace', 'update', plugin.marketplace, '--json'], { cwd: await userCwdFor(found) });
        await run(['plugin', 'update', cliId, '--scope', scope, '--json'], { cwd });
      } catch (error) { if (undoDirect && error.code !== 'CLI_TIMEOUT') await undoDirect().catch(() => {}); throw error; }
      const { install: after } = await claudeInstall(found, cliId, scope, cwd);
      const loaded = after?.installPath && (await inspectTree(after.installPath, { skip: INSTALL_SKIP })).fingerprint === preview.tree.fingerprint;
      const fresh = await registryFor(env);
      if (!loaded) {
        // Reported as it is; automatic applying waits for a new preview (HLD 3.3A).
        (fresh.claudePluginReview ??= {})[target.id] = true;
        if (install.version === 'unknown' && !await exists(path.join(copies, 'baseline'))) await fs.rename(path.join(copies, 'latest'), path.join(copies, 'baseline')).catch(() => {});
        await writeJson(env.registryFile, fresh);
        fail(502, 'READBACK_FAILED', install.version === 'unknown' ? `Claude 命令行已返回，但装入的内容与预览不同；请重新检查。更新前的内容保留在 ${copies}。`
          : `Claude 命令行已返回，但装入的内容与预览不同；请重新检查。旧版本目录 ${install.installPath} 由 Claude 保留 14 天。`);
      }
      (fresh.claudePluginBaselines ??= {})[target.id] = { version: after.version, fingerprint: preview.tree.fingerprint };
      if (source.kind === 'direct' && fresh.claudeDirectPlugins?.[plugin.marketplace]) Object.assign(fresh.claudeDirectPlugins[plugin.marketplace], { fingerprint: preview.tree.fingerprint, ...(preview.facts.commit ? { commit: preview.facts.commit } : {}) });
      if (!internal && fresh.claudePluginReview) delete fresh.claudePluginReview[target.id];
      await writeJson(env.registryFile, fresh);
      if (install.version === 'unknown') await fs.rm(path.join(copies, 'baseline'), { recursive: true, force: true });
      const message = `已更新 Claude 插件 ${name}${after.version !== install.version ? `（${install.version} → ${after.version}）` : ''}。新会话生效，已打开的会话需要重载插件。${copyNote}`;
      await journal({ status: 'success', message });
      return { message, needsReload: true, agent: 'claude' };
    } catch (error) {
      if (applying) await journal({ status: 'error', message: redact(error.message), reasonCode: error.code || 'OPERATION_FAILED' }).catch(() => {});
      throw error;
    } finally {
      release(); claudeCache = undefined;
      if (staging && !keep) await removeStaging(env, staging).catch(() => {});
    }
  }
  async function claudePluginSourceAction(request) {
    const env = environment('local'); const roots = await claudeSkillRoots(); const { found } = roots;
    const release = await fs.stat(found.claudeRoot.configDir).then(stat => stat.isDirectory(), () => false) ? acquireFileLock(operationLock(found.claudeRoot.configDir)) : () => {};
    let registry; let original; const undo = []; const activityId = crypto.randomUUID(); let target = request.source ?? 'plugin'; let directMarket;
    moveWarnings.length = 0;
    try {
      await verifyDirectoryRoot(env.stateBoundary); registry = await registryFor(env); original = structuredClone(registry);
      const claude = await claudeFor(found, project, true);
      if (claude.unconfirmed) fail(409, 'AGENT_UNCONFIRMED', claude.unconfirmed);
      if (request.action === 'plugin.previewInstall') {
        const staged = await stageSource(env, request, 'claude-plugin'); const detail = staged.detail;
        const rules = [];
        if (detail.mode === 'skills-dir') {
          const same = claude.plugins.filter(item => item.marketplace === 'skills-dir' && item.name === detail.name).map(item => item.installedPath);
          if (same.length) rules.push({ kind: 'scope', message: '已有同名的技能目录插件；个人目录中的会遮蔽项目中的同名插件：', items: same });
          rules.push({ kind: 'scope', message: '放入当前项目的 .claude/skills 时，只有 Claude 以该项目为工作目录并信任它时才会加载。' });
        } else {
          const location = claudeDirectLocation(env, staged);
          if (claude.plugins.some(item => item.installed && `${item.name}@${item.marketplace}` === location.pluginId)) { await removeStaging(env, staged.staging); fail(409, 'PLUGIN_ALREADY_INSTALLED', '这个来源的插件已安装到 Claude。'); }
          rules.push({ kind: 'scope', message: 'SkillDock 会在自己的数据目录中生成一个本地 marketplace 并登记到 Claude（用户设置中会出现一条指向它的声明）；卸载最后一个这样安装的插件时一并移除。只能安装给当前用户或当前项目的本地设置。' });
        }
        rules.push({ kind: 'reload', message: '新会话生效；已打开的 Claude 会话需要重载插件（/reload-plugins）。' });
        const id = crypto.randomUUID(); previews.set(id, { ...staged, id, mode: env.mode, kind: 'claude-plugin-install', agent: 'claude', created: previewNow() });
        return { message: '插件安装预览已准备好。', agent: 'claude', pluginPreview: { agent: 'claude', id, name: detail.name, version: detail.version, description: detail.description, source: staged.source, sourceType: staged.sourceType,
          subpath: staged.subpath, ref: staged.ref, commit: staged.commit, files: staged.tree.files, bytes: staged.tree.bytes, skills: detail.skills, skillDetails: [], canSelectSkills: false, components: detail.commands ? ['commands'] : [], duplicates: [],
          manifests: detail.manifests, scopes: detail.mode === 'skills-dir' ? ['user', 'project'] : ['user', 'local'], defaultScope: 'user', nativeRules: rules } };
      }
      // plugin.installSource
      if (request.enabledSkills !== undefined) fail(422, 'UNSUPPORTED_FOR_AGENT', 'Claude 插件不能只启用部分技能。');
      const staged = await assertPreview(env, request.previewId, 'claude-plugin-install', 'claude'); const detail = staged.detail; target = detail.name;
      const scope = request.scope ?? 'user';
      let result;
      if (detail.mode === 'skills-dir') {
        if (scope === 'local') fail(400, 'INVALID_ACTION', '带 Claude manifest 的插件放入个人技能目录或当前项目的 .claude/skills，不使用本地设置作用域。');
        const root = scope === 'user' ? roots.user : roots.project; const destination = path.join(root, detail.name);
        const side = claudeSkillSide(env, registry, roots, request);
        const boundaries = await side.prepareInstall({ root });
        if (await exists(destination)) fail(409, 'TARGET_EXISTS', '同名安装目录已存在，不能覆盖。');
        await move(staged.candidate, destination, boundaries); undo.push(async () => { if ((await inspectTree(destination)).fingerprint === staged.tree.fingerprint) await move(destination, staged.candidate, boundaries); });
        (registry.claudeSources ??= {})[await realDirectory(destination)] = provenance(staged, destination);
        const after = await claudeFor(found, project, true);
        if (!after.plugins.some(item => item.marketplace === 'skills-dir' && item.installedPath === destination)) fail(502, 'READBACK_FAILED', '插件目录已放入，但 Claude 的清单中没有读到它，请刷新核实。');
        // A same-named plugin in the personal directory hides a project one (HLD 3.3): said as it is (4d review P3-08).
        const shadowed = scope === 'project' && after.plugins.some(item => item.marketplace === 'skills-dir' && item.name === detail.name && item.installation?.scope === 'user');
        result = { message: scope === 'user' ? `已把 Claude 插件 ${detail.name} 放入个人技能目录。新会话生效，已打开的会话需要重载插件。`
          : shadowed ? `已把 Claude 插件 ${detail.name} 放入当前项目的 .claude/skills；个人技能目录中有同名插件，它会遮蔽这一个，这一个不会加载。`
          : `已把 Claude 插件 ${detail.name} 放入当前项目的 .claude/skills。Claude 信任该项目后加载；已打开的会话需要重载插件。`, needsReload: !shadowed, agent: 'claude' };
      } else {
        if (scope === 'project') fail(422, 'UNSUPPORTED_FOR_AGENT', '不带 Claude manifest 的来源只能安装给当前用户或当前项目的本地设置：项目共享设置会引用只在本机存在的 marketplace。');
        if (!found.cli.claude.available) fail(422, 'CLI_UNAVAILABLE', '未找到可用的 Claude 命令行，暂不能修改 Claude。');
        const cwd = scope === 'user' ? (await fs.stat(project).then(() => project, () => path.dirname(found.claudeRoot.configDir))) : project;
        const exposure = scope === 'local' ? await localSettingsExposure(cwd, options.claudeGit ? { git: options.claudeGit } : {}) : null;
        if (exposure && typeof request.gitExclude !== 'boolean')
          throw new AppError(409, 'CONFIRMATION_REQUIRED', `这次会新建 ${exposure.relative}，它不在 Git 的忽略规则中；请选择是否把它写入本机的 .git/info/exclude。`,
            { nativeRules: [{ kind: 'scope', message: '项目本地设置只属于你；不忽略它可能被误提交。写入 .git/info/exclude 只影响本机，不改动受版本管理的 .gitignore。', items: [exposure.relative] }] });
        const location = claudeDirectLocation(env, staged); const { market, root, pluginId } = location;
        // A same-named marketplace that is not this one is the user's: never installed from (4d review P3-01).
        const listedMarket = claude.marketplaces.find(item => item.name === market);
        if (listedMarket && !ownClaudeDirect(listedMarket, { root }, env)) fail(409, 'MARKETPLACE_EXISTS', '安装来源名称已被另一个目录使用，未修改该来源。');
        const destination = path.join(root, 'plugins', detail.name);
        await verifyDescendantDirectory(env.stateBoundary, destination);
        if (await exists(destination)) {
          const tree = await inspectTree(destination);
          if (tree.fingerprint !== staged.tree.fingerprint) {
            // What an earlier attempt left is replaced when it is what the record says, or Claude does
            // not read it, as on the Codex side (4d review P2-03).
            const previous = registry.claudeDirectPlugins?.[market];
            if (listedMarket && !(previous?.root === root && previous.name === detail.name && previous.fingerprint === tree.fingerprint))
              fail(409, 'TARGET_EXISTS', '之前为 Claude 生成的同一来源目录仍然存在且内容不同，请先核对；不再需要时，可在 Marketplace 页移除这个 marketplace 后重试。');
            const backup = path.join(staged.staging, 'previous');
            await move(destination, backup);
            try { await copySkill(staged.candidate, destination); }
            catch (error) { await fs.rm(destination, { recursive: true, force: true }); await move(backup, destination); throw error; }
          }
        } else { await fs.mkdir(path.dirname(destination), { recursive: true }); await copySkill(staged.candidate, destination); }
        await writeClaudeDirectMarketplace(env, staged, location);
        // Kept even if the command line fails: Claude may already have registered the marketplace.
        const tracked = { root, name: detail.name, source: staged.source, sourceType: staged.sourceType, subpath: staged.subpath, ref: staged.ref, commit: staged.commit, fingerprint: staged.tree.fingerprint };
        (registry.claudeDirectPlugins ??= {})[market] = tracked; (original.claudeDirectPlugins ??= {})[market] = tracked;
        await writeJson(env.registryFile, registry); directMarket = market;
        const run = claudeRunner(found);
        if (!claude.marketplaces.some(item => item.name === market)) {
          await run(['plugin', 'marketplace', 'add', root, '--scope', 'user', '--json'], { cwd });
          if (!(await claudeFor(found, project, true)).marketplaces.some(item => item.name === market)) fail(502, 'READBACK_FAILED', '未能确认 SkillDock 生成的 marketplace 已登记到 Claude，请刷新核实。');
        }
        await run(['plugin', 'install', pluginId, '--scope', scope, '--json'], { cwd });
        const real = scope === 'user' ? null : await realDirectory(cwd);
        const installs = (await claudeFor(found, project, true)).plugins.filter(item => item.installed && `${item.name}@${item.marketplace}` === pluginId && item.installation?.scope === scope);
        if (!(await Promise.all(installs.map(async item => item.installation.projectPath ? realDirectory(item.installation.projectPath) : null))).includes(real)) fail(502, 'READBACK_FAILED', 'Claude 命令行已返回，但读回的插件清单中没有这次安装，请刷新核实。');
        let note = '';
        if (exposure) { if (request.gitExclude) { if (await exists(exposure.file)) { await excludeLocalSettings(exposure, options.claudeGit ? { git: options.claudeGit } : {}); note = `\n已把 ${exposure.relative} 写入本机的 .git/info/exclude。`; } } else note = `\n${exposure.relative} 不在 Git 的忽略规则中，注意不要提交它。`; }
        result = { message: `${scope === 'user' ? `已为当前用户安装 Claude 插件 ${detail.name}。` : `已在当前项目中安装 Claude 插件 ${detail.name}，只给你自己使用。`}新会话生效，已打开的会话需要重载插件。${note}`, needsReload: true, agent: 'claude' };
      }
      previews.delete(request.previewId);
      if (moveWarnings.length) result.message += `\n${moveWarnings.join('\n')}`;
      registry.activity.unshift({ id: activityId, action: request.action, agent: 'claude', target, createdAt: now(), status: 'success', message: result.message, canRestore: false });
      await writeJson(env.registryFile, registry);
      await removeStaging(env, staged.staging).catch(() => {});
      claudeCache = undefined;
      return result;
    } catch (error) {
      let rollbackError;
      for (const reverse of undo.reverse()) try { await reverse(); } catch (e) { rollbackError = e; }
      let message = redact(error.message); if (rollbackError) message += `；自动恢复未完成：${redact(rollbackError.message)}，请保留备份区。`;
      // A failed install takes back the marketplace it generated, unless something is installed from it (4d review P2-03).
      if (directMarket) {
        try {
          const outcome = await cleanupClaudeDirect(directMarket);
          if (outcome === 'removed' || outcome === 'foreign') { delete original.claudeDirectPlugins[directMarket]; message += '\n已撤销这次生成的本地 marketplace。'; }
          else message += '\n这次生成的本地 marketplace 仍有从它安装的插件，已保留。';
        }
        catch (cleanupError) { message += `\nSkillDock 生成的本地 marketplace ${directMarket} 未能清理：${redact(cleanupError.message)}可在 Marketplace 页移除它，或停用 Claude 管理时一并清理。`; }
      }
      if (original && request.action === 'plugin.installSource' && !['CONFIRMATION_REQUIRED', 'STALE_PREVIEW'].includes(error.code)) {
        original.activity.unshift({ id: activityId, action: request.action, agent: 'claude', target, createdAt: now(), status: 'error', message, reasonCode: error.code || 'OPERATION_FAILED', canRestore: false });
        try { await writeJson(env.registryFile, original); } catch { message += '；操作记录无法写入。'; }
      }
      throw new AppError(error.status || 500, error.code || 'OPERATION_FAILED', message, error.nativeRules ? { nativeRules: error.nativeRules } : {});
    } finally { moveWarnings.length = 0; release(); claudeCache = undefined; }
  }
  /**
   * A skills-directory plugin leaves the Claude skills directory by the file transaction (to the
   * restorable area), like a skill. The source record changes in the same write as the activity
   * record (`change`); if that write fails, `undo` moves the directory back (4d review P3-02).
   */
  async function removeSkillsDirPlugin(plugin) {
    const env = environment('local'); const roots = await claudeSkillRoots();
    const directory = plugin.installedPath;
    if (!directory || ![roots.user, roots.project].includes(path.dirname(directory))) fail(403, 'ROOT_BOUNDARY', '只能移除个人技能目录或当前项目 .claude/skills 中的技能目录插件。');
    const boundary = await captureDirectoryRoot(path.dirname(directory));
    if ((await claudeProtectedRoots(roots)).some(root => inside(root, boundary.real))) fail(403, 'TARGET_BOUNDARY', 'Claude 的技能根指向插件或系统管理目录，不能修改其中的内容。');
    const isLink = (await fs.lstat(directory)).isSymbolicLink();
    if (!isLink && !inside(boundary.real, await fs.realpath(directory))) fail(403, 'ROOT_BOUNDARY', '插件目录的实际位置越出 Claude 的技能根。');
    const sources = (await registryFor(env)).claudeSources ?? {}; const key = await realDirectory(directory);
    const fingerprint = await objectFingerprint(directory); const parent = await parentIdentity(directory);
    const backup = path.join(env.root, 'quarantine', crypto.randomUUID());
    await move(directory, backup, [boundary]);
    const restore = { kind: 'remove', agent: 'claude', plugin: true, directory, backup, ...parent, priorFingerprint: fingerprint, skillId: plugin.id, ...(isLink ? { link: true } : { source: sources[key], sourceKey: key }) };
    return { restore, activityPath: directory, change: registry => { if (!isLink && registry.claudeSources) delete registry.claudeSources[key]; },
      undo: () => move(backup, directory, [boundary]) };
  }
  /**
   * A marketplace SkillDock wrote leaves Claude once nothing is installed from it — by the command
   * line's list or by Claude's own record, which also lists other projects (4d review P2-04) — and
   * its files with it (HLD 3.3). Only the marketplace that is this record's is removed from Claude,
   * with a readback (P2-01, P3-01). Returns 'removed', 'elsewhere' (still installed in a project
   * the list does not show), 'foreign' (Claude has a same-named marketplace that is not this one:
   * left alone, only SkillDock's files go), or null.
   */
  async function cleanupClaudeDirect(market) {
    const env = environment('local'); const tracked = (await registryFor(env)).claudeDirectPlugins?.[market];
    if (!tracked) return null;
    const found = await agentLayer.discover(); const claude = await claudeFor(found, project, true);
    // An unreadable Claude is not an empty one.
    if (claude.unconfirmed) fail(409, 'AGENT_UNCONFIRMED', claude.unconfirmed);
    const listed = claude.marketplaces.find(item => item.name === market); const own = ownClaudeDirect(listed, tracked, env);
    if (own && claude.plugins.some(item => item.installed && item.marketplace === market)) return null;
    if (own && claude.recordedInstalls?.some(item => item.id.endsWith(`@${market}`))) return 'elsewhere';
    if (own) {
      await claudeRunner(found)(['plugin', 'marketplace', 'remove', market, '--json'], { cwd: await fs.stat(project).then(() => project, () => path.dirname(found.claudeRoot.configDir)) });
      const after = await claudeFor(found, project, true);
      if (after.marketplaces.some(item => item.name === market)) fail(502, 'READBACK_FAILED', 'Claude 命令行已返回，但这个 marketplace 仍在清单中，请刷新核实。');
      if ((after.declarations?.[market] ?? []).some(layer => layer !== 'managed')) fail(502, 'READBACK_FAILED', 'marketplace 已从清单中移除，但设置中仍有它的声明，以后可能被重新添加；请刷新核实。');
    }
    await dropClaudeDirectFiles(env, market, tracked);
    return listed && !own ? 'foreign' : 'removed';
  }
  /** SkillDock's own files and record for a generated marketplace; only its own directory. */
  async function dropClaudeDirectFiles(env, market, tracked) {
    if (tracked.root === claudeDirectRoot(env, market)) { await verifyDescendantDirectory(env.stateBoundary, tracked.root); await fs.rm(tracked.root, { recursive: true, force: true }); }
    const registry = await registryFor(env); delete registry.claudeDirectPlugins?.[market]; await writeJson(env.registryFile, registry);
  }
  async function claudeSkillAction(request) {
    const env = environment('local'); const roots = await claudeSkillRoots();
    // DEC-SDX-010: the Claude lock after the instance and Codex locks; never creating the root.
    const release = await fs.stat(roots.found.claudeRoot.configDir).then(stat => stat.isDirectory(), () => false) ? acquireFileLock(operationLock(roots.found.claudeRoot.configDir)) : () => {};
    let registry; let original; const undo = []; const activityId = crypto.randomUUID(); let target = request.id || request.source || 'skill';
    moveWarnings.length = 0;
    try {
      await verifyDirectoryRoot(env.stateBoundary);
      registry = await registryFor(env); original = structuredClone(registry);
      const outcome = await skillOperation(claudeSkillSide(env, registry, roots, request), request, { env, registry, undo, activityId });
      if (outcome.early) return outcome.early;
      const { result, restore, activityPath, consumed } = outcome; target = outcome.target ?? target;
      if (consumed) previews.delete(request.previewId);
      if (moveWarnings.length) result.message += `\n${moveWarnings.join('\n')}`;
      registry.activity.unshift({ id: activityId, action: request.action, agent: 'claude', target, ...(activityPath ? { path: activityPath } : {}), createdAt: now(), status: 'success', message: result.message, canRestore: !!restore, ...(restore ? { restore } : {}) });
      await writeJson(env.registryFile, registry);
      if (consumed) await removeStaging(env, consumed.staging).catch(() => {});
      return result;
    } catch (error) {
      let rollbackError;
      for (const reverse of undo.reverse()) try { await reverse(); } catch (e) { rollbackError = e; }
      let message = redact(error.message); if (rollbackError) message += `；自动恢复未完成：${redact(rollbackError.message)}，请保留备份区。`;
      const quiet = ['CONFIRMATION_REQUIRED', 'SNAPSHOT_STALE', 'NOT_FOUND', 'STALE_PREVIEW'].includes(error.code) || ['skill.previewInstall', 'skill.previewSource', 'skill.checkUpdate'].includes(request.action);
      if (original && !quiet) {
        original.activity.unshift({ id: activityId, action: request.action, agent: 'claude', target, createdAt: now(), status: 'error', message, reasonCode: error.code || 'OPERATION_FAILED', canRestore: false });
        try { await writeJson(env.registryFile, original); } catch { message += '；操作记录无法写入。'; }
      }
      throw new AppError(error.status || 500, error.code || 'OPERATION_FAILED', message);
    } finally { moveWarnings.length = 0; release(); claudeCache = undefined; }
  }

  async function skill(mode, id) {
    if (typeof id !== 'string' || id.length > 300) fail(400, 'INVALID_ID', '需要技能 ID。');
    const record = (await snapshot(mode, false, { multiAgent: id.startsWith('claude:') })).skills.find(item => item.id === id);
    if (!record) fail(404, 'NOT_FOUND', '未找到该技能，请刷新清单。');
    const content = (await metadata(path.dirname(record.path))).content;
    return { skill: record, content };
  }
  async function assertWritableSkill(env, id, capability, current) {
    const record = (current || await snapshot(env.mode)).skills.find(item => item.id === id);
    if (!record) fail(404, 'NOT_FOUND', '未找到该技能，请刷新。');
    if (!record[capability]) fail(403, 'PROTECTED_SKILL', record.reason || '该技能不支持此操作。');
    const directory = path.dirname(record.path);
    const realDirectory = await fs.realpath(directory);
    if (env.mode === 'sandbox' && !inside(env.root, realDirectory)) fail(403, 'SANDBOX_BOUNDARY', '技能实际位置越出演练范围。');
    if (!record.pluginId) {
      const boundary = env.managedRoots.find(root => inside(root.directory, directory));
      if (!boundary) fail(403, 'ROOT_BOUNDARY', '技能不属于启动时确认的受管根。');
      const location = await skillLocation(boundary, directory, env.skillLinks);
      if (!inside(boundary.real, realDirectory) && (!location.isLink || capability !== 'canToggle' && !(capability === 'canRemove' && location.directLink))) fail(403, 'ROOT_BOUNDARY', '技能实际位置越出原受管根。');
    }
    if (inside(realDirectory, fileURLToPath(import.meta.url)) || directory.split(path.sep).includes('.system') || inside('/etc/codex/skills', realDirectory)) fail(403, 'PROTECTED_SKILL', '应用自身或系统内容不可修改。');
    if (capability === 'canUpdate' && await exists(path.join(directory, '.git'))) fail(422, 'GIT_OWNER_MANAGED', '该目录本身是 Git 仓库，SkillDock 不替换工作树或 .git 元数据。');
    return { record, directory };
  }
  // Who sees each copy, and how each side would lose it, are part of it (4c review P2-04).
  const removalGroupSignature = group => JSON.stringify(group.map(record => ({ id: record.id, name: record.name, path: record.path, canRemove: record.canRemove, pluginId: record.pluginId, aliases: record.aliases, isLink: record.isLink,
    agents: record.agents, removeKind: record.removeKind, sides: record.perAgent && Object.fromEntries(Object.entries(record.perAgent).map(([agent, view]) => [agent, view.removeKind ?? null])) })).sort((a, b) => a.id.localeCompare(b.id)));
  async function removalIdentity(directory) {
    const stat = await fs.lstat(directory);
    return { dev: String(stat.dev), ino: String(stat.ino), real: await fs.realpath(directory), fingerprint: await objectFingerprint(directory), ...await parentIdentity(directory) };
  }
  // 36c §6 batch removal: a version-2 request sees both Agents' copies of a name; each one is
  // checked by its own side; moving a shared real directory, or rewriting a plugin of the other
  // side, is confirmed before the whole batch runs. Version 1 keeps 0.10.2.
  async function removalItem(env, id, current, multiAgent) {
    const record = current.skills.find(item => item.id === id);
    if (multiAgent && record?.agents?.join() === 'claude') {
      const { directory, boundary } = await claudeSkillRecord(id, 'canRemove', { expectedRevision: record.revision });
      return { record, directory, agent: 'claude', boundaries: [boundary] };
    }
    const { record: codex, directory } = await assertWritableSkill(env, id, 'canRemove', current);
    return { record: codex, directory, agent: 'codex', boundaries: [] };
  }
  function removalRules(items, current) {
    const rules = [];
    const shared = items.filter(({ record }) => record.agents?.length === 2 && record.removeKind === 'directory').map(({ record }) => record.path);
    if (shared.length) rules.push({ kind: 'scope', message: '这些技能目录由 Codex 与 Claude 共用，移走后两侧都会失去它们（可从操作记录恢复）：', items: shared });
    const affected = new Set();
    for (const { record, agent } of items) {
      if (record.agents?.length === 2 || record.removeKind !== 'directory') continue;
      const real = path.dirname(record.realPath ?? record.path); const other = agent === 'codex' ? 'claude' : 'codex';
      for (const plugin of current.plugins) if ((plugin.agents ?? ['codex']).includes(other) && plugin.installed && plugin.realPath && inside(plugin.realPath, real)) affected.add(plugin.displayName || plugin.name);
    }
    if (affected.size) rules.push({ kind: 'affected-plugins', message: '其中有技能的内容在另一侧插件的目录中，移除会改写这些插件：', items: [...affected] });
    return rules;
  }
  async function previewRemoval(env, request) {
    const multiAgent = request.agent !== undefined && env.mode === 'local';
    const current = await snapshot(env.mode, true, { multiAgent }); const group = current.skills.filter(record => record.name === request.groupName);
    if (group.length < 2 || request.ids.some(id => !group.some(record => record.id === id))) fail(409, 'REMOVAL_CHANGED', '同名技能清单已变化，请重新选择。');
    const selected = []; const remove = []; const keep = group.filter(record => !request.ids.includes(record.id)); const items = [];
    for (const id of request.ids) {
      const item = await removalItem(env, id, current, multiAgent); items.push(item);
      selected.push({ id, directory: item.directory, agent: item.agent, identity: await removalIdentity(item.directory) }); remove.push(item.record);
    }
    await assertRemovalIsolation(selected, current);
    const rules = multiAgent ? removalRules(items, current) : [];
    // Keep preview data bounded without creating files or activity records.
    for (const [id, preview] of removalPreviews) if (previewNow() - preview.created > 30 * 60000) removalPreviews.delete(id);
    while (removalPreviews.size >= 20) removalPreviews.delete(removalPreviews.keys().next().value);
    const id = crypto.randomUUID(); const result = { id, name: request.groupName, remove, keep };
    removalPreviews.set(id, { mode: env.mode, created: previewNow(), group: removalGroupSignature(group), selected, result, multiAgent, rules });
    return { message: '移除预览已准备好，请核对每份路径。', removalPreview: result, ...(rules.length ? { nativeRules: rules } : {}) };
  }
  async function verifyRemovalItem(env, item, current, multiAgent = false) {
    const writable = await removalItem(env, item.id, current, multiAgent);
    if (writable.directory !== item.directory || JSON.stringify(await removalIdentity(item.directory)) !== JSON.stringify(item.identity)) fail(409, 'REMOVAL_CHANGED', '选中的技能在预览后发生变化，请重新选择。');
    return writable;
  }
  async function assertRemovalIsolation(selected, current) {
    const locations = await Promise.all(current.skills.map(async record => ({ id: record.id, real: await fs.realpath(path.dirname(record.path)) })));
    for (const item of selected) if (!item.identity.fingerprint.startsWith('link:') && locations.some(other => other.id !== item.id && inside(item.identity.real, other.real))) fail(409, 'REMOVAL_OVERLAP', '所选目录还包含其他已发现技能，不能作为单份技能移除。请分别管理这些位置。');
  }
  async function assertTargetRoot(env) {
    await verifyDirectoryRoot(env.codexBoundary);
    const boundary = env.managedRoots.find(root => root.directory === env.skills); await verifyDirectoryRoot(boundary);
    if (env.mode === 'sandbox' && !inside(env.root, boundary.real)) fail(403, 'SANDBOX_BOUNDARY', '安装根越出演练范围。');
    await fs.mkdir(env.skills, { recursive: true });
    await verifyDirectoryRoot(boundary);
    if ((await protectedRoots(env)).some(root => inside(root, boundary.real))) fail(403, 'TARGET_BOUNDARY', '技能安装根指向插件或系统管理目录，不能写入。');
    Object.assign(boundary, await captureDirectoryRoot(env.skills));
  }
  async function assertConfigBoundary(env) {
    await verifyDirectoryRoot(env.codexBoundary);
    if (await fs.realpath(path.dirname(env.config)) !== env.codexRootReal) fail(403, 'CONFIG_BOUNDARY', '配置父目录身份已变化，已停止写入。');
    await verifyDescendantDirectory(env.stateBoundary, path.join(env.root, 'config-backups'));
  }
  async function parentIdentity(directory) {
    const parent = path.dirname(directory); const real = await fs.realpath(parent); const stat = await fs.stat(parent);
    return { parentReal: real, parentDev: String(stat.dev), parentIno: String(stat.ino) };
  }
  async function verifyRestoreParent(env, entry) {
    const actual = await parentIdentity(entry.directory);
    if (!entry.parentReal || actual.parentReal !== entry.parentReal || actual.parentDev !== entry.parentDev || actual.parentIno !== entry.parentIno) fail(409, 'RESTORE_BOUNDARY', '原父目录身份或链接发生变化，已停止恢复。');
    if (env.mode === 'sandbox' && !inside(env.root, actual.parentReal)) fail(403, 'RESTORE_BOUNDARY', '恢复目标越出演练范围。');
    const protectedPaths = await protectedRoots(env);
    if (protectedPaths.some(root => inside(root, actual.parentReal))) fail(403, 'RESTORE_BOUNDARY', '恢复目标位于托管或系统目录。');
  }
  function assertSandboxSource(env, source) {
    if (env.mode === 'sandbox' && (!path.isAbsolute(source) || !inside(env.root, source))) fail(403, 'SANDBOX_BOUNDARY', '演练模式仅接受演练目录内的来源；请使用示例路径。');
  }
  async function stageSource(env, request, kind = 'skill') {
    const location = request.sourceType === 'git' ? githubDirectory(request.source) : null;
    const source = validateSource(location?.source || request.source, request.sourceType);
    let subpath = validateSubpath(request.subpath); let ref = request.ref; validateRef(ref); assertSandboxSource(env, source);
    if (location && subpath !== '.') fail(400, 'GITHUB_SUBPATH_CONFLICT', '目录链接已包含子目录，请清空高级子目录选项后重试。');
    if (path.isAbsolute(source)) {
      if (!(await exists(source))) fail(404, 'SOURCE_MISSING', '来源目录不存在。');
      if (env.mode === 'sandbox' && !inside(env.root, await fs.realpath(source))) fail(403, 'SANDBOX_BOUNDARY', '来源链接越出演练目录。');
    }
    const staging = path.join(env.root, 'staging', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      let sourceRoot = source; let commit;
      if (request.sourceType === 'git') {
        sourceRoot = path.join(staging, 'repository');
        commit = await checkoutGit(source, ref, sourceRoot, { githubDirectory: location,
          onLocation: selected => { ref = selected.ref; subpath = selected.subpath; } });
      }
      const realRoot = await fs.realpath(sourceRoot); const directory = path.resolve(realRoot, subpath);
      if (!inside(realRoot, directory) || !(await exists(directory)) || !inside(realRoot, await fs.realpath(directory))) fail(422, 'SOURCE_BOUNDARY', '子路径不存在或越出来源根目录。');
      const candidate = path.join(staging, 'candidate'); const tree = await copySkill(directory, candidate);
      // A Claude plugin without any manifest is named after its source: the directory, the Git
      // subpath, or the repository (4d review P1-01).
      // `./` and a trailing slash name the same directory; a repository's `.git` directory names it (re-review P3-04).
      const sourceName = () => {
        if (request.sourceType !== 'git') return path.basename(directory);
        const inner = path.relative(realRoot, directory);
        if (inner) return path.basename(inner);
        const parts = source.replace(/[/\\]+$/, '').split(/[/:\\]/).filter(Boolean); const last = parts.pop() ?? '';
        return (last === '.git' ? parts.pop() ?? '' : last).replace(/\.git$/, '');
      };
      const detail = kind === 'plugin' ? await inspectPlugin(candidate) : kind === 'claude-plugin' ? await inspectClaudePlugin(candidate, sourceName()) : await metadata(candidate);
      if (kind === 'skill') { const icons = createIconCatalog(); detail.icon = await icons.skill(candidate); detail.iconAssets = icons.assets; }
      return { staging, candidate, source, sourceType: request.sourceType, subpath, ref, commit, originalDirectory: directory, detail, tree };
    } catch (e) { await fs.rm(staging, { recursive: true, force: true }); throw e; }
  }
  async function assertPreview(env, id, kind, agent = 'codex') {
    const preview = previews.get(id);
    // 36c §6: a preview acts only for the side it was made for.
    if (!preview || preview.mode !== env.mode || preview.kind !== kind || (preview.agent ?? 'codex') !== agent || previewNow() - preview.created > 30 * 60000) fail(409, 'STALE_PREVIEW', '预览已过期或属于其他环境，请重新预览。');
    if ((await inspectTree(preview.candidate)).fingerprint !== preview.tree.fingerprint) fail(409, 'STAGED_CHANGED', '暂存内容发生变化，请重新预览。');
    if (preview.sourceType === 'local' && (await inspectTree(preview.originalDirectory)).fingerprint !== preview.tree.fingerprint) fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新预览。');
    return preview;
  }
  const provenance = (preview, directory) => ({ directory, source: preview.source, sourceType: preview.sourceType, subpath: preview.subpath, ref: preview.ref, commit: preview.commit, fingerprint: preview.tree.fingerprint, files: preview.tree.entries, installedAt: now(), generation: crypto.randomUUID() });
  const moveWarnings = [];
  async function move(from, to, extraBoundaries = []) {
    const boundaries = [...Object.values(environments).flatMap(env => [env.stateBoundary, env.cacheBoundary, ...env.managedRoots]), ...extraBoundaries].sort((a, b) => b.directory.length - a.directory.length);
    const guard = async () => {
      for (const target of [from, to]) {
        const parent = path.dirname(target); const boundary = boundaries.find(root => inside(root.directory, parent));
        if (!boundary) fail(403, 'ROOT_BOUNDARY', '移动位置不在固定受管根内。');
        await verifyDescendantDirectory(boundary, parent);
      }
    };
    const result = await moveObject(from, to, { guard, ...(options.moveRename ? { rename: options.moveRename } : {}) });
    if (result?.retainedCopy) moveWarnings.push(`移动已完成，另有未清理的恢复副本：${result.retainedCopy}`);
  }
  async function refreshDirectSource(env, registry, marketId) {
    const source = registry.directPlugins[marketId];
    const staged = await stageSource(env, source, 'plugin');
    try {
      if (staged.detail.name !== source.name) fail(409, 'PLUGIN_IDENTITY', '单个插件来源中的名称发生变化，请重新安装并核对。');
      const location = directLocation(env, { ...source, detail: staged.detail });
      if (location.root !== source.root || location.market !== marketId) fail(409, 'SOURCE_BOUNDARY', '单个插件来源登记不一致。');
      const destination = path.join(source.root, 'plugins', source.name);
      await verifyDescendantDirectory(env.stateBoundary, destination);
      const backup = path.join(staged.staging, 'previous');
      await move(destination, backup);
      try { await move(staged.candidate, destination); }
      catch (error) { await move(backup, destination); throw error; }
      source.commit = staged.commit; source.fingerprint = staged.tree.fingerprint;
      cachedCatalog = undefined;
    } finally { await removeStaging(env, staged.staging); }
  }
  async function preparePluginUpdate(env, registry, id, { refreshMarketplace = true, requireCurrent = false, expectedSignature } = {}) {
    // PH3-P1-01: a read-only Codex is only read here — no marketplace refresh and no
    // repair of its skill configuration; SkillDock's own baseline may still be recorded.
    const readOnly = env.mode === 'local' && await codexReadOnly();
    if (readOnly) refreshMarketplace = false;
    let catalog = await catalogFor(env, registry, true); let plugin = catalog.plugins.find(item => item.id === id && item.installed);
    if (!plugin) fail(404, 'NOT_FOUND', '未找到已安装插件。');
    const initialVersion = plugin.version;
    if (!plugin._updateSourcePath || plugin.sourceInfo?.confidence !== 'verified' || !Array.isArray(plugin._componentRoots)) fail(422, 'OWNER_MANAGED', '没有已核实的本地包来源；请在 Codex 插件管理器更新，再刷新状态。');
    if (typeof plugin.enabled !== 'boolean') fail(422, 'STATE_UNKNOWN', '无法确认原启用状态，不能安全执行包更新。');
    const market = catalog.marketplaces.find(item => item.id === plugin.marketplace);
    if (refreshMarketplace && market?.canRefresh && (market.type === 'git' || market.direct)) {
      if (market.direct) await refreshDirectSource(env, registry, market.id);
      else if (env.mode === 'local') { await verifyPluginPath(env, pluginCacheRoot(env.codexHome)); await adapter.command(['plugin', 'marketplace', 'upgrade', market.name, '--json'], { mutation: true }); }
      else {
        const entry = registry.marketplaces[market.id]; assertSandboxSource(env, entry.source);
        const stage = path.join(env.root, 'marketplace-sources', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, stage); await fs.mkdir(path.dirname(stage), { recursive: true });
        await checkoutGit(entry.source, entry.ref, stage); const refreshed = await readMarketplace(stage); if (refreshed.name !== market.name) fail(409, 'MARKETPLACE_CHANGED', '市场来源名称变化。'); entry.root = stage; entry.refreshedAt = now();
      }
      catalog = await catalogFor(env, registry, true); plugin = catalog.plugins.find(item => item.id === id && item.installed);
      if (!plugin?._updateSourcePath) fail(422, 'SOURCE_MISSING', '刷新后未找到该插件来源。');
    }
    if (plugin.sourceInfo?.confidence !== 'verified' || !Array.isArray(plugin._componentRoots)) fail(422, 'OWNER_MANAGED', '没有已核实的本地包来源；请在 Codex 插件管理器更新，再刷新状态。');
    if (![plugin.marketplace, plugin.name, plugin.version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '无法绑定插件安装身份。');
    const origin = (value, catalog) => {
      const owner = catalog.marketplaces.find(item => item.id === value?.marketplace);
      return JSON.stringify({ id: value?.id, name: value?.name, version: value?.version, marketplace: value?.marketplace,
        source: value?._updateSourcePath, sourceInfo: value?.sourceInfo, components: value?._componentRoots,
        market: owner && { source: owner.source, type: owner.type, root: owner._root, ref: owner.ref } });
    };
    const originalOrigin = origin(plugin, catalog);
    const source = plugin._updateSourcePath;
    const marketRoot = env.mode === 'sandbox' ? registry.marketplaces[plugin.marketplace]?.root || registry.marketplaces[plugin.marketplace]?.source : catalog.marketplaces.find(item => item.id === plugin.marketplace)?._root;
    if (!marketRoot) fail(422, 'SOURCE_MISSING', '所属市场未配置，无法核实更新来源。');
    if (env.mode === 'sandbox' && !inside(env.root, await fs.realpath(source))) fail(403, 'SANDBOX_BOUNDARY', '包来源越出演练范围。');
    const entry = await readComponentEntry(marketRoot, plugin.name, source);
    const { manifest, version: availableVersion, warnings } = await readPluginDefinition(source, { marketRoot, entry });
    if (!safeSegment(availableVersion)) fail(422, 'VERSION_UNVERIFIED', '来源未声明可验证的版本；请由包维护者发布明确版本后再更新。');
    const installedPath = pluginPath(env.codexHome, plugin.marketplace, plugin.name, plugin.version);
    await verifyPluginPath(env, installedPath);
    if (!(await exists(installedPath))) fail(422, 'INSTALLATION_UNVERIFIED', 'CLI 对应的已安装缓存不存在，不能验证更新前内容。');
    const sourceBoundary = await captureDirectoryRoot(source), targetBoundary = await captureDirectoryRoot(installedPath);
    const installed = await inspectTree(installedPath);
    const prior = registry.pluginBaselines?.[id] || registry.plugins?.[id];
    const drifted = prior?.version === plugin.version && prior.fingerprint && prior.fingerprint !== installed.fingerprint;
    const staging = path.join(env.root, 'staging', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(staging, { recursive: true, mode: 0o700 });
    let keepPreview = false;
    try {
      const candidate = path.join(staging, 'candidate'); const tree = await copySkill(source, candidate);
      const sourceReal = await fs.realpath(source); const componentRoots = (await discoverSkillRoots(source, { marketRoot, entry })).map(root => path.relative(sourceReal, root) || '.');
      if (componentRoots.some(relative => !inside(candidate, path.resolve(candidate, relative)))) fail(422, 'UNSUPPORTED_COMPONENTS', '来源组件在包根之外，无法证明安装缓存映射。');
      const changes = diffFiles(installed.entries, tree.entries); const order = compareVersions(availableVersion, plugin.version);
      const current = availableVersion === plugin.version && installed.fingerprint === tree.fingerprint;
      if (drifted && !current) fail(409, 'LOCAL_CHANGES', '已安装包相对已记录基线发生本地变化，请先保留修改。');
      if (requireCurrent && !current) fail(409, 'EXTERNAL_SYNC_UNVERIFIED', '无法确认安装内容与来源一致，原定时计划绑定保持不变。');
      if (current && (drifted || requireCurrent)) {
        // Equality is evidence only for this exact source and installation.
        // Re-read after staging so a concurrent change cannot become a baseline.
        const live = await catalogFor(env, registry, true);
        if (origin(live.plugins.find(item => item.id === id && item.installed), live) !== originalOrigin) fail(409, 'INSTALLATION_CHANGED', '插件安装或来源身份发生变化，请重新检查。');
        await verifyDirectoryRoot(sourceBoundary); await verifyDirectoryRoot(targetBoundary);
        await verifyPluginPath(env, installedPath);
        if (JSON.stringify(await readComponentEntry(marketRoot, plugin.name, source)) !== JSON.stringify(entry)
          || JSON.stringify(await readPluginManifest(candidate)) !== JSON.stringify(manifest)
          || (await inspectTree(source)).fingerprint !== tree.fingerprint) fail(409, 'SOURCE_CHANGED', '来源在复制期间发生变化，请重新预览。');
        if ((await inspectTree(installedPath)).fingerprint !== installed.fingerprint) fail(409, 'LOCAL_CHANGES', '已安装包在预览后发生变化。');
        if (expectedSignature && JSON.stringify(await targetSignature(env.mode, { kind: 'plugin', id })) !== JSON.stringify(expectedSignature)) fail(409, 'TARGET_BINDING_CHANGED', '来源、所有者、安装目录或内容已变化；旧计划不接管新对象，请重新选择。');
      }
      const updatedDuringCheck = current && market?.type === 'git' && compareVersions(plugin.version, initialVersion) === 1;
      const blocked = !current && (availableVersion === plugin.version || order !== null && order < 0);
      const previewId = crypto.randomUUID();
      const item = { target: { kind: 'plugin', id }, name: plugin.name, owner: plugin.sourceInfo.owner, route: 'plugin-reinstall', warnings, status: current ? 'current' : blocked ? 'blocked' : 'available', canCheck: true, canApply: !current && !blocked, canAutoApply: !blocked && order === 1,
        message: current ? '已安装版本和内容与来源一致。' : blocked ? availableVersion === plugin.version ? '来源内容变化但版本未递增；Codex 可能复用旧缓存，请维护者递增版本。' : '来源版本低于已安装版本，自动更新不会降级。' : order === null || order === 0 ? '来源版本不同但无法证明先后；可手动确认更新，定时计划不会自动应用。' : '发现新包版本；通过 Codex 重新安装并恢复原启用状态。', reasonCode: current ? undefined : blocked ? availableVersion === plugin.version ? 'VERSION_UNCHANGED' : 'DOWNGRADE_BLOCKED' : order !== 1 ? 'MANUAL_VERSION_ORDER' : undefined,
        checkedAt: now(), installedVersion: plugin.version, availableVersion, changes, sourceInfo: plugin.sourceInfo, installedPath, ...(updatedDuringCheck ? { updatedDuringCheck: true } : {}), ...(!current && !blocked ? { previewId } : {}) };
      if (updatedDuringCheck) item.message = 'Codex 已在刷新市场时更新包，已核对版本和内容。';
      if (current && (drifted || requireCurrent)) { item.message = '已核实插件外部同步，安装版本和内容与来源一致；已恢复检查基线，未修改安装文件。'; item.reasonCode = 'EXTERNAL_SYNC_VERIFIED'; }
      if (!readOnly && registry.pluginSkillPreferences?.[id]) {
        const roots = await discoverSkillRoots(installedPath);
        for (const relative of [...(plugin._componentRoots || []), ...Object.keys(registry.pluginSkillPreferences[id]).map(file => path.dirname(file))]) {
          const directory = path.resolve(installedPath, relative);
          if (inside(installedPath, directory) && await exists(directory)) roots.push(directory);
        }
        const contents = await pluginContents(installedPath, { roots });
        await writePluginSkills(env, registry, plugin, installedPath, contents.skillDetails);
      }
      registry.pluginBaselines ||= {}; registry.pluginBaselines[id] = { version: plugin.version, fingerprint: installed.fingerprint };
      if (!current && !blocked) { previews.set(previewId, { id: previewId, kind: 'plugin-update', mode: env.mode, created: previewNow(), source, sourceType: 'local', originalDirectory: source, sourceBoundary, candidate, staging, tree, target: installedPath, targetBoundary, baseline: installed.fingerprint, pluginId: id, installedVersion: plugin.version, availableVersion, componentRoots, item }); keepPreview = true; }
      return item;
    } finally { if (!keepPreview) await removeStaging(env, staging); }
  }
  async function marketplaceInstallation(env, registry, id) {
    const catalog = await catalogFor(env, registry, true);
    const plugin = catalog.plugins.find(item => item.id === id);
    if (!plugin) fail(404, 'NOT_FOUND', '插件不存在，请刷新市场。');
    if (!plugin.canInstall || plugin.installed) fail(403, 'PROTECTED_PLUGIN', plugin.reason || '该插件不支持此操作。');
    if (env.mode === 'local' && plugin.directory) {
      const app = await adapter.remoteDetails(plugin);
      const installUrl = officialAppUrl(app.installUrl);
      if (app.id !== plugin.directory.appId || !installUrl) fail(422, 'DIRECTORY_UNAVAILABLE', '无法核实这个插件的官方应用身份。');
      const remote = { appId: app.id, name: app.name, description: app.description || '', installUrl };
      const signature = hash(JSON.stringify({ id: plugin.id, version: plugin.version, remoteId: plugin._remote?.id, appId: app.id, installUrl, installPolicy: plugin.directory.installPolicy, authPolicy: plugin.directory.authPolicy }));
      return { plugin, signature, public: { name: plugin.displayName || plugin.name, description: plugin.description, version: plugin.version || '', icon: plugin.icon, source: 'Codex Plugin Directory', sourceType: 'remote', marketplace: plugin.marketplace, pluginId: plugin.id, skills: [], skillDetails: [], components: ['apps'], canSelectSkills: false, duplicates: [], remote } };
    }
    const market = catalog.marketplaces.find(item => item.id === plugin.marketplace);
    const marketRoot = market?._root || registry.marketplaces[plugin.marketplace]?.root || registry.marketplaces[plugin.marketplace]?.source;
    if (!marketRoot || !plugin.sourcePath) fail(422, 'PLUGIN_PREVIEW_UNAVAILABLE', '无法读取这个插件的技能清单，请先刷新或重新连接市场来源。');
    const entry = await readComponentEntry(marketRoot, plugin.name, plugin.sourcePath);
    const { manifest, version: resolvedVersion } = await readPluginDefinition(plugin.sourcePath, { marketRoot, entry });
    const { signature, ...contents } = await pluginContents(plugin.sourcePath, { marketRoot, entry });
    const version = resolvedVersion ?? 'local';
    if (!safeSegment(version)) fail(422, 'INVALID_VERSION', '插件版本必须是安全的单段字符串，不能包含路径。');
    const canSelectSkills = contents.skillDetails.every(skill => inside(plugin.sourcePath, path.resolve(plugin.sourcePath, skill.path)));
    return { plugin, signature, source: plugin.sourcePath, boundary: await captureDirectoryRoot(plugin.sourcePath),
      public: { name: plugin.name, description: manifest.description || entry.description || plugin.description || '', version, source: plugin.sourcePath, sourceType: 'local', marketplace: plugin.marketplace, pluginId: plugin.id, ...contents, canSelectSkills, duplicates: catalog.plugins.filter(item => item.name === plugin.name && item.installed).map(item => item.id) } };
  }

  async function writePluginSkills(env, registry, plugin, directory, skills, selection, readCurrent = true) {
    const prior = registry.pluginSkillPreferences?.[plugin.id];
    if (selection === undefined && !prior) return null;
    if (!skills.every(skill => inside(directory, path.resolve(directory, skill.path)))) fail(422, 'UNSUPPORTED_COMPONENTS', '共享目录中的技能暂不支持逐项启用，请通过 Codex 管理。');
    if (selection?.some(value => !skills.some(skill => skill.path === value))) fail(400, 'INVALID_SELECTION', '请选择预览中有效且不重复的技能。');
    await assertConfigBoundary(env);
    await verifyPluginPath(env, directory);
    const configDirectory = path.resolve(env.cacheBoundary.real, path.relative(env.cacheBoundary.directory, directory));
    const config = (await readConfig(env.config)).data.skills?.config ?? [];
    if (!Array.isArray(config)) fail(422, 'CONFIG_SYNTAX', 'skills.config 不是数组，不能安全修改。');
    const preference = { ...(prior || {}) };
    const values = skills.map(skill => {
      const file = path.resolve(configDirectory, skill.path);
      const configured = config.find(item => item.path === file)?.enabled;
      const enabled = selection !== undefined ? selection.includes(skill.path) : (readCurrent ? configured : undefined) ?? preference[skill.path] ?? false;
      preference[skill.path] = enabled;
      return { path: file, enabled };
    });
    const transaction = await toggleSkillConfigs(env.config, values, path.join(env.root, 'config-backups'));
    registry.pluginSkillPreferences ||= {}; registry.pluginSkillPreferences[plugin.id] = preference;
    return transaction;
  }

  async function executeAction(request, { pluginCheckOptions } = {}) {
    const env = environment(request.mode);
    if (busy) fail(409, 'BUSY', '另一个操作正在进行，请等待后重试。');
    busy = true; moveWarnings.length = 0; let registry; let originalRegistry; let claudeLockRelease = () => {};
    const undo = []; const individualActivities = []; let restore; let activityPath; let consumedPreview; let target = request.id || request.source || 'skill'; const activityId = crypto.randomUUID(); let result;
    try {
      await verifyDirectoryRoot(env.stateBoundary);
      registry = await registryFor(env); originalRegistry = structuredClone(registry);
      switch (request.action) {
        case 'plugin.connectionStatus': {
          if (env.mode !== 'local') fail(403, 'PROTECTED_PLUGIN', '此操作仅适用于官方目录插件。');
          const existing = (await catalogFor(env, registry)).plugins.find(item => item.id === request.id);
          if (!existing?.directory) fail(404, 'NOT_FOUND', '插件不存在，请刷新市场。');
          await adapter.refreshDirectory();
          const current = (await catalogFor(env, registry, true)).plugins.find(item => item.id === request.id);
          if (!current?.directory) fail(502, 'READBACK_FAILED', '无法确认安装终态，请刷新官方清单后再操作。');
          return remoteInstallationResult(current);
        }
        case 'plugin.previewMarketplace': {
          const preview = await marketplaceInstallation(env, registry, request.id);
          for (const [id, item] of pluginCatalogPreviews) if (previewNow() - item.created > 30 * 60000) pluginCatalogPreviews.delete(id);
          while (pluginCatalogPreviews.size >= 20) pluginCatalogPreviews.delete(pluginCatalogPreviews.keys().next().value);
          const id = crypto.randomUUID();
          pluginCatalogPreviews.set(id, { ...preview, mode: env.mode, created: previewNow() });
          return { message: '插件安装预览已准备好。', pluginPreview: { id, ...preview.public } };
        }
        case 'plugin.previewInstall': {
          const staged = await stageSource(env, request, 'plugin');
          const location = directLocation(env, staged); const id = crypto.randomUUID();
          const catalog = await catalogFor(env, registry, true);
          if (catalog.plugins.some(item => item.id === location.pluginId && item.installed)) { await removeStaging(env, staged.staging); fail(409, 'PLUGIN_ALREADY_INSTALLED', '这个来源的插件已安装，请在更新页管理它。'); }
          previews.set(id, { ...staged, id, mode: env.mode, kind: 'plugin-install', created: previewNow() });
          return { message: '插件安装预览已准备好。', pluginPreview: { id, ...staged.detail, canSelectSkills: true, source: staged.source, sourceType: staged.sourceType, subpath: staged.subpath, ref: staged.ref, commit: staged.commit, files: staged.tree.files, bytes: staged.tree.bytes, duplicates: catalog.plugins.filter(item => item.name === staged.detail.name && item.installed).map(item => item.id) } };
        }
        case 'plugin.installSource': {
          const staged = await assertPreview(env, request.previewId, 'plugin-install');
          const location = directLocation(env, staged); const { pluginId, market, root } = location;
          const catalog = await catalogFor(env, registry, true);
          if (catalog.plugins.some(item => item.id === pluginId && item.installed)) fail(409, 'PLUGIN_ALREADY_INSTALLED', '这个来源的插件已安装，请在更新页管理它。');
          if (request.enabledSkills?.some(value => !staged.detail.skillDetails.some(skill => skill.path === value))) fail(400, 'INVALID_SELECTION', '请选择预览中有效且不重复的技能。');
          const registered = catalog.marketplaces.find(item => item.id === market);
          if (registered && (registered._root || registry.marketplaces[market]?.root) !== root) fail(409, 'MARKETPLACE_EXISTS', '安装来源名称已被另一个目录使用，未修改该来源。');
          const destination = path.join(root, 'plugins', staged.detail.name);
          await verifyDescendantDirectory(env.stateBoundary, destination);
          if (await exists(destination)) {
            const tree = await inspectTree(destination);
            if (tree.fingerprint !== staged.tree.fingerprint) {
              const previous = registry.directPlugins?.[market];
              if (previous?.root !== root || previous.name !== staged.detail.name || previous.fingerprint !== tree.fingerprint) fail(409, 'TARGET_EXISTS', '之前的单插件安装来源仍然存在且内容不同，请先核对该来源。');
              const backup = path.join(staged.staging, 'previous');
              await move(destination, backup);
              try { await copySkill(staged.candidate, destination); }
              catch (error) { await fs.rm(destination, { recursive: true, force: true }); await move(backup, destination); throw error; }
            }
          } else { await fs.mkdir(path.dirname(destination), { recursive: true }); await copySkill(staged.candidate, destination); }
          await writeDirectMarketplace(env, staged, location);
          const tracked = { root, name: staged.detail.name, source: staged.source, sourceType: staged.sourceType, subpath: staged.subpath, ref: staged.ref, commit: staged.commit, fingerprint: staged.tree.fingerprint };
          registry.directPlugins ||= {}; registry.directPlugins[market] = tracked;
          // Keep provenance on uncertain CLI outcomes: the native manager may
          // already have registered/installed the package when a command fails.
          originalRegistry.directPlugins ||= {}; originalRegistry.directPlugins[market] = tracked;
          await writeJson(env.registryFile, registry);
          const selectedCache = pluginPath(env.codexHome, market, staged.detail.name, staged.detail.version);
          await verifyPluginPath(env, selectedCache);
          const selectedTransaction = await writePluginSkills(env, registry, { id: pluginId }, selectedCache, staged.detail.skillDetails, request.enabledSkills);
          if (selectedTransaction && env.mode === 'sandbox') undo.push(selectedTransaction.undo);
          if (env.mode === 'local' && selectedTransaction) originalRegistry.pluginSkillPreferences = structuredClone(registry.pluginSkillPreferences);
          if (env.mode === 'local') {
            if (!registered) await adapter.command(['plugin', 'marketplace', 'add', root, '--json'], { mutation: true });
            const nativeMarket = (await adapter.list()).marketplaces.find(item => item.id === market);
            if (nativeMarket?._root !== root) fail(502, 'READBACK_FAILED', '未能确认单插件来源登记，请刷新后核实。');
            await adapter.command(['plugin', 'add', pluginId, '--json'], { mutation: true });
            const installed = (await adapter.list()).plugins.find(item => item.id === pluginId && item.installed);
            const cache = pluginPath(env.codexHome, market, staged.detail.name, staged.detail.version);
            await verifyPluginPath(env, cache);
            if (!installed || installed.version !== staged.detail.version || typeof installed.enabled !== 'boolean' || (await inspectTree(cache)).fingerprint !== staged.tree.fingerprint) fail(502, 'READBACK_FAILED', '插件安装的版本、内容或状态未能全部确认，请刷新后核实。');
          } else {
            registry.marketplaces[market] = { source: root, root, type: 'local', refreshedAt: now() };
            const cache = pluginPath(env.codexHome, market, staged.detail.name, staged.detail.version);
            await verifyPluginPath(env, cache);
            await fs.mkdir(path.dirname(cache), { recursive: true }); await copySkill(staged.candidate, cache);
            registry.plugins[pluginId] = { name: staged.detail.name, version: staged.detail.version, marketplace: market, directory: cache, enabled: true, updateSourcePath: destination, componentRoots: (await discoverSkillRoots(destination)).map(item => path.relative(destination, item) || '.') };
          }
          target = staged.detail.name; consumedPreview = staged; previews.delete(request.previewId);
          result = { message: `已安装插件 ${target}，请在新会话中确认能力。`, needsReload: true }; break;
        }
        case 'tags.set': {
          const current = await snapshot(env.mode);
          const item = current[request.target.kind === 'skill' ? 'skills' : 'plugins'].find(item => item.id === request.target.id);
          if (!item) fail(404, 'NOT_FOUND', '未找到该对象，请刷新清单后重试。');
          const tags = normalizeTags(request.tags); const key = tagKey(request.target.kind, item);
          registry.tags ||= {};
          if (tags.length) registry.tags[key] = tags; else delete registry.tags[key];
          target = item.name; activityPath = item.path;
          result = { message: '标签已保存。' }; break;
        }
        case 'plugin.checkUpdate': {
          const item = await preparePluginUpdate(env, registry, request.id, pluginCheckOptions); target = item.name; result = { message: item.message, updateItem: item }; break;
        }
        case 'plugin.update': {
          const preview = await assertPreview(env, request.previewId, 'plugin-update');
          if (preview.pluginId !== request.id) fail(409, 'PREVIEW_MISMATCH', '预览不属于该插件。');
          await verifyDirectoryRoot(preview.sourceBoundary); await verifyDirectoryRoot(preview.targetBoundary);
          await verifyPluginPath(env, preview.target);
          if ((await inspectTree(preview.target)).fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '已安装包在预览后发生变化。');
          const catalog = await catalogFor(env, registry, true); const plugin = catalog.plugins.find(item => item.id === request.id && item.installed);
          if (!plugin || plugin.version !== preview.installedVersion || typeof plugin.enabled !== 'boolean' || plugin._updateSourcePath !== preview.source) fail(409, 'INSTALLATION_CHANGED', '插件安装或来源身份发生变化，请重新检查。');
          target = plugin.name; const enabled = plugin.enabled;
          const backup = path.join(env.root, 'quarantine', `${activityId}-plugin-backup`); await verifyDescendantDirectory(env.stateBoundary, backup); await fs.mkdir(path.dirname(backup), { recursive: true }); await copySkill(preview.target, backup);
          const destination = pluginPath(env.codexHome, plugin.marketplace, plugin.name, preview.availableVersion); await verifyPluginPath(env, path.dirname(destination));
          if (registry.pluginSkillPreferences?.[plugin.id]) {
            const contents = await pluginContents(preview.candidate, { roots: preview.componentRoots.map(relative => path.resolve(preview.candidate, relative)) });
            const transaction = await writePluginSkills(env, registry, plugin, destination, contents.skillDetails, undefined, false);
            if (env.mode === 'sandbox') undo.push(transaction.undo);
            else originalRegistry.pluginSkillPreferences = structuredClone(registry.pluginSkillPreferences);
          }
          if (env.mode === 'sandbox') {
            if (await exists(destination)) { if ((await inspectTree(destination)).fingerprint !== preview.tree.fingerprint) fail(409, 'TARGET_EXISTS', '新版本缓存已有不同内容，不能覆盖。'); }
            else { await fs.mkdir(path.dirname(destination), { recursive: true }); await move(preview.candidate, destination); undo.push(async () => { await move(destination, preview.candidate); }); }
            registry.plugins[plugin.id] = { ...registry.plugins[plugin.id], version: preview.availableVersion, directory: destination, componentRoots: preview.componentRoots, fingerprint: preview.tree.fingerprint, enabled, updateSourcePath: preview.source };
          } else {
            await assertConfigBoundary(env);
            const pending = path.join(env.root, `pending-plugin-update-${activityId}.json`); await writeJson(pending, { pluginId: plugin.id, oldVersion: plugin.version, desiredVersion: preview.availableVersion, oldEnabled: enabled, backup, createdAt: now() });
            let commandError;
            try { await adapter.command(['plugin', 'add', plugin.id, '--json'], { mutation: true }); } catch (error) { commandError = error; }
            if (!enabled) {
              try { await assertConfigBoundary(env); await toggleConfig(env.config, 'plugin', plugin.id, false, path.join(env.root, 'config-backups')); }
              catch (error) { fail(502, 'STATE_RESTORE_FAILED', `包更新可能已执行，但恢复原禁用状态失败：${redact(error.message)}。请在 Codex 插件设置核实；不能视为更新成功。`); }
            }
            if (commandError) throw commandError;
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now(); const actual = readback.plugins.find(item => item.id === plugin.id && item.installed);
            await verifyPluginPath(env, destination);
            if (!actual || actual.version !== preview.availableVersion || actual.enabled !== enabled || !(await exists(destination)) || (await inspectTree(destination)).fingerprint !== preview.tree.fingerprint) fail(502, 'READBACK_FAILED', '包更新后版本、内容或启用状态无法全部确认。旧包备份与未完成记录已保留，请核实。');
            await fs.rm(pending, { force: true });
          }
          registry.pluginBaselines ||= {}; registry.pluginBaselines[plugin.id] = { version: preview.availableVersion, fingerprint: preview.tree.fingerprint };
          consumedPreview = previews.get(request.previewId); previews.delete(request.previewId); result = { message: `已将 ${plugin.name} 更新到 ${preview.availableVersion}，并保留原${enabled ? '启用' : '禁用'}状态。旧包备份已保留；包级回退通过所属管理器执行。`, needsReload: true }; break;
        }
        case 'skill.previewSource': case 'skill.connectSource': case 'skill.previewInstall': case 'skill.install':
        case 'skill.checkUpdate': case 'skill.update': case 'skill.remove': case 'activity.restore': {
          const outcome = await skillOperation(codexSkillSide(env, registry), request, { env, registry, undo, activityId });
          if (outcome.early) return outcome.early;
          ({ result } = outcome); if (outcome.target) target = outcome.target; if (outcome.restore) restore = outcome.restore; if (outcome.activityPath) activityPath = outcome.activityPath;
          if (outcome.consumed) { consumedPreview = outcome.consumed; previews.delete(request.previewId); }
          break;
        }
        case 'skill.toggle': {
          const { record } = await assertWritableSkill(env, request.id, 'canToggle'); target = record.name;
          await assertConfigBoundary(env);
          if (record.pluginId) {
            const current = await snapshot(env.mode);
            const plugin = current.plugins.find(item => item.id === record.pluginId);
            if (!plugin?.canToggle) fail(403, 'PROTECTED_PLUGIN', '所属插件不支持此操作。');
            if (!plugin.enabled) fail(409, 'PLUGIN_DISABLED', '请先启用所属插件，再调整其中的技能。');
            const transaction = await toggleConfig(env.config, 'skill', record.configPath || record.path, request.enabled, path.join(env.root, 'config-backups')); undo.push(transaction.undo);
            registry.pluginSkillPreferences ||= {};
            const config = (await readConfig(env.config)).data.skills?.config ?? [];
            registry.pluginSkillPreferences[record.pluginId] = { ...registry.pluginSkillPreferences[record.pluginId], ...Object.fromEntries(current.skills.filter(item => item.pluginId === record.pluginId && item.packagePath).map(item => [item.packagePath, config.find(value => value.path === item.path)?.enabled ?? true])) };
          } else {
            const transaction = await toggleConfig(env.config, 'skill', record.configPath || record.path, request.enabled, path.join(env.root, 'config-backups')); undo.push(transaction.undo);
          }
          result = { message: `已${request.enabled ? '启用' : '禁用'} ${target}。配置已读回；新会话生效。`, needsReload: true }; break;
        }
        case 'skill.removeSelected': {
          const preview = removalPreviews.get(request.previewId);
          if (!preview || preview.mode !== env.mode || previewNow() - preview.created > 30 * 60000) fail(409, 'STALE_PREVIEW', '预览已过期或属于其他环境，请重新预览。');
          target = preview.result.name;
          if (preview.rules?.length && !request.confirm) throw new AppError(409, 'CONFIRMATION_REQUIRED', '这次批量移除会影响另一侧，请确认后重试。', { nativeRules: preview.rules });
          const current = await snapshot(env.mode, true, { multiAgent: !!preview.multiAgent }); const group = current.skills.filter(record => record.name === target);
          if (removalGroupSignature(group) !== preview.group) fail(409, 'REMOVAL_CHANGED', '同名技能清单已变化，请重新选择。');
          if (preview.multiAgent && preview.selected.some(item => item.agent === 'codex') && await codexReadOnly())
            fail(409, 'AGENT_READ_ONLY', 'Codex 环境当前为只读，SkillDock 不会修改 Codex 中的技能和插件。请在 SkillDock 的“Agent 环境”页启用 Codex 管理后重试。');
          // Check the whole selection before moving any directory.
          for (const item of preview.selected) await verifyRemovalItem(env, item, current, preview.multiAgent);
          await assertRemovalIsolation(preview.selected, current);
          // Claude copies take the Claude lock too (DEC-SDX-010), after the instance and Codex locks held here.
          if (preview.selected.some(item => item.agent === 'claude')) {
            const { configDir } = (await agentLayer.discover()).claudeRoot;
            if (await fs.stat(configDir).then(stat => stat.isDirectory(), () => false)) claudeLockRelease = acquireFileLock(operationLock(configDir));
          }
          for (const item of preview.selected) {
            const { record, directory, agent, boundaries } = await verifyRemovalItem(env, item, current, preview.multiAgent);
            const id = crypto.randomUUID(); const backup = path.join(env.root, 'quarantine', id);
            await move(directory, backup, boundaries);
            undo.push(async () => {
              if (await exists(directory)) fail(409, 'TARGET_EXISTS', '原位置已被占用，移除回滚不能覆盖新内容。');
              await move(backup, directory, boundaries);
            });
            if (await objectFingerprint(backup) !== item.identity.fingerprint) fail(409, 'REMOVAL_CHANGED', '选中的技能在移动期间发生变化，已停止移除。');
            const { parentReal, parentDev, parentIno } = item.identity;
            if (agent === 'claude') {
              // A Claude copy: its source record lives in the Claude partition, and a link keeps the target's (4b P2-03).
              const sources = (registry.claudeSources ??= {}); const key = item.identity.real;
              const keep = record.isLink;
              const entry = { kind: 'remove', agent: 'claude', directory, backup, parentReal, parentDev, parentIno, priorFingerprint: item.identity.fingerprint, skillId: record.id, ...(keep ? { link: true } : { source: sources[key], sourceKey: key }) };
              if (!keep) delete sources[key];
              individualActivities.push({ id, action: 'skill.remove', agent: 'claude', target: record.name, path: record.path, createdAt: now(), status: 'success', message: `已把 Claude 技能 ${record.name} 移至可恢复区；可从操作记录恢复。`, canRestore: true, restore: entry });
              continue;
            }
            const entry = { kind: 'remove', directory, backup, parentReal, parentDev, parentIno, priorFingerprint: item.identity.fingerprint, source: registry.sources[record.id], skillId: record.id };
            delete registry.sources[record.id];
            individualActivities.push({ id, action: 'skill.remove', target: record.name, path: record.path, createdAt: now(), status: 'success', message: `已将 ${record.name} 移至可恢复区；可从操作记录恢复。`, canRestore: true, restore: entry });
          }
          result = { message: `已移除选中的 ${preview.selected.length} 份同名技能，保留 ${preview.result.keep.length} 份；每份均可单独恢复。`, needsReload: true };
          removalPreviews.delete(request.previewId); break;
        }
        case 'plugin.toggle': {
          const plugin = (await snapshot(env.mode)).plugins.find(item => item.id === request.id);
          if (!plugin) fail(404, 'NOT_FOUND', '插件不存在。');
          if (!plugin.canToggle) fail(403, 'PROTECTED_PLUGIN', plugin.reason || '插件不支持启禁。');
          await assertConfigBoundary(env);
          const transaction = await toggleConfig(env.config, 'plugin', plugin.id, request.enabled, path.join(env.root, 'config-backups')); undo.push(transaction.undo);
          if (env.mode === 'sandbox') registry.plugins[plugin.id].enabled = request.enabled;
          target = plugin.name; result = { message: `已${request.enabled ? '启用' : '禁用'}插件 ${target}，新会话生效。`, needsReload: true }; break;
        }
        case 'plugin.install':
        case 'plugin.remove': {
          const plugin = (await snapshot(env.mode)).plugins.find(item => item.id === request.id); const installing = request.action === 'plugin.install';
          if (!plugin) fail(404, 'NOT_FOUND', '插件不存在，请刷新市场。');
          if (!plugin[installing ? 'canInstall' : 'canRemove']) fail(403, 'PROTECTED_PLUGIN', plugin.reason || '该插件不支持此操作。');
          target = plugin.name;
          if (installing && env.mode === 'local' && plugin.directory) {
            const preview = pluginCatalogPreviews.get(request.previewId);
            if (!preview || preview.mode !== env.mode || preview.plugin.id !== plugin.id || previewNow() - preview.created > 30 * 60000) fail(409, 'STALE_PREVIEW', '预览已过期或属于其他环境，请重新预览。');
            if (request.enabledSkills !== undefined) fail(400, 'INVALID_SELECTION', '官方目录插件的组件由 Codex 管理，不能在这里选择本地技能路径。');
            const current = await marketplaceInstallation(env, registry, plugin.id);
            if (current.signature !== preview.signature) fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新预览。');
            await verifyPluginPath(env, plugin.version ? pluginPath(env.codexHome, plugin.marketplace, plugin.name, plugin.version) : pluginCacheRoot(env.codexHome));
            target = plugin.displayName || plugin.name;
            try { await adapter.command(['plugin', 'add', plugin.id, '--json'], { mutation: true }); }
            catch (error) { throw new AppError(error.status || 502, 'REMOTE_INSTALL_UNCONFIRMED', '安装结果尚未确认。请先刷新安装状态，必要时完成官方授权，再决定是否重试。'); }
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            const installed = readback.plugins.find(item => item.id === plugin.id);
            if (!listCovers(readback, 'plugins', plugin.id) || !installed?.directory) fail(502, 'READBACK_FAILED', 'CLI 操作已返回，但无法确认安装终态；请刷新官方清单后再操作。');
            pluginCatalogPreviews.delete(request.previewId);
            result = remoteInstallationResult(installed); break;
          }
          if (installing && request.previewId) {
            const preview = pluginCatalogPreviews.get(request.previewId);
            if (!preview || preview.mode !== env.mode || preview.plugin.id !== plugin.id || previewNow() - preview.created > 30 * 60000) fail(409, 'STALE_PREVIEW', '预览已过期或属于其他环境，请重新预览。');
            await verifyDirectoryRoot(preview.boundary);
            const current = await marketplaceInstallation(env, registry, plugin.id);
            if (current.source !== preview.source || current.signature !== preview.signature || current.public.version !== preview.public.version) fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新预览。');
            const destination = pluginPath(env.codexHome, plugin.marketplace, plugin.name, current.public.version);
            await verifyPluginPath(env, destination);
            const transaction = await writePluginSkills(env, registry, plugin, destination, current.public.skillDetails, request.enabledSkills);
            if (transaction && env.mode === 'sandbox') undo.push(transaction.undo);
            if (transaction && env.mode === 'local') originalRegistry.pluginSkillPreferences = structuredClone(registry.pluginSkillPreferences);
          }
          if (env.mode === 'sandbox') {
            if (installing) {
              if (!inside(env.root, await fs.realpath(plugin.sourcePath))) fail(403, 'SANDBOX_BOUNDARY', '插件来源越出演练目录。');
              if (![plugin.marketplace, plugin.name, plugin.version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '插件身份或版本不是安全的单段路径。');
              const destination = pluginPath(env.codexHome, plugin.marketplace, plugin.name, plugin.version);
              const cacheRoot = env.cacheBoundary.real;
              if (!inside(cacheRoot, destination) || await fs.realpath(env.codexHome) !== env.codexRootReal) fail(403, 'PLUGIN_BOUNDARY', '插件安装目标越出缓存根目录。');
              await verifyPluginPath(env, path.dirname(destination));
              if (await exists(destination)) fail(409, 'TARGET_EXISTS', '插件缓存目标已存在，不能覆盖。');
              await inspectTree(plugin.sourcePath); await fs.mkdir(path.dirname(destination), { recursive: true });
              if (!inside(cacheRoot, await fs.realpath(path.dirname(destination)))) fail(403, 'PLUGIN_BOUNDARY', '插件父目录链接越出缓存根目录。');
              const sourcePlugin = (await sandboxCatalog(env, registry)).plugins.find(item => item.id === plugin.id);
              const componentRoots = sourcePlugin?._componentRoots || ['skills'];
              if (!Array.isArray(componentRoots) || componentRoots.some(relative => typeof relative !== 'string' || !inside(destination, path.resolve(destination, relative)))) fail(422, 'UNSUPPORTED_COMPONENTS', '初版演练不能将插件根外复用组件映射到缓存。');
              await copySkill(plugin.sourcePath, destination); undo.push(async () => { await fs.rm(destination, { recursive: true, force: true }); });
              const configuredEnabled = (await readConfig(env.config)).data.plugins?.[plugin.id]?.enabled;
              registry.plugins[plugin.id] = { name: plugin.name, description: plugin.description, marketplace: plugin.marketplace, directory: destination, version: plugin.version, componentRoots, updateSourcePath: plugin._updateSourcePath || plugin.sourcePath, fingerprint: (await inspectTree(destination)).fingerprint, generation: crypto.randomUUID(), enabled: configuredEnabled !== false };
            } else {
              if (!inside(env.cacheBoundary.real, await fs.realpath(registry.plugins[plugin.id].directory))) fail(403, 'PLUGIN_BOUNDARY', '插件目录越出缓存根目录。');
              const backup = path.join(env.root, 'quarantine', `${activityId}-plugin`); await move(registry.plugins[plugin.id].directory, backup); undo.push(async () => { await move(backup, registry.plugins[plugin.id]?.directory || plugin.sourcePath); });
              delete registry.plugins[plugin.id];
            }
          } else {
            await verifyPluginPath(env, plugin.version ? pluginPath(env.codexHome, plugin.marketplace, plugin.name, plugin.version) : pluginCacheRoot(env.codexHome));
            await adapter.command(['plugin', installing ? 'add' : 'remove', plugin.id, '--json'], { mutation: true });
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (!listCovers(readback, 'plugins', plugin.id) || readback.plugins.some(item => item.id === plugin.id && item.installed) !== installing) fail(502, 'READBACK_FAILED', 'CLI 操作已返回，但无法确认安装终态；请刷新官方清单后再操作。');
          }
          if (installing && request.previewId) pluginCatalogPreviews.delete(request.previewId);
          result = { message: `已${installing ? '安装' : '卸载'}插件 ${target}，请在新会话中确认能力。`, needsReload: true }; break;
        }
        case 'marketplace.add': {
          const source = validateSource(request.source, request.sourceType); assertSandboxSource(env, source);
          if (env.mode === 'sandbox' && (!await exists(source) || !inside(env.root, await fs.realpath(source)))) fail(403, 'SANDBOX_BOUNDARY', '市场来源不存在或链接越出演练目录。');
          let root = source; let staging;
          if (request.sourceType === 'git') { staging = path.join(env.root, 'marketplace-sources', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(path.dirname(staging), { recursive: true }); await checkoutGit(source, request.ref, staging); root = staging; }
          const catalog = await readMarketplace(root);
          if (env.mode === 'sandbox' && !inside(env.root, await fs.realpath(root))) fail(403, 'SANDBOX_BOUNDARY', '市场来源越出演练目录。');
          if ((await snapshot(env.mode)).marketplaces.some(item => item.id === catalog.name)) fail(409, 'MARKETPLACE_EXISTS', '同名市场已存在。');
          if (env.mode === 'sandbox') { registry.marketplaces[catalog.name] = { source, root: catalog.root, type: request.sourceType, ref: request.ref, refreshedAt: now() }; }
          else {
            const args = ['plugin', 'marketplace', 'add', source]; if (request.ref) args.push('--ref', request.ref); args.push('--json');
            await verifyPluginPath(env, pluginCacheRoot(env.codexHome));
            await adapter.command(args, { mutation: true }); const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (!readback.marketplaces.some(item => item.id === catalog.name)) fail(502, 'READBACK_FAILED', 'CLI 未能确认市场已添加，请刷新核实。');
          }
          target = catalog.name; result = { message: `已添加市场 ${target}，可以浏览并安装其中的插件。`, warnings: catalog.warnings }; break;
        }
        case 'marketplace.refresh':
        case 'marketplace.remove': {
          const market = (await snapshot(env.mode)).marketplaces.find(item => item.id === request.id); const removing = request.action === 'marketplace.remove';
          if (!market) fail(404, 'NOT_FOUND', '市场不存在。');
          if (!market[removing ? 'canRemove' : 'canRefresh']) fail(403, 'PROTECTED_MARKETPLACE', market.reason || '此市场不支持该操作，本地目录无需 Git 刷新。');
          if (market.direct && !removing) await refreshDirectSource(env, registry, market.id);
          else if (env.mode === 'sandbox') {
            if (removing) delete registry.marketplaces[market.id];
            else {
              const entry = registry.marketplaces[market.id]; const staged = path.join(env.root, 'marketplace-sources', crypto.randomUUID());
              assertSandboxSource(env, entry.source); await verifyDescendantDirectory(env.stateBoundary, staged); await fs.mkdir(path.dirname(staged), { recursive: true }); await checkoutGit(entry.source, entry.ref, staged); const catalog = await readMarketplace(staged);
              if (catalog.name !== market.name) fail(409, 'MARKETPLACE_CHANGED', '来源的市场名称发生变化。');
              entry.root = staged; entry.refreshedAt = now();
            }
          } else {
            await verifyPluginPath(env, pluginCacheRoot(env.codexHome));
            await adapter.command(['plugin', 'marketplace', removing ? 'remove' : 'upgrade', market.name, '--json'], { mutation: true });
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (!listCovers(readback, 'marketplaces', market.name) || readback.marketplaces.some(item => item.id === market.id) === removing) fail(502, 'READBACK_FAILED', 'CLI 未能确认市场操作终态，请刷新核实。');
          }
          target = market.name; result = { message: removing ? `已移除市场来源 ${target}；已安装插件保留。` : market.direct ? '已刷新单插件来源，可以检查插件更新。' : `已刷新 Git 市场 ${target}；这不表示已安装插件全部更新。` }; break;
        }
      }
      if (!result) fail(400, 'INVALID_ACTION', '操作未实现。');
      if (moveWarnings.length) result.message += `\n${moveWarnings.join('\n')}`;
      registry.activity.unshift(...(individualActivities.length ? individualActivities : [{ id: activityId, action: request.action, target, ...(activityPath ? { path: activityPath } : {}), createdAt: now(), status: result.remoteInstall && !result.remoteInstall.installed ? 'error' : 'success', message: result.message, canRestore: !!restore, ...(restore ? { restore } : {}) }]));
      await writeJson(env.registryFile, registry);
      await cleanupTemporary(env, registry, consumedPreview).catch(() => {});
      cachedCatalog = undefined;
      return result;
    } catch (error) {
      let rollbackError;
      for (const reverse of undo.reverse()) try { await reverse(); } catch (e) { rollbackError = e; }
      let message = redact(error.message); if (rollbackError) message += `；自动恢复未完成：${redact(rollbackError.message)}，请保留备份区。`;
      if (originalRegistry) {
        originalRegistry.activity.unshift({ id: activityId, action: request.action, target, createdAt: now(), status: 'error', message, reasonCode: error.code || 'OPERATION_FAILED', canRestore: false });
        try { await writeJson(env.registryFile, originalRegistry); } catch { message += '；操作记录无法写入。'; }
      }
      cachedCatalog = undefined;
      throw new AppError(error.status || 500, error.code || 'OPERATION_FAILED', message);
    } finally { busy = false; claudeLockRelease(); }
  }
  function remoteInstallationResult(plugin) {
    const installed = plugin.installed === true, connected = plugin.directory.connected === true;
    return { message: installed ? connected ? '插件已安装，应用连接可用。请在新的 Codex 会话中使用。' : '插件已安装，请继续完成或核实账号授权。' : '安装尚未确认，请完成官方授权后刷新安装状态。',
      needsReload: installed && connected,
      remoteInstall: { id: plugin.id, name: plugin.displayName || plugin.name, installed, connected, installUrl: plugin.directory.installUrl } };
  }
  async function directoryIcon(mode, id, theme) {
    const env = environment(mode);
    const plugin = (await catalogFor(env, await registryFor(env))).plugins.find(item => item.id === id);
    if (!plugin?.directory) fail(404, 'NOT_FOUND', '插件不存在，请刷新市场。');
    const urls = plugin._remoteIcon;
    return { data: await directoryIcons.get(theme === 'dark' ? urls?.dark || urls?.light : urls?.light || urls?.dark) };
  }
  async function targetSignature(mode, target, current) {
    const env = environment(mode); current ||= await schedulerSnapshot(mode); const registry = await registryFor(env);
    const item = current.updates.find(candidate => targetKey(candidate.target) === targetKey(target));
    if (!item) fail(404, 'NOT_FOUND', '更新目标不存在。');
    let directory; let generation;
    if (target.agent === 'claude') {
      // A Claude target binds its own side's directory and source record (phase 5a).
      const skill = target.kind === 'skill' && current.skills.find(candidate => candidate.id === target.id);
      const plugin = target.kind === 'plugin' && current.plugins.find(candidate => candidate.id === target.id && candidate.installed);
      directory = skill ? path.dirname((skill.agents?.length === 2 ? skill.perAgent.claude : skill).path) : plugin?.installedPath;
      if (!directory) fail(404, 'NOT_FOUND', '更新目标不存在。');
      generation = registry.claudeSources?.[await realDirectory(directory)]?.generation;
    } else if (target.kind === 'skill') {
      const record = current.skills.find(candidate => candidate.id === target.id); directory = path.dirname(record.path); generation = registry.sources[target.id]?.generation;
    } else if (target.kind === 'plugin') {
      const plugin = current.plugins.find(candidate => candidate.id === target.id && candidate.installed);
      if (![plugin?.marketplace, plugin?.name, plugin?.version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '无法绑定插件安装身份。');
      directory = pluginPath(env.codexHome, plugin.marketplace, plugin.name, plugin.version); generation = registry.plugins?.[target.id]?.generation;
    } else directory = env.codexHome;
    const real = await fs.realpath(directory); const stat = await fs.stat(directory);
    const source = item.sourceInfo || {}; const sourceIdentity = {};
    for (const key of ['kind', 'owner', 'sourceType', 'source', 'subpath', 'ref', 'commit', 'marketplace', 'pluginId']) if (source[key] !== undefined) sourceIdentity[key] = source[key];
    if (target.kind === 'plugin') {
      const catalog = await catalogFor(env, registry); const plugin = catalog.plugins.find(candidate => candidate.id === target.id);
      const market = catalog.marketplaces.find(candidate => candidate.id === plugin?.marketplace);
      const registered = env.mode === 'sandbox' ? registry.marketplaces[plugin?.marketplace] : undefined;
      const marketRoot = registered?.root || registered?.source || market?._root;
      if (marketRoot && plugin?._updateSourcePath) {
        const relative = path.relative(await fs.realpath(marketRoot), await fs.realpath(plugin._updateSourcePath));
        if (relative.startsWith('..') || path.isAbsolute(relative)) fail(422, 'SOURCE_BOUNDARY', '插件来源越出市场根。');
        sourceIdentity.source = registered?.source || market.source;
        sourceIdentity.sourceType = registered?.type || market.type;
        sourceIdentity.packagePath = relative;
        if (registered?.ref) sourceIdentity.ref = registered.ref;
      }
    }
    // Bind content by the supported update route, not whether today's check
    // found an applicable version. A "current" result must not change identity.
    return { target, sourceIdentity, real, dev: String(stat.dev), ino: String(stat.ino), ...(generation ? { generation } : {}), ...(['plugin-reinstall', 'skill-source', 'plugin-files'].includes(item.route) ? { fingerprint: (await inspectTree(directory)).fingerprint } : {}) };
  }
  // Plans see Claude's objects while Claude is managed; otherwise the 0.10.2 snapshot (MR-SDX-001),
  // where a Claude target pauses before it is looked up (HLD 3.8).
  async function schedulerSnapshot(mode) {
    return mode === 'local' && (await readManagement(stateDir)).claude?.management === 'enabled' ? snapshot(mode, false, { multiAgent: true }) : snapshot(mode);
  }
  /** A Claude skill that became shared: its plan target follows by the real directory it bound. */
  async function migrateTarget(mode, target, binding, current) {
    if (mode !== 'local' || target.kind !== 'skill' || !binding?.real) return null;
    for (const skill of current.skills) {
      if (skill.agents?.length !== 2 || !skill.perAgent?.claude) continue;
      if (await realDirectory(path.dirname(skill.perAgent.claude.path)) !== binding.real) continue;
      return skill.perAgent.claude.canUpdate ? { kind: 'skill', id: skill.id, agent: 'claude' } : { kind: 'skill', id: skill.id };
    }
    return null;
  }
  let requestBusy = false; let restarting = false; let closing = false;
  async function selectProject(directory) {
    const next = await projectContext(directory, 'saved').catch(error => fail(error.status || 422, error.code || 'PROJECT_UNAVAILABLE', error.message));
    const discoveryRoots = await rootsFor({ ...local, project: next.effective });
    const managedRoots = await Promise.all(discoveryRoots.filter(root => root.scope !== 'system').map(root => captureDirectoryRoot(root.directory)));
    await verifyDirectoryRoot(applicationBoundary);
    const file = path.join(stateDir, 'project.json');
    const saved = await readJson(file, {}) || {};
    const recent = [...new Set([next.effective, project, ...(Array.isArray(saved.recent) ? saved.recent : [])])].filter(item => typeof item === 'string' && path.isAbsolute(item)).slice(0, 50);
    const contextFile = backgroundPaths(stateDir, home).context;
    const backgroundContext = await readJson(contextFile, null);
    await writeJson(file, { path: next.requested, recent });
    try { if (backgroundContext) await writeJson(contextFile, { ...backgroundContext, projectDir: next.effective }); }
    catch (error) { await writeJson(file, saved); throw error; }
    project = next.effective; projectInfo = next;
    local.project = project; local.managedRoots = managedRoots; local.discoveryRoots = discoveryRoots;
    previews.clear(); removalPreviews.clear(); pluginCatalogPreviews.clear();
    return next;
  }
  // 36c §5, §8: a read-only Codex refuses changes, with a message that also stands alone in
  // 0.10.x interfaces. Claude objects are read-only in this version.
  // 36c §6: a restore acts on the side its activity record names, whatever the request says.
  async function activityAgent(id) {
    const registry = await registryFor(environment('local'));
    return registry.activity.find(entry => entry.id === id)?.agent ?? 'codex';
  }
  const CLAUDE_UPDATES = new Set(['update.check', 'update.apply']);
  async function assertAgentWritable(request) {
    if (request.mode !== 'local') { if (request.agent === 'claude') fail(403, 'MODE_DISABLED', '演练环境不包含 Claude。'); return; }
    // A file diff only reads a preview, and checks against the preview's own side.
    if (request.action === 'preview.diff') return;
    // An update's side is its target's (36c §6 UpdateTarget.agent).
    const side = request.action === 'activity.restore' ? await activityAgent(request.id) : CLAUDE_UPDATES.has(request.action) ? request.target?.agent ?? 'codex' : request.agent;
    if (side === 'claude' && !AGENT_FLAG_ONLY.has(request.action)) {
      if (!CLAUDE_WRITES.has(request.action) && !CLAUDE_SKILL_FILES.has(request.action) && !CLAUDE_PLUGIN_SOURCES.has(request.action) && !CLAUDE_UPDATES.has(request.action) && request.action !== 'activity.restore') fail(422, 'UNSUPPORTED_FOR_AGENT', '这一版 SkillDock 还不能在 Claude 中执行这个操作。');
      // 36c §8: which of the environment's states refuses the write, checked before the Claude lock.
      const found = await agentLayer.discover({ force: true });
      if (!found.installed.claude) fail(404, 'AGENT_NOT_INSTALLED', '本机未找到 Claude。');
      const claude = await claudeFor(found, project, true);
      const state = agentLayer.effective('claude', found, side => side === 'claude' ? claude?.unconfirmed : null);
      if (state.management === 'unconfirmed') fail(409, 'AGENT_UNCONFIRMED', state.reason || '无法确认 Claude 环境，暂不能修改。');
      if (state.management !== 'enabled') fail(409, 'AGENT_READ_ONLY', 'Claude 环境当前为只读，SkillDock 不会修改 Claude 中的技能、插件和 marketplace。请在 SkillDock 的“Agent 环境”页启用 Claude 管理后重试。');
      if (CLAUDE_WRITES.has(request.action) && !found.cli.claude.available) fail(422, 'CLI_UNAVAILABLE', '未找到可用的 Claude 命令行，暂不能修改 Claude。');
      return;
    }
    if (!HOST_WRITES.has(request.action)) return;
    // 36c §6: a version-2 batch removal names each copy's side; its items are checked one by one (4c review P2-03).
    if (request.action === 'skill.removeSelected' && request.agent !== undefined) return;
    if (await codexReadOnly())
      fail(409, 'AGENT_READ_ONLY', 'Codex 环境当前为只读，SkillDock 不会修改 Codex 中的技能和插件。请在 SkillDock 的“Agent 环境”页启用 Codex 管理后重试。');
  }
  async function codexReadOnly() { return (await readManagement(stateDir)).codex?.management === 'read-only'; }
  // HLD 3.8: targets of an Agent that is not managed (read-only, unconfirmed or gone) pause.
  async function pausedTarget(mode, target) {
    if (mode !== 'local') return null;
    const agent = target.agent ?? 'codex';
    const stored = await readManagement(stateDir);
    const management = stored[agent]?.management;
    // HLD 3.8: a Codex that is gone, or whose command line cannot confirm its plugins, pauses its
    // targets once Claude is managed too; with Codex alone, 0.10.2 behaviour stays (MR-SDX-001).
    if (agent === 'codex' && management !== 'read-only' && stored.claude?.management === 'enabled') {
      const found = await agentLayer.discover();
      if (!found.installed.codex) return '本机未找到 Codex，计划中的这一项暂停；恢复后继续。';
      if (target.kind === 'plugin' && !found.cli.codex.available) return 'Codex 命令行不可用，无法确认插件状态，计划中的这一项暂停；恢复后继续。';
    }
    if (agent === 'codex' && management !== 'read-only') return null;
    if (agent === 'claude' && management === 'enabled') {
      const found = await agentLayer.discover();
      if (!found.installed.claude) return '本机未找到 Claude，计划中的这一项暂停；恢复后继续。';
      const claude = await claudeFor(found, project, false);
      if (claude.unconfirmed) return `无法确认 Claude 环境，计划中的这一项暂停；恢复后继续。\n${claude.unconfirmed}`;
      return null;
    }
    return `${AGENT_NAME[agent]} 管理未启用，计划中的这一项暂停；在 SkillDock 的“Agent 环境”页启用后恢复。`;
  }
  async function agentAction(request) {
    if (request.mode !== 'local') fail(403, 'MODE_DISABLED', '测试环境不能修改 Agent 环境。');
    if (request.action === 'agent.setManagement') return setManagement(request.agent, request.management, request.confirm === true);
    if (request.action === 'settings.setClaudeRoot') {
      const { configDir, pluginCacheDir } = request.claudeRoot;
      for (const [label, directory, required] of [['配置目录', configDir, true], ['插件缓存目录', pluginCacheDir, false]]) {
        const stat = await fs.stat(directory).catch(error => error.code === 'ENOENT' ? null : error);
        if (stat instanceof Error) fail(422, 'INVALID_PATH', `无法读取 Claude ${label} ${directory}：${stat.code}。`);
        if (stat ? !stat.isDirectory() : required) fail(422, 'INVALID_PATH', `Claude ${label} ${directory} ${stat ? '不是目录' : '不存在'}。`);
      }
      const saved = await writeClaudeRoot(stateDir, { configDir, pluginCacheDir, origin: 'explicit' });
      return { message: `已切换 Claude 根目录为 ${saved.configDir}。` };
    }
    if (request.action === 'settings.setNodePath') {
      const node = await inspectNode(request.nodePath);
      const npm = node.node && await findNpm(node.node, { via: request.nodePath });
      if (!node.node || !npm) fail(422, 'NODE_UNAVAILABLE', `${request.nodePath} 不能用于 SkillDock：${node.reason || '未找到能由它执行的 npm。'}`);
      await writeSavedNode(stateDir, { ...node, ...npm, source: 'manual' });
      return { message: `已改用 Node ${node.nodeVersion}（${node.node}）；下次启动 SkillDock 时生效。` };
    }
    if (request.action === 'settings.redetectNode') {
      const found = await resolveToolchain({ stateDir, home, save: false, fresh: true, log: () => {} });
      if (found.available === false) fail(422, 'NODE_UNAVAILABLE', `未找到能构建 SkillDock 的 Node.js 22.12 或更新版本（已检查 ${found.rejected.length} 个位置）。`);
      if (found.source !== 'saved') await writeSavedNode(stateDir, found);
      return { message: `检测到 Node ${found.nodeVersion}（${found.node}）；下次启动 SkillDock 时使用。` };
    }
    fail(422, 'UNSUPPORTED_FOR_AGENT', '一键更新另一侧的 SkillDock 将在后续版本提供；请按“Agent 环境”页给出的步骤手动更新。');
  }
  // HLD 3.6, 6.4: enabling checks the main evidence first and reads the state back.
  async function setManagement(agent, management, cleanup = false) {
    const found = await agentLayer.discover({ force: true });
    // Turning management off needs no installation: an environment enabled before can be turned off after it is gone.
    if (!found.installed[agent] && (management === 'enabled' || !found.stored[agent])) fail(404, 'AGENT_NOT_INSTALLED', `本机未找到 ${AGENT_NAME[agent]}。`);
    if (management === 'enabled') {
      if (!found.cli[agent].available) fail(422, 'CLI_UNAVAILABLE', `未找到可用的 ${AGENT_NAME[agent]} 命令行，不能启用管理。`);
      // The main evidence must be readable now, not only the command line (36c 7.2).
      const claude = agent === 'claude' ? await claudeFor(found, project, true) : null;
      const state = agentLayer.effective(agent, found, side => side === 'claude' ? claude?.unconfirmed : null);
      if (state.management === 'unconfirmed') fail(409, 'AGENT_UNCONFIRMED', state.reason);
    }
    const note = agent === 'claude' && management === 'read-only' ? await claudeDirectBeforeDisabling(found, cleanup) : '';
    const stored = await readManagement(stateDir);
    stored[agent] = { management, origin: 'user', changedAt: now() };
    await writeManagement(stateDir, stored);
    if ((await readManagement(stateDir))[agent]?.management !== management) fail(502, 'READBACK_FAILED', '管理状态写入后读回不一致，请重试。');
    return { message: management === 'enabled' ? `已启用 ${AGENT_NAME[agent]} 管理。`
      : `已把 ${AGENT_NAME[agent]} 设为只读；SkillDock 不再修改其中的技能和插件，计划中的相关项暂停。${note}` };
  }
  /**
   * HLD 3.3: turning Claude management off says which marketplaces SkillDock wrote are still in
   * Claude, and with the user's confirmation removes them first, through the ordinary removal
   * (it uninstalls what came from them and reads back). Records Claude no longer has lose only
   * SkillDock's own files, under the Claude lock and journaled. Only an enabled Claude is written
   * (4d review P3-05); a failure leaves management on.
   */
  async function claudeDirectBeforeDisabling(found, cleanup) {
    const env = environment('local'); const tracked = (await registryFor(env)).claudeDirectPlugins ?? {};
    if (!Object.keys(tracked).length) return '';
    const claude = found.installed.claude ? await claudeFor(found, project, true) : { marketplaces: [], plugins: [] };
    const listed = name => claude.marketplaces.find(item => item.name === name);
    // Without a confirmed Claude every record may still be in it.
    const inClaude = Object.keys(tracked).filter(name => claude.unconfirmed || ownClaudeDirect(listed(name), tracked[name], env));
    const label = names => names.map(name => `${name}（${tracked[name].name}）`).join('、');
    if (!cleanup) return inClaude.length ? `\nSkillDock 生成的本地 marketplace 仍登记在 Claude 中：${label(inClaude)}。需要清理时，重新启用管理后再停用，并勾选一并清理。` : '';
    if ((await readManagement(stateDir)).claude?.management !== 'enabled') fail(409, 'AGENT_READ_ONLY', 'Claude 当前为只读，SkillDock 不修改其中的对象；需要清理时先启用管理。');
    if (claude.unconfirmed) fail(409, 'AGENT_UNCONFIRMED', claude.unconfirmed);
    if (inClaude.length && !found.cli.claude.available) fail(422, 'CLI_UNAVAILABLE', '未找到可用的 Claude 命令行，暂不能修改 Claude。');
    for (const name of Object.keys(tracked)) {
      if (inClaude.includes(name)) { const market = listed(name); await claudeAction({ mode: 'local', action: 'marketplace.remove', agent: 'claude', id: market.id, expectedRevision: market.revision, confirm: true }); continue; }
      const release = await fs.stat(found.claudeRoot.configDir).then(stat => stat.isDirectory(), () => false) ? acquireFileLock(operationLock(found.claudeRoot.configDir)) : () => {};
      try {
        // Claude may have gained it meanwhile: then it is left for the check below.
        if (found.installed.claude && ownClaudeDirect((await claudeFor(found, project, true)).marketplaces.find(item => item.name === name), tracked[name], env)) continue;
        await dropClaudeDirectFiles(env, name, tracked[name]);
        const registry = await registryFor(env);
        registry.activity.unshift({ id: crypto.randomUUID(), action: 'marketplace.remove', agent: 'claude', target: name, createdAt: now(), status: 'success', message: `SkillDock 生成的本地 marketplace ${name} 不在 Claude 中，已删除它的本地文件。`, canRestore: false });
        await writeJson(env.registryFile, registry);
      } finally { release(); }
    }
    const left = Object.keys((await registryFor(env)).claudeDirectPlugins ?? {});
    if (left.length) fail(502, 'READBACK_FAILED', `SkillDock 生成的本地 marketplace 未能全部清理：${label(left)}；管理保持启用，请在 Marketplace 页核实后重试。`);
    return `\n已清理 SkillDock 生成的本地 marketplace：${label(Object.keys(tracked))}。`;
  }
  async function executeRequest(input, internal = false) {
    const context = { notes: [] };
    const result = await executeRequestCore(input, internal, context);
    // Rules that describe a shared skill's change travel with its result (36c §6).
    return context.notes.length && result && typeof result === 'object' ? { ...result, nativeRules: [...(result.nativeRules ?? []), ...context.notes] } : result;
  }
  async function executeRequestCore(input, internal, context) {
    let request = validateAction(input); const mode = request.mode; environment(mode);
    if (restarting || closing) fail(409, 'APP_RESTARTING', 'SkillDock 正在准备重启，请等待界面自动重连。');
    await assertAgentWritable(request);
    const disabling = request.action === 'schedule.configure' && !request.schedule.enabled;
    if (!internal && !disabling && (requestBusy || scheduler.isRunning())) fail(409, 'BUSY', '另一个操作或更新批次正在执行，请稍后重试。');
    if (!internal) { const gated = await sharedSkillGate(request); request = gated.request; context.notes = gated.notes; }
    if (request.action === 'schedule.configure') {
      if (!disabling && busy) fail(409, 'BUSY', '另一个操作正在执行。');
      return scheduler.configure(mode, request.schedule);
    }
    if (request.action === 'updates.run') return scheduler.run(mode, { targets: request.targets, autoApply: request.autoApply });
    if (request.agent === 'claude' && CLAUDE_WRITES.has(request.action)) {
      requestBusy = true;
      try { return await claudeAction(request); } finally { requestBusy = false; claudeCache = undefined; }
    }
    if (mode === 'local' && request.agent === 'claude' && CLAUDE_PLUGIN_SOURCES.has(request.action)) {
      requestBusy = true;
      try { return await claudePluginSourceAction(request); } finally { requestBusy = false; }
    }
    if (mode === 'local' && (request.agent === 'claude' && CLAUDE_SKILL_FILES.has(request.action) || request.action === 'activity.restore' && await activityAgent(request.id) === 'claude')) {
      requestBusy = true;
      try { return await claudeSkillAction(request); } finally { requestBusy = false; }
    }
    requestBusy = true;
    let target; let applying = false;
    try {
      if (request.action === 'skill.previewRemoval') return await previewRemoval(environment(mode), request);
      if (request.action === 'preview.diff') {
        const entry = previews.get(request.previewId);
        if (!entry || !['update', 'source-link', 'plugin-update'].includes(entry.kind)) fail(409, 'STALE_PREVIEW', '预览已过期，请重新检查更新。');
        const preview = await assertPreview(environment(mode), request.previewId, entry.kind, entry.agent ?? 'codex');
        await verifyDirectoryRoot(preview.targetBoundary);
        const before = await inspectTree(preview.target);
        if (before.fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '本机文件在预览后发生变化，请重新检查更新。');
        const change = diffFiles(before.entries, preview.tree.entries).find(item => item.path === request.path);
        if (!change) fail(404, 'DIFF_FILE_NOT_FOUND', '该文件不在本次预览的变更清单中。');
        return { message: '文件差异已加载。', diff: await previewFileDiff(before, { ...preview.tree, realRoot: await fs.realpath(preview.candidate) }, change) };
      }
      if (request.action.startsWith('project.')) {
        if (mode !== 'local') fail(403, 'MODE_DISABLED', '测试环境不能选择本机项目。');
        if (request.action === 'project.chooseDirectory') return { message: '', selectedDirectory: await projectIntegration.choose(request.projectDir) };
        return { message: '项目扫描目录已切换；请核对现有更新计划的项目目标。', projectContext: await selectProject(request.projectDir) };
      }
      let translated = request; let base; let claudeTarget = false;
      if (['update.check', 'update.apply'].includes(request.action)) {
        // Phase 5a: a Claude target is checked and applied on Claude's side, from the multi-agent view.
        claudeTarget = request.target?.agent === 'claude' && mode === 'local';
        const current = await snapshot(mode, true, claudeTarget ? { multiAgent: true } : {}); target = scheduler.canonicalTarget(request.target, current);
        base = (claudeTarget ? claudeUpdateItems(current, await claudeUpdateMaps(current, await registryFor(environment(mode)), await claudeSkillRoots())) : buildUpdateItems(current, {}, hasPreview))
          .find(item => targetKey(item.target) === targetKey(target));
        if (!base) fail(404, 'NOT_FOUND', '更新目标不存在。');
        applying = request.action === 'update.apply';
        if (base.route === 'owner-managed' || !base.canCheck) {
          if (applying) fail(422, base.reasonCode || 'OWNER_MANAGED', base.message);
          const updateItem = { ...base, status: 'blocked', checkedAt: now() }; await scheduler.observe(mode, target, updateItem);
          return { message: updateItem.message, updateItem };
        }
        translated = { mode, action: `${target.kind}.${applying ? 'update' : 'checkUpdate'}`, id: target.id, ...(applying ? { previewId: request.previewId } : {}) };
        if (claudeTarget) {
          // A skill or a skills-directory plugin: the Claude skill file transaction, against the revision the page saw or, for a plan, the current one.
          const object = target.kind === 'skill' ? current.skills.find(item => item.id === target.id) : current.plugins.find(item => item.id === target.id);
          translated = { ...translated, action: applying ? 'skill.update' : 'skill.checkUpdate', agent: 'claude', expectedRevision: request.expectedRevision ?? object?.revision };
        }
        // AC-003: a skill checked or updated from the updates page meets the same shared-skill and
        // cross-side rules as from its card (4c review P2-01).
        if (!internal && request.agent !== undefined && target.kind === 'skill') {
          const gated = await sharedSkillGate({ ...translated, agent: target.agent ?? 'codex', expectedRevision: request.expectedRevision, ...(request.confirm !== undefined ? { confirm: request.confirm } : {}) });
          context.notes.push(...gated.notes);
        }
      } else if (['skill.checkUpdate', 'skill.update'].includes(request.action)) {
        target = { kind: 'skill', id: request.id }; applying = request.action === 'skill.update';
      }
      if (target?.kind === 'plugin' && !applying) await scheduler.reconcileBinding(mode, target);
      const binding = target && (applying || target.kind === 'plugin') ? await scheduler.beforeOwnUpdate(mode, target) : null;
      const result = !claudeTarget ? await executeAction(translated) : base.route === 'claude-plugin'
        ? await claudePluginUpdate(target, { applying, previewId: request.previewId, internal }) : await claudeSkillAction(translated);
      // PH3-P1-01: a check of a read-only Codex changed nothing, and its result cannot be applied.
      if (!claudeTarget && !applying && request.action === 'update.check' && mode === 'local' && await codexReadOnly()) {
        // A plugin check skipped the marketplace refresh; a skill check read its source as usual.
        const note = translated.action === 'plugin.checkUpdate'
          ? `${result.message} Codex 为只读：这次检查没有刷新来源，也没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。`
          : `${result.message} Codex 为只读：这次检查没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。`;
        result.message = note;
        if (result.updateItem) Object.assign(result.updateItem, { message: note, canApply: false, canAutoApply: false });
      }
      if (target && applying) await scheduler.afterOwnUpdate(mode, target, binding);
      else if (target) {
        let updateItem = result.updateItem;
        if (updateItem?.reasonCode === 'EXTERNAL_SYNC_VERIFIED') await scheduler.reconcileBinding(mode, target);
        if (updateItem?.updatedDuringCheck) await scheduler.afterOwnerRefresh(mode, target, binding);
        if (!updateItem && result.update) {
          base ||= buildUpdateItems(await snapshot(mode), {}, hasPreview).find(item => targetKey(item.target) === targetKey(target));
          updateItem = { ...base, status: result.update.available ? 'available' : 'current', canApply: result.update.available, canAutoApply: true, message: result.update.message, checkedAt: now(), changes: result.update.changes, ...(result.update.available ? { previewId: result.update.id } : {}) };
        }
        if (updateItem) { await scheduler.observe(mode, target, updateItem); result.updateItem = updateItem; }
      }
      if (mode === 'local' && ['plugin.update', 'plugin.checkUpdate', 'plugin.install', 'plugin.installSource', 'skill.update', 'marketplace.refresh'].includes(translated.action)) options.onInstallationChange?.();
      return result;
    } catch (error) {
      // A confirmation still to give, or a page to refresh, is not a failed update: the item keeps
      // what the last check saw (4c/4d re-review P3-01).
      if (target && !['CONFIRMATION_REQUIRED', 'SNAPSHOT_STALE'].includes(error.code)) await scheduler.observeError(mode, target, error).catch(() => {});
      throw error;
    } finally { requestBusy = false; }
  }
  async function dispatchRequest(input, internal = false) {
    const request = validateAction(input); environment(request.mode);
    if (internal) return executeRequest(request, true);
    if (request.action === 'schedule.configure' && !request.schedule.enabled) {
      // This separate cancellation record never rewrites a worker's history.
      // The current atomic item completes, then the worker observes the stop.
      await ensureGeneration();
      await verifyDirectoryRoot(applicationBoundary);
      await writeJson(disabledFile(request.mode), request.schedule);
      if (request.mode === 'local') await background?.remove({ deferBootout: isOperationActive(codexHome) });
      if (operationActive) return { message: '已关闭自动更新；当前单项完成后停止。', schedule: { ...request.schedule, running: scheduler.isRunning() } };
      try { return await withOperation(() => executeRequest(request)); }
      catch (error) { if (error.code !== 'BUSY') throw error; return { message: '已关闭自动更新；当前单项完成后停止。', schedule: { ...request.schedule, running: true } }; }
    }
    return withOperation(async () => {
      if (request.action !== 'schedule.configure') return executeRequest(request);
      const previous = await readJson(path.join(environments[request.mode].root, 'updates.json'), null);
      try {
        const result = await executeRequest(request);
        if (request.schedule.enabled) await fs.rm(disabledFile(request.mode), { force: true });
        return result;
      } catch (error) {
        if (request.mode === 'local' && (!previous?.schedule.enabled || await disabledSchedule(request.mode))) await background?.remove().catch(() => {});
        throw error;
      }
    });
  }
  async function action(input, internal = false) {
    const request = validateAction(input); environment(request.mode);
    if (request.action.startsWith('agent.') || request.action.startsWith('settings.')) return withOperation(() => agentAction(request));
    if (internal || request.action !== 'schedule.configure') return dispatchRequest(request, internal);
    // Configuration has its own short lock so disabling remains possible while
    // an update owns the operation lock, but a concurrent enable cannot erase it.
    const release = acquireFileLock(path.join(stateDir, 'schedule-config.lock'));
    try { return await dispatchRequest(request); } finally { release(); }
  }
  const isBusy = () => busy || requestBusy || operationActive || restarting || closing || scheduler.isRunning();
  scheduler = await createScheduler({ environments, snapshot: schedulerSnapshot, perform: request => action(request, true), signature: targetSignature, hasPreview, migrate: migrateTarget,
    planVersion: generation >= CURRENT_GENERATION ? 2 : 1,
    verifySynchronized: async (mode, target, expectedSignature) => {
      if (target.kind !== 'plugin' || target.agent === 'claude') return false;
      // A marketplace refresh can install packages itself. Verify existing
      // contents first, without asking the CLI to mutate an unbound target.
      const result = await executeAction({ mode, action: 'plugin.checkUpdate', id: target.id },
        { pluginCheckOptions: { refreshMarketplace: false, requireCurrent: true, expectedSignature } });
      return result.updateItem.status === 'current';
    },
    coreBusy: () => busy || requestBusy || restarting || closing, clock: options.now, startTimer: false, recover: false, disabledSchedule, paused: pausedTarget,
    beforeConfigure: async (mode, input) => {
      if (input.enabled) { if (mode === 'local') { await background?.ensure(); migrationError = undefined; } }
    } });
  try {
    await withOperation(async () => {
      const state = scheduler.data('local', { skills: [], plugins: [], updates: [] });
      if (state.schedule.enabled && background) {
        try { await background.ensure(); } catch (error) { migrationError = redact(error.message); }
      }
    });
  } catch (error) { if (error.code !== 'BUSY') throw error; }
  return { stateDir, get project() { return project; }, launchProject, get projectContext() { return projectInfo; }, defaultMode, environments, adapter, snapshot, skill, action, projects, directoryIcon,
    updateProgress: async mode => { environment(mode); await refreshSchedule(); return scheduler.progress(mode); },
    tickScheduler: () => withOperation(() => scheduler.tick()), isBusy,
    pauseForRestart: () => { if (isBusy()) return false; restarting = true; return true; }, resumeAfterRestart: () => { restarting = false; },
    close: async () => { closing = true; await scheduler.close(); await operationPromise?.catch(() => {}); } };
}
