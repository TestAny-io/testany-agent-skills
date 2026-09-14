import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppError, fail, exists, inside, identity, hash, now, metadata, inspectTree, copySkill, objectFingerprint, diffFiles, readJson, writeJson, safeName, safeSegment, redact, captureDirectoryRoot, verifyDirectoryRoot, verifyDescendantDirectory } from './files.mjs';
import { toggleConfig, readConfig } from './config.mjs';
import { CodexAdapter, validateSource, validateSubpath, validateRef, checkoutGit, readMarketplace, readComponentEntry, readPluginManifest, discoverSkillRoots } from './cli.mjs';
import { initializeSandbox, emptyRegistry } from './fixtures.mjs';
import { scan, sandboxCatalog, rootsFor } from './scanner.mjs';
import { enrichSources, buildUpdateItems, targetKey } from './sources.mjs';
import { createScheduler, validateTarget, validateSchedule } from './scheduler.mjs';

const ACTION_FIELDS = {
  'skill.toggle': ['id', 'enabled'], 'skill.previewInstall': ['sourceType', 'source', 'subpath', 'ref', 'name'],
  'skill.install': ['previewId'], 'skill.checkUpdate': ['id'], 'skill.update': ['id', 'previewId'],
  'skill.remove': ['id'], 'activity.restore': ['id'], 'plugin.install': ['id'], 'plugin.remove': ['id'],
  'plugin.toggle': ['id', 'enabled'], 'marketplace.add': ['sourceType', 'source', 'ref'],
  'marketplace.refresh': ['id'], 'marketplace.remove': ['id'],
  'skill.previewSource': ['id', 'sourceType', 'source', 'subpath', 'ref'], 'skill.connectSource': ['id', 'previewId'],
  'update.check': ['target'], 'update.apply': ['target', 'previewId'], 'updates.run': ['targets', 'autoApply'], 'schedule.configure': ['schedule'],
};
export function validateAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'INVALID_ACTION', '请求需要 JSON 对象。');
  if (!['local', 'sandbox'].includes(input.mode)) fail(400, 'INVALID_MODE', '请求的环境无效。');
  const fields = ACTION_FIELDS[input.action];
  if (!fields) fail(400, 'INVALID_ACTION', '不支持该操作。');
  for (const key of Object.keys(input)) if (!['mode', 'action', ...fields].includes(key)) fail(400, 'INVALID_ACTION', `该操作不支持参数 ${key}。`);
  for (const field of ['id', 'previewId']) {
    if (fields.includes(field) && (typeof input[field] !== 'string' || !input[field] || input[field].length > 300 || /[\x00-\x1f]/.test(input[field]))) fail(400, 'INVALID_ACTION', `缺少有效的 ${field}。`);
  }
  if (fields.includes('enabled') && typeof input.enabled !== 'boolean') fail(400, 'INVALID_ACTION', 'enabled 必须为布尔值。');
  if (fields.includes('source')) {
    if (!['local', 'git'].includes(input.sourceType)) fail(400, 'INVALID_SOURCE', 'sourceType 必须为 local 或 git。');
    validateSource(input.source, input.sourceType); validateRef(input.ref);
    if (input.sourceType === 'local' && input.ref !== undefined) fail(400, 'INVALID_REF', '本地目录不使用 Git ref。');
  }
  if (input.subpath !== undefined) validateSubpath(input.subpath);
  if (input.name !== undefined && !safeName(input.name)) fail(400, 'INVALID_NAME', '安装名称只支持小写字母、数字、点、短横线和下划线。');
  if (fields.includes('target')) validateTarget(input.target);
  if (input.targets !== undefined) { if (!Array.isArray(input.targets) || input.targets.length > 1000) fail(400, 'INVALID_TARGET', '目标列表无效。'); input.targets.forEach(validateTarget); }
  if (fields.includes('autoApply') && typeof input.autoApply !== 'boolean') fail(400, 'INVALID_ACTION', 'autoApply 必须显式为布尔值。');
  if (fields.includes('schedule')) validateSchedule(input.schedule);
  return input;
}

export function compareVersions(left, right) {
  const parse = value => /^v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value || '');
  const a = parse(left); const b = parse(right); if (!a || !b) return null;
  const aa = a[1].split('.').map(Number); const bb = b[1].split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) > (bb[i] || 0) ? 1 : -1;
  if (a[2] === b[2]) return 0; if (!a[2]) return 1; if (!b[2]) return -1;
  const preA = a[2].split('.'); const preB = b[2].split('.');
  for (let i = 0; i < Math.max(preA.length, preB.length); i += 1) {
    if (preA[i] === preB[i]) continue; if (preA[i] === undefined) return -1; if (preB[i] === undefined) return 1;
    const numA = /^\d+$/.test(preA[i]); const numB = /^\d+$/.test(preB[i]);
    if (numA && numB) return Number(preA[i]) > Number(preB[i]) ? 1 : -1;
    if (numA !== numB) return numA ? -1 : 1; return preA[i] > preB[i] ? 1 : -1;
  }
  return 0;
}

export async function createService(options = {}) {
  const homeInput = path.resolve(options.home || os.homedir()); const home = await fs.realpath(homeInput);
  let stateDir = path.resolve(options.stateDir || process.env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock'));
  const projectInput = path.resolve(options.projectDir || process.env.SKILLDOCK_PROJECT_DIR || process.cwd());
  const project = await exists(projectInput) ? await fs.realpath(projectInput) : projectInput;
  const codexHome = path.resolve(options.codexHome || process.env.CODEX_HOME || path.join(home, '.codex'));
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  stateDir = await fs.realpath(stateDir);
  const localRoot = path.join(stateDir, 'local'); await fs.mkdir(localRoot, { recursive: true, mode: 0o700 });
  const local = { mode: 'local', root: localRoot, home, codexHome, project, config: path.join(codexHome, 'config.toml'), skills: path.join(codexHome, 'skills'), registryFile: path.join(localRoot, 'registry.json') };
  // Test fixtures are a programmatic opt-in, never an environment or HTTP switch.
  const environments = { local };
  if (options.enableTestSandbox === true) environments.sandbox = { mode: 'sandbox', ...await initializeSandbox(path.join(stateDir, 'sandbox')) };
  for (const env of Object.values(environments)) {
    env.stateBoundary = await captureDirectoryRoot(env.root);
    env.codexBoundary = await captureDirectoryRoot(env.codexHome); env.codexRootReal = env.codexBoundary.real;
    env.managedRoots = await Promise.all(rootsFor(env).filter(root => root.scope !== 'system').map(root => captureDirectoryRoot(root.directory)));
  }
  const adapter = options.adapter || new CodexAdapter({ codexHome, codexBin: options.codexBin || process.env.SKILLDOCK_CODEX_BIN, timeout: options.cliTimeout });
  const defaultMode = options.enableTestSandbox === true ? 'sandbox' : 'local'; const previews = new Map(); let busy = false; let cachedCatalog; let catalogTime = 0; let scheduler;
  const previewNow = options.now || Date.now;
  const hasPreview = id => !!id && previews.has(id) && previewNow() - previews.get(id).created <= 30 * 60000;
  const environment = mode => {
    if (mode === 'sandbox' && !environments.sandbox) fail(403, 'MODE_DISABLED', '演练环境已移除，此服务仅提供本机模式。');
    if (!environments[mode]) fail(400, 'INVALID_MODE', '请求的环境无效。');
    return environments[mode];
  };
  const registryFor = env => readJson(env.registryFile, emptyRegistry());
  async function catalogFor(env, registry, force = false) {
    if (env.mode === 'sandbox') return sandboxCatalog(env, registry);
    if (!cachedCatalog || force || Date.now() - catalogTime > 15000) { cachedCatalog = await adapter.list(); catalogTime = Date.now(); }
    return structuredClone(cachedCatalog);
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
  async function snapshot(mode, force = false) {
    const started = performance.now(); const env = environment(mode); await verifyDirectoryRoot(env.stateBoundary); const registry = await registryFor(env);
    await cleanupTemporary(env).catch(() => {});
    const result = await enrichSources(await scan(env, registry, await catalogFor(env, registry, force)), env, registry);
    if (scheduler) { const { extraActivity, ...updateState } = scheduler.data(mode, result); Object.assign(result, updateState); result.activity = [...result.activity, ...extraActivity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200); }
    else result.updates = buildUpdateItems(result, {}, hasPreview);
    for (const file of (await fs.readdir(env.root)).filter(name => /^pending-plugin-update-[a-f0-9-]+\.json$/.test(name)).slice(0, 20)) result.diagnostics.push(`存在未确认的包更新记录 ${file}；请核对插件版本和启用状态，旧写请求不会自动重放。`);
    result.durationMs = Math.round(performance.now() - started); return result;
  }
  async function skill(mode, id) {
    if (typeof id !== 'string' || id.length > 300) fail(400, 'INVALID_ID', '需要技能 ID。');
    const record = (await snapshot(mode)).skills.find(item => item.id === id);
    if (!record) fail(404, 'NOT_FOUND', '未找到该技能，请刷新清单。');
    const content = (await metadata(path.dirname(record.path))).content;
    return { skill: record, content };
  }
  async function assertWritableSkill(env, id, capability) {
    const record = (await snapshot(env.mode)).skills.find(item => item.id === id);
    if (!record) fail(404, 'NOT_FOUND', '未找到该技能，请刷新。');
    if (!record[capability]) fail(403, 'PROTECTED_SKILL', record.reason || '该技能不支持此操作。');
    const directory = path.dirname(record.path);
    const realDirectory = await fs.realpath(directory);
    if (env.mode === 'sandbox' && !inside(env.root, realDirectory)) fail(403, 'SANDBOX_BOUNDARY', '技能实际位置越出演练范围。');
    if (!record.pluginId) {
      const boundary = env.managedRoots.find(root => inside(root.directory, directory));
      if (!boundary) fail(403, 'ROOT_BOUNDARY', '技能不属于启动时确认的受管根。');
      await verifyDirectoryRoot(boundary);
      if (!inside(boundary.real, realDirectory)) fail(403, 'ROOT_BOUNDARY', '技能实际位置越出原受管根。');
    }
    if (inside(realDirectory, fileURLToPath(import.meta.url)) || directory.split(path.sep).includes('.system') || inside('/etc/codex/skills', realDirectory)) fail(403, 'PROTECTED_SKILL', '应用自身或系统内容不可修改。');
    if (capability === 'canUpdate' && await exists(path.join(directory, '.git'))) fail(422, 'GIT_OWNER_MANAGED', '该目录本身是 Git 仓库，SkillDock 不替换工作树或 .git 元数据。');
    return { record, directory };
  }
  async function assertTargetRoot(env) {
    await verifyDirectoryRoot(env.codexBoundary);
    const boundary = env.managedRoots.find(root => root.directory === env.skills); await verifyDirectoryRoot(boundary);
    if (env.mode === 'sandbox' && !inside(env.root, boundary.real)) fail(403, 'SANDBOX_BOUNDARY', '安装根越出演练范围。');
    await fs.mkdir(env.skills, { recursive: true });
    if (await fs.realpath(env.codexHome) !== env.codexRootReal || (await fs.lstat(env.skills)).isSymbolicLink() || !inside(env.codexRootReal, await fs.realpath(env.skills))) fail(403, 'TARGET_BOUNDARY', '技能安装根的身份已变化或是越界链接，不能写入。');
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
    const protectedPaths = [path.join(env.codexRootReal, 'plugins'), path.join(env.codexRootReal, 'skills/.system'), '/etc/codex/skills'];
    if (protectedPaths.some(root => inside(root, actual.parentReal))) fail(403, 'RESTORE_BOUNDARY', '恢复目标位于托管或系统目录。');
  }
  function assertSandboxSource(env, source) {
    if (env.mode === 'sandbox' && (!path.isAbsolute(source) || !inside(env.root, source))) fail(403, 'SANDBOX_BOUNDARY', '演练模式仅接受演练目录内的来源；请使用示例路径。');
  }
  async function stageSource(env, request) {
    const source = validateSource(request.source, request.sourceType); const subpath = validateSubpath(request.subpath); validateRef(request.ref); assertSandboxSource(env, source);
    if (path.isAbsolute(source)) {
      if (!(await exists(source))) fail(404, 'SOURCE_MISSING', '来源目录不存在。');
      if (env.mode === 'sandbox' && !inside(env.root, await fs.realpath(source))) fail(403, 'SANDBOX_BOUNDARY', '来源链接越出演练目录。');
    }
    const staging = path.join(env.root, 'staging', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      let sourceRoot = source; let commit;
      if (request.sourceType === 'git') { sourceRoot = path.join(staging, 'repository'); commit = await checkoutGit(source, request.ref, sourceRoot); }
      const realRoot = await fs.realpath(sourceRoot); const directory = path.resolve(realRoot, subpath);
      if (!inside(realRoot, directory) || !(await exists(directory)) || !inside(realRoot, await fs.realpath(directory))) fail(422, 'SOURCE_BOUNDARY', '子路径不存在或越出来源根目录。');
      const detail = await metadata(directory); const candidate = path.join(staging, 'candidate'); const tree = await copySkill(directory, candidate);
      return { staging, candidate, source, sourceType: request.sourceType, subpath, ref: request.ref, commit, originalDirectory: directory, detail, tree };
    } catch (e) { await fs.rm(staging, { recursive: true, force: true }); throw e; }
  }
  async function assertPreview(env, id, kind) {
    const preview = previews.get(id);
    if (!preview || preview.mode !== env.mode || preview.kind !== kind || previewNow() - preview.created > 30 * 60000) fail(409, 'STALE_PREVIEW', '预览已过期或属于其他环境，请重新预览。');
    if ((await inspectTree(preview.candidate)).fingerprint !== preview.tree.fingerprint) fail(409, 'STAGED_CHANGED', '暂存内容发生变化，请重新预览。');
    if (preview.sourceType === 'local' && (await inspectTree(preview.originalDirectory)).fingerprint !== preview.tree.fingerprint) fail(409, 'SOURCE_CHANGED', '来源在预览后发生变化，请重新预览。');
    return preview;
  }
  const provenance = (preview, directory) => ({ directory, source: preview.source, sourceType: preview.sourceType, subpath: preview.subpath, ref: preview.ref, commit: preview.commit, fingerprint: preview.tree.fingerprint, files: preview.tree.entries, installedAt: now(), generation: crypto.randomUUID() });
  async function move(from, to) {
    const boundaries = Object.values(environments).flatMap(env => [env.stateBoundary, ...env.managedRoots]).sort((a, b) => b.directory.length - a.directory.length);
    for (const target of [from, to]) {
      const parent = path.dirname(target); const boundary = boundaries.find(root => inside(root.directory, parent));
      if (!boundary) fail(403, 'ROOT_BOUNDARY', '移动位置不在固定受管根内。');
      await verifyDescendantDirectory(boundary, parent);
    }
    await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
    try { await fs.rename(from, to); }
    catch (e) { if (e.code === 'EXDEV') fail(422, 'CROSS_DEVICE', '来源与备份区不在同一文件系统，未移动原目录；请把 SKILLDOCK_STATE_DIR 放在同一磁盘。'); throw e; }
  }
  async function preparePluginUpdate(env, registry, id) {
    let catalog = await catalogFor(env, registry, true); let plugin = catalog.plugins.find(item => item.id === id && item.installed);
    if (!plugin) fail(404, 'NOT_FOUND', '未找到已安装插件。');
    const initialVersion = plugin.version;
    if (!plugin._updateSourcePath || plugin.sourceInfo?.confidence !== 'verified' || !Array.isArray(plugin._componentRoots)) fail(422, 'OWNER_MANAGED', '没有已核实的本地包来源；请在 Codex 插件管理器更新，再刷新状态。');
    if (typeof plugin.enabled !== 'boolean') fail(422, 'STATE_UNKNOWN', '无法确认原启用状态，不能安全执行包更新。');
    const market = catalog.marketplaces.find(item => item.id === plugin.marketplace);
    if (market?.type === 'git' && market.canRefresh) {
      if (env.mode === 'local') await adapter.command(['plugin', 'marketplace', 'upgrade', market.name, '--json'], { mutation: true });
      else {
        const entry = registry.marketplaces[market.id]; assertSandboxSource(env, entry.source);
        const stage = path.join(env.root, 'marketplace-sources', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, stage); await fs.mkdir(path.dirname(stage), { recursive: true });
        await checkoutGit(entry.source, entry.ref, stage); const refreshed = await readMarketplace(stage); if (refreshed.name !== market.name) fail(409, 'MARKETPLACE_CHANGED', '市场来源名称变化。'); entry.root = stage; entry.refreshedAt = now();
      }
      catalog = await catalogFor(env, registry, true); plugin = catalog.plugins.find(item => item.id === id && item.installed);
      if (!plugin?._updateSourcePath) fail(422, 'SOURCE_MISSING', '刷新后未找到该插件来源。');
    }
    const source = plugin._updateSourcePath;
    const marketRoot = env.mode === 'sandbox' ? registry.marketplaces[plugin.marketplace]?.root || registry.marketplaces[plugin.marketplace]?.source : catalog.marketplaces.find(item => item.id === plugin.marketplace)?._root;
    if (!marketRoot) fail(422, 'SOURCE_MISSING', '所属市场未配置，无法核实更新来源。');
    if (env.mode === 'sandbox' && !inside(env.root, await fs.realpath(source))) fail(403, 'SANDBOX_BOUNDARY', '包来源越出演练范围。');
    const entry = await readComponentEntry(marketRoot, plugin.name, source); const manifest = await readPluginManifest(source, marketRoot);
    if (entry.version !== undefined && manifest.version !== undefined) fail(422, 'VERSION_AUTHORITY', '版本有多个 authority，无法安全更新。');
    const availableVersion = manifest.version ?? entry.version;
    if (!safeSegment(availableVersion)) fail(422, 'VERSION_UNVERIFIED', '来源未声明可验证的版本；请由包维护者发布明确版本后再更新。');
    const installedPath = path.join(env.codexHome, 'plugins/cache', plugin.marketplace, plugin.name, plugin.version);
    await verifyDescendantDirectory(env.codexBoundary, installedPath);
    if (!(await exists(installedPath))) fail(422, 'INSTALLATION_UNVERIFIED', 'CLI 对应的已安装缓存不存在，不能验证更新前内容。');
    const installed = await inspectTree(installedPath);
    const prior = registry.pluginBaselines?.[id] || registry.plugins?.[id];
    if (prior?.version === plugin.version && prior.fingerprint && prior.fingerprint !== installed.fingerprint) fail(409, 'LOCAL_CHANGES', '已安装包相对已记录基线发生本地变化，请先保留修改。');
    const staging = path.join(env.root, 'staging', crypto.randomUUID()); await verifyDescendantDirectory(env.stateBoundary, staging); await fs.mkdir(staging, { recursive: true, mode: 0o700 });
    const candidate = path.join(staging, 'candidate'); const tree = await copySkill(source, candidate);
    const sourceReal = await fs.realpath(source); const componentRoots = (await discoverSkillRoots(source, { marketRoot, entry })).map(root => path.relative(sourceReal, root) || '.');
    if (componentRoots.some(relative => !inside(candidate, path.resolve(candidate, relative)))) fail(422, 'UNSUPPORTED_COMPONENTS', '来源组件在包根之外，无法证明安装缓存映射。');
    const changes = diffFiles(installed.entries, tree.entries); const order = compareVersions(availableVersion, plugin.version);
    const current = availableVersion === plugin.version && installed.fingerprint === tree.fingerprint;
    const updatedDuringCheck = current && market?.type === 'git' && compareVersions(plugin.version, initialVersion) === 1;
    const blocked = !current && (availableVersion === plugin.version || order !== null && order < 0);
    const previewId = crypto.randomUUID();
    const item = { target: { kind: 'plugin', id }, name: plugin.name, owner: plugin.sourceInfo.owner, route: 'plugin-reinstall', status: current ? 'current' : blocked ? 'blocked' : 'available', canCheck: true, canApply: !current && !blocked, canAutoApply: !blocked && order === 1,
      message: current ? '已安装版本和内容与来源一致。' : blocked ? availableVersion === plugin.version ? '来源内容变化但版本未递增；Codex 可能复用旧缓存，请维护者递增版本。' : '来源版本低于已安装版本，自动更新不会降级。' : order === null || order === 0 ? '来源版本不同但无法证明先后；可手动确认更新，定时计划不会自动应用。' : '发现新包版本；通过 Codex 重新安装并恢复原启用状态。', reasonCode: current ? undefined : blocked ? availableVersion === plugin.version ? 'VERSION_UNCHANGED' : 'DOWNGRADE_BLOCKED' : order !== 1 ? 'MANUAL_VERSION_ORDER' : undefined,
      checkedAt: now(), installedVersion: plugin.version, availableVersion, changes, sourceInfo: plugin.sourceInfo, installedPath, ...(updatedDuringCheck ? { updatedDuringCheck: true } : {}), ...(!current && !blocked ? { previewId } : {}) };
    if (updatedDuringCheck) item.message = 'Codex 已在刷新市场时更新包，已核对版本和内容。';
    registry.pluginBaselines ||= {}; registry.pluginBaselines[id] = { version: plugin.version, fingerprint: installed.fingerprint };
    if (!current && !blocked) previews.set(previewId, { id: previewId, kind: 'plugin-update', mode: env.mode, created: previewNow(), source, sourceType: 'local', originalDirectory: source, sourceBoundary: await captureDirectoryRoot(source), candidate, staging, tree, target: installedPath, targetBoundary: await captureDirectoryRoot(installedPath), baseline: installed.fingerprint, pluginId: id, installedVersion: plugin.version, availableVersion, componentRoots, item });
    else await fs.rm(staging, { recursive: true, force: true });
    return item;
  }
  async function executeAction(request) {
    const env = environment(request.mode);
    if (busy) fail(409, 'BUSY', '另一个操作正在进行，请等待后重试。');
    busy = true; let registry; let originalRegistry;
    const undo = []; let restore; let consumedPreview; let target = request.id || request.source || 'skill'; const activityId = crypto.randomUUID(); let result;
    try {
      await verifyDirectoryRoot(env.stateBoundary);
      registry = await registryFor(env); originalRegistry = structuredClone(registry);
      switch (request.action) {
        case 'plugin.checkUpdate': {
          const item = await preparePluginUpdate(env, registry, request.id); target = item.name; result = { message: item.message, updateItem: item }; break;
        }
        case 'plugin.update': {
          const preview = await assertPreview(env, request.previewId, 'plugin-update');
          if (preview.pluginId !== request.id) fail(409, 'PREVIEW_MISMATCH', '预览不属于该插件。');
          await verifyDirectoryRoot(preview.sourceBoundary); await verifyDirectoryRoot(preview.targetBoundary);
          await verifyDescendantDirectory(env.codexBoundary, preview.target);
          if ((await inspectTree(preview.target)).fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '已安装包在预览后发生变化。');
          const catalog = await catalogFor(env, registry, true); const plugin = catalog.plugins.find(item => item.id === request.id && item.installed);
          if (!plugin || plugin.version !== preview.installedVersion || typeof plugin.enabled !== 'boolean' || plugin._updateSourcePath !== preview.source) fail(409, 'INSTALLATION_CHANGED', '插件安装或来源身份发生变化，请重新检查。');
          target = plugin.name; const enabled = plugin.enabled;
          const backup = path.join(env.root, 'quarantine', `${activityId}-plugin-backup`); await verifyDescendantDirectory(env.stateBoundary, backup); await fs.mkdir(path.dirname(backup), { recursive: true }); await copySkill(preview.target, backup);
          const destination = path.join(env.codexHome, 'plugins/cache', plugin.marketplace, plugin.name, preview.availableVersion); await verifyDescendantDirectory(env.codexBoundary, path.dirname(destination));
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
            await verifyDescendantDirectory(env.codexBoundary, destination);
            if (!actual || actual.version !== preview.availableVersion || actual.enabled !== enabled || !(await exists(destination)) || (await inspectTree(destination)).fingerprint !== preview.tree.fingerprint) fail(502, 'READBACK_FAILED', '包更新后版本、内容或启用状态无法全部确认。旧包备份与未完成记录已保留，请核实。');
            await fs.rm(pending, { force: true });
          }
          registry.pluginBaselines ||= {}; registry.pluginBaselines[plugin.id] = { version: preview.availableVersion, fingerprint: preview.tree.fingerprint };
          consumedPreview = previews.get(request.previewId); previews.delete(request.previewId); result = { message: `已将 ${plugin.name} 更新到 ${preview.availableVersion}，并保留原${enabled ? '启用' : '禁用'}状态。旧包备份已保留；包级回退通过所属管理器执行。`, needsReload: true }; break;
        }
        case 'skill.previewSource': {
          const { record, directory } = await assertWritableSkill(env, request.id, 'canRemove');
          if ((await fs.lstat(directory)).isSymbolicLink() || await exists(path.join(directory, '.git'))) fail(422, 'GIT_OWNER_MANAGED', '链接或 Git 仓库根由原所有者管理；请选择独立技能副本关联来源。');
          const current = await inspectTree(directory); const staged = await stageSource(env, request); const id = crypto.randomUUID();
          previews.set(id, { ...staged, id, mode: env.mode, kind: 'source-link', target: directory, skillId: record.id, baseline: current.fingerprint, installedFiles: current.entries, targetBoundary: await captureDirectoryRoot(directory), created: previewNow() });
          return { message: '请确认来源与本机差异；关联本身不会替换内容。', sourcePreview: { id, skillId: record.id, name: record.name, source: staged.source, target: record.path, matchesInstalled: current.fingerprint === staged.tree.fingerprint, changes: diffFiles(current.entries, staged.tree.entries) } };
        }
        case 'skill.connectSource': {
          const preview = await assertPreview(env, request.previewId, 'source-link');
          if (preview.skillId !== request.id) fail(409, 'PREVIEW_MISMATCH', '来源预览不属于该技能。');
          const { record, directory } = await assertWritableSkill(env, request.id, 'canRemove'); await verifyDirectoryRoot(preview.targetBoundary);
          const current = await inspectTree(directory); if (current.fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '本机内容在来源预览后发生变化，请重新预览。');
          registry.sources[record.id] = { ...provenance(preview, directory), confidence: 'user-confirmed', fingerprint: current.fingerprint, files: current.entries };
          target = record.name; consumedPreview = previews.get(request.previewId); previews.delete(request.previewId); result = { message: `已关联 ${record.name} 的更新来源，本机文件保持原样。` }; break;
        }
        case 'skill.previewInstall': {
          const staged = await stageSource(env, request); const name = request.name || staged.detail.name;
          if (!safeName(name)) { await fs.rm(staged.staging, { recursive: true, force: true }); fail(422, 'INVALID_NAME', '技能 name 不适合作为安装目录，请在请求中指定有效 name。'); }
          const destination = path.join(env.skills, name);
          if (await exists(destination)) { await fs.rm(staged.staging, { recursive: true, force: true }); fail(409, 'TARGET_EXISTS', '同名安装目录已存在，不能覆盖。'); }
          const id = crypto.randomUUID(); previews.set(id, { ...staged, id, mode: env.mode, kind: 'install', target: destination, created: previewNow() });
          return { message: '预览已准备；确认后才会安装。', preview: { id, name: staged.detail.name, description: staged.detail.description, target: destination, source: staged.source, files: staged.tree.files, bytes: staged.tree.bytes } };
        }
        case 'skill.install': {
          const preview = await assertPreview(env, request.previewId, 'install'); await assertTargetRoot(env);
          if (await exists(preview.target)) fail(409, 'TARGET_EXISTS', '安装目标已存在，请重新预览。');
          await move(preview.candidate, preview.target); undo.push(async () => { if ((await inspectTree(preview.target)).fingerprint === preview.tree.fingerprint) await move(preview.target, preview.candidate); });
          registry.sources[identity(preview.target)] = provenance(preview, preview.target); target = preview.detail.name;
          consumedPreview = previews.get(request.previewId); previews.delete(request.previewId); result = { message: `已安装 ${target}。请开启新的 Codex 会话以加载。`, needsReload: true }; break;
        }
        case 'skill.toggle': {
          const { record } = await assertWritableSkill(env, request.id, 'canToggle'); target = record.name;
          await assertConfigBoundary(env);
          if (record.pluginId) {
            const plugin = (await snapshot(env.mode)).plugins.find(item => item.id === record.pluginId);
            if (!plugin?.canToggle) fail(403, 'PROTECTED_PLUGIN', '所属插件不支持此操作。');
            const transaction = await toggleConfig(env.config, 'plugin', record.pluginId, request.enabled, path.join(env.root, 'config-backups')); undo.push(transaction.undo);
            if (env.mode === 'sandbox') registry.plugins[record.pluginId].enabled = request.enabled;
          } else {
            const transaction = await toggleConfig(env.config, 'skill', record.path, request.enabled, path.join(env.root, 'config-backups')); undo.push(transaction.undo);
          }
          result = { message: `已${request.enabled ? '启用' : '禁用'} ${target}。配置已读回；新会话生效。`, needsReload: true }; break;
        }
        case 'skill.checkUpdate': {
          const { record, directory } = await assertWritableSkill(env, request.id, 'canUpdate'); const source = registry.sources[record.id];
          const current = await inspectTree(directory);
          if (current.fingerprint !== source.fingerprint) fail(409, 'LOCAL_CHANGES', '已安装技能有本地修改；请先保留或整理修改，不能自动覆盖。');
          const staged = await stageSource(env, source); const changes = diffFiles(current.entries, staged.tree.entries); const id = crypto.randomUUID();
          if (changes.length) previews.set(id, { ...staged, id, mode: env.mode, kind: 'update', target: directory, skillId: record.id, baseline: current.fingerprint, sourceIdentity: JSON.stringify(source), targetBoundary: await captureDirectoryRoot(directory), created: previewNow() });
          else await removeStaging(env, staged.staging);
          return { message: changes.length ? '发现来源变化，请检查文件列表。' : '当前内容与来源一致。', update: { id, skillId: record.id, name: record.name, available: changes.length > 0, changes, message: changes.length ? `${changes.length} 个文件有变化；更新前会保留旧版本。` : '当前内容与来源一致。' } };
        }
        case 'skill.update': {
          const preview = await assertPreview(env, request.previewId, 'update');
          if (request.id !== preview.skillId) fail(409, 'PREVIEW_MISMATCH', '更新预览不属于该技能。');
          const { record, directory } = await assertWritableSkill(env, request.id, 'canUpdate');
          if (JSON.stringify(registry.sources[record.id]) !== preview.sourceIdentity) fail(409, 'SOURCE_RELINKED', '更新来源在预览后重新关联，请重新检查。');
          await verifyDirectoryRoot(preview.targetBoundary);
          if ((await inspectTree(directory)).fingerprint !== preview.baseline) fail(409, 'LOCAL_CHANGES', '技能在预览后发生变化，请重新检查。');
          if (preview.tree.fingerprint === preview.baseline) fail(409, 'NO_UPDATE', '没有需要更新的内容。');
          const backup = path.join(env.root, 'quarantine', activityId); const previousSource = registry.sources[record.id]; const parent = await parentIdentity(directory);
          await move(directory, backup); undo.push(async () => { if (!(await exists(directory))) await move(backup, directory); });
          await move(preview.candidate, directory); undo.push(async () => { if ((await inspectTree(directory)).fingerprint === preview.tree.fingerprint) await move(directory, preview.candidate); });
          registry.sources[record.id] = { ...provenance(preview, directory), generation: previousSource.generation || crypto.randomUUID(), confidence: previousSource.confidence || 'verified' }; target = record.name;
          restore = { kind: 'update', directory, backup, ...parent, expectedFingerprint: preview.tree.fingerprint, priorFingerprint: preview.baseline, source: previousSource, skillId: record.id };
          consumedPreview = previews.get(request.previewId); previews.delete(request.previewId); result = { message: `已更新 ${target}，旧版已保留，可从操作记录恢复。`, needsReload: true }; break;
        }
        case 'skill.remove': {
          const { record, directory } = await assertWritableSkill(env, request.id, 'canRemove'); const fingerprint = await objectFingerprint(directory); const parent = await parentIdentity(directory);
          const backup = path.join(env.root, 'quarantine', activityId); await move(directory, backup); undo.push(async () => { if (!(await exists(directory))) await move(backup, directory); });
          restore = { kind: 'remove', directory, backup, ...parent, priorFingerprint: fingerprint, source: registry.sources[record.id], skillId: record.id };
          delete registry.sources[record.id]; target = record.name;
          result = { message: `已将 ${target} 移至可恢复区；可从操作记录恢复。`, needsReload: true }; break;
        }
        case 'activity.restore': {
          const previous = registry.activity.find(entry => entry.id === request.id);
          if (!previous?.canRestore || !previous.restore) fail(404, 'RESTORE_MISSING', '没有可用的恢复记录。');
          const entry = previous.restore;
          if (!inside(path.join(env.root, 'quarantine'), entry.backup) || !(await exists(entry.backup))) fail(409, 'BACKUP_MISSING', '恢复备份缺失或不在受管理范围。');
          if (!inside(path.join(env.root, 'quarantine'), await fs.realpath(path.dirname(entry.backup)))) fail(403, 'BACKUP_BOUNDARY', '备份目录链接越出受管理范围。');
          await verifyRestoreParent(env, entry);
          if (await objectFingerprint(entry.backup) !== entry.priorFingerprint) fail(409, 'BACKUP_CHANGED', '备份内容发生变化，已停止恢复。');
          if (entry.kind === 'remove') {
            if (await exists(entry.directory)) fail(409, 'TARGET_EXISTS', '原位置已被占用，不能覆盖恢复。');
            const parent = await fs.realpath(path.dirname(entry.directory));
            const managedRoots = await Promise.all(rootsFor(env).filter(root => root.scope !== 'system').map(async root => { try { return await fs.realpath(root.directory); } catch { return root.directory; } }));
            if (!managedRoots.some(root => inside(root, parent)) || parent.split(path.sep).includes('.system')) fail(403, 'RESTORE_BOUNDARY', '原位置的管理边界已变化。');
            await move(entry.backup, entry.directory); undo.push(async () => { await move(entry.directory, entry.backup); });
          } else {
            if (!(await exists(entry.directory)) || await objectFingerprint(entry.directory) !== entry.expectedFingerprint) fail(409, 'LOCAL_CHANGES', '更新后的技能有新的修改，不能覆盖恢复。');
            const discarded = path.join(env.root, 'quarantine', `${activityId}-replaced`);
            await move(entry.directory, discarded); undo.push(async () => { if (!(await exists(entry.directory))) await move(discarded, entry.directory); });
            await move(entry.backup, entry.directory); undo.push(async () => { await move(entry.directory, entry.backup); });
          }
          if (entry.source) registry.sources[entry.skillId] = entry.source; else delete registry.sources[entry.skillId];
          previous.canRestore = false; target = previous.target; result = { message: `已恢复 ${target}。`, needsReload: true }; break;
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
          if (env.mode === 'sandbox') {
            if (installing) {
              if (!inside(env.root, await fs.realpath(plugin.sourcePath))) fail(403, 'SANDBOX_BOUNDARY', '插件来源越出演练目录。');
              if (![plugin.marketplace, plugin.name, plugin.version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '插件身份或版本不是安全的单段路径。');
              const destination = path.join(env.codexHome, 'plugins/cache', plugin.marketplace, plugin.name, plugin.version);
              const cacheRoot = path.join(env.codexRootReal, 'plugins/cache');
              if (!inside(cacheRoot, destination) || await fs.realpath(env.codexHome) !== env.codexRootReal) fail(403, 'PLUGIN_BOUNDARY', '插件安装目标越出缓存根目录。');
              await verifyDescendantDirectory(env.codexBoundary, path.dirname(destination));
              if (await exists(destination)) fail(409, 'TARGET_EXISTS', '插件缓存目标已存在，不能覆盖。');
              await inspectTree(plugin.sourcePath); await fs.mkdir(path.dirname(destination), { recursive: true });
              if (!inside(cacheRoot, await fs.realpath(path.dirname(destination)))) fail(403, 'PLUGIN_BOUNDARY', '插件父目录链接越出缓存根目录。');
              const sourcePlugin = (await sandboxCatalog(env, registry)).plugins.find(item => item.id === plugin.id);
              const componentRoots = sourcePlugin?._componentRoots || ['skills'];
              if (!Array.isArray(componentRoots) || componentRoots.some(relative => typeof relative !== 'string' || !inside(destination, path.resolve(destination, relative)))) fail(422, 'UNSUPPORTED_COMPONENTS', '初版演练不能将插件根外复用组件映射到缓存。');
              await copySkill(plugin.sourcePath, destination); undo.push(async () => { await fs.rm(destination, { recursive: true, force: true }); });
              const configuredEnabled = (await readConfig(env.config)).data.plugins?.[plugin.id]?.enabled;
              registry.plugins[plugin.id] = { name: plugin.name, description: plugin.description, marketplace: plugin.marketplace, directory: destination, version: plugin.version, componentRoots, updateSourcePath: plugin.sourceInfo?.source || plugin.sourcePath, fingerprint: (await inspectTree(destination)).fingerprint, generation: crypto.randomUUID(), enabled: configuredEnabled !== false };
            } else {
              if (!inside(path.join(env.codexRootReal, 'plugins/cache'), await fs.realpath(registry.plugins[plugin.id].directory))) fail(403, 'PLUGIN_BOUNDARY', '插件目录越出缓存根目录。');
              const backup = path.join(env.root, 'quarantine', `${activityId}-plugin`); await move(registry.plugins[plugin.id].directory, backup); undo.push(async () => { await move(backup, registry.plugins[plugin.id]?.directory || plugin.sourcePath); });
              delete registry.plugins[plugin.id];
            }
          } else {
            await adapter.command(['plugin', installing ? 'add' : 'remove', plugin.id, '--json'], { mutation: true });
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (readback.diagnostics.length || readback.plugins.some(item => item.id === plugin.id && item.installed) !== installing) fail(502, 'READBACK_FAILED', 'CLI 操作已返回，但无法确认安装终态；请刷新官方清单后再操作。');
          }
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
            await adapter.command(args, { mutation: true }); const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (!readback.marketplaces.some(item => item.id === catalog.name)) fail(502, 'READBACK_FAILED', 'CLI 未能确认市场已添加，请刷新核实。');
          }
          target = catalog.name; result = { message: `已添加市场 ${target}，可以浏览并安装其中的插件。` }; break;
        }
        case 'marketplace.refresh':
        case 'marketplace.remove': {
          const market = (await snapshot(env.mode)).marketplaces.find(item => item.id === request.id); const removing = request.action === 'marketplace.remove';
          if (!market) fail(404, 'NOT_FOUND', '市场不存在。');
          if (!market[removing ? 'canRemove' : 'canRefresh']) fail(403, 'PROTECTED_MARKETPLACE', market.reason || '此市场不支持该操作，本地目录无需 Git 刷新。');
          if (env.mode === 'sandbox') {
            if (removing) delete registry.marketplaces[market.id];
            else {
              const entry = registry.marketplaces[market.id]; const staged = path.join(env.root, 'marketplace-sources', crypto.randomUUID());
              assertSandboxSource(env, entry.source); await verifyDescendantDirectory(env.stateBoundary, staged); await fs.mkdir(path.dirname(staged), { recursive: true }); await checkoutGit(entry.source, entry.ref, staged); const catalog = await readMarketplace(staged);
              if (catalog.name !== market.name) fail(409, 'MARKETPLACE_CHANGED', '来源的市场名称发生变化。');
              entry.root = staged; entry.refreshedAt = now();
            }
          } else {
            await adapter.command(['plugin', 'marketplace', removing ? 'remove' : 'upgrade', market.name, '--json'], { mutation: true });
            const readback = await adapter.list(); cachedCatalog = readback; catalogTime = Date.now();
            if (readback.diagnostics.length || readback.marketplaces.some(item => item.id === market.id) === removing) fail(502, 'READBACK_FAILED', 'CLI 未能确认市场操作终态，请刷新核实。');
          }
          target = market.name; result = { message: removing ? `已移除市场来源 ${target}；已安装插件保留。` : `已刷新 Git 市场 ${target}；这不表示已安装插件全部更新。` }; break;
        }
      }
      if (!result) fail(400, 'INVALID_ACTION', '操作未实现。');
      registry.activity.unshift({ id: activityId, action: request.action, target, createdAt: now(), status: 'success', message: result.message, canRestore: !!restore, ...(restore ? { restore } : {}) });
      await writeJson(env.registryFile, registry);
      await cleanupTemporary(env, registry, consumedPreview).catch(() => {});
      cachedCatalog = undefined;
      return result;
    } catch (error) {
      let rollbackError;
      for (const reverse of undo.reverse()) try { await reverse(); } catch (e) { rollbackError = e; }
      let message = redact(error.message); if (rollbackError) message += `；自动恢复未完成：${redact(rollbackError.message)}，请保留备份区。`;
      if (originalRegistry) {
        originalRegistry.activity.unshift({ id: activityId, action: request.action, target, createdAt: now(), status: 'error', message, canRestore: false });
        try { await writeJson(env.registryFile, originalRegistry); } catch { message += '；操作记录无法写入。'; }
      }
      cachedCatalog = undefined;
      throw new AppError(error.status || 500, error.code || 'OPERATION_FAILED', message);
    } finally { busy = false; }
  }
  async function targetSignature(mode, target, current) {
    const env = environment(mode); current ||= await snapshot(mode); const registry = await registryFor(env);
    const item = current.updates.find(candidate => targetKey(candidate.target) === targetKey(target));
    if (!item) fail(404, 'NOT_FOUND', '更新目标不存在。');
    let directory; let generation;
    if (target.kind === 'skill') {
      const record = current.skills.find(candidate => candidate.id === target.id); directory = path.dirname(record.path); generation = registry.sources[target.id]?.generation;
    } else if (target.kind === 'plugin') {
      const plugin = current.plugins.find(candidate => candidate.id === target.id && candidate.installed);
      if (![plugin?.marketplace, plugin?.name, plugin?.version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '无法绑定插件安装身份。');
      directory = path.join(env.codexHome, 'plugins/cache', plugin.marketplace, plugin.name, plugin.version); generation = registry.plugins?.[target.id]?.generation;
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
    return { target, sourceIdentity, real, dev: String(stat.dev), ino: String(stat.ino), ...(generation ? { generation } : {}), ...(['plugin-reinstall', 'skill-source'].includes(item.route) ? { fingerprint: (await inspectTree(directory)).fingerprint } : {}) };
  }
  let requestBusy = false; let restarting = false; let closing = false;
  async function action(input, internal = false) {
    const request = validateAction(input); const mode = request.mode; environment(mode);
    if (restarting || closing) fail(409, 'APP_RESTARTING', 'SkillDock 正在准备重启，请等待界面自动重连。');
    const disabling = request.action === 'schedule.configure' && !request.schedule.enabled;
    if (!internal && !disabling && (requestBusy || scheduler.isRunning())) fail(409, 'BUSY', '另一个操作或更新批次正在执行，请稍后重试。');
    if (request.action === 'schedule.configure') {
      if (!disabling && busy) fail(409, 'BUSY', '另一个操作正在执行。');
      return scheduler.configure(mode, request.schedule);
    }
    if (request.action === 'updates.run') return scheduler.run(mode, { targets: request.targets, autoApply: request.autoApply });
    requestBusy = true;
    let target; let applying = false;
    try {
      let translated = request; let base;
      if (['update.check', 'update.apply'].includes(request.action)) {
        const current = await snapshot(mode, true); target = scheduler.canonicalTarget(request.target, current);
        base = buildUpdateItems(current, {}, hasPreview).find(item => targetKey(item.target) === targetKey(target));
        if (!base) fail(404, 'NOT_FOUND', '更新目标不存在。');
        applying = request.action === 'update.apply';
        if (base.route === 'owner-managed' || !base.canCheck) {
          if (applying) fail(422, base.reasonCode || 'OWNER_MANAGED', base.message);
          const updateItem = { ...base, status: 'blocked', checkedAt: now() }; await scheduler.observe(mode, target, updateItem);
          return { message: updateItem.message, updateItem };
        }
        translated = { mode, action: `${target.kind}.${applying ? 'update' : 'checkUpdate'}`, id: target.id, ...(applying ? { previewId: request.previewId } : {}) };
      } else if (['skill.checkUpdate', 'skill.update'].includes(request.action)) {
        target = { kind: 'skill', id: request.id }; applying = request.action === 'skill.update';
      }
      const binding = target && (applying || target.kind === 'plugin') ? await scheduler.beforeOwnUpdate(mode, target) : null;
      const result = await executeAction(translated);
      if (target && applying) await scheduler.afterOwnUpdate(mode, target, binding);
      else if (target) {
        let updateItem = result.updateItem;
        if (updateItem?.updatedDuringCheck) await scheduler.afterOwnerRefresh(mode, target, binding);
        if (!updateItem && result.update) {
          base ||= buildUpdateItems(await snapshot(mode), {}, hasPreview).find(item => targetKey(item.target) === targetKey(target));
          updateItem = { ...base, status: result.update.available ? 'available' : 'current', canApply: result.update.available, canAutoApply: true, message: result.update.message, checkedAt: now(), changes: result.update.changes, ...(result.update.available ? { previewId: result.update.id } : {}) };
        }
        if (updateItem) { await scheduler.observe(mode, target, updateItem); result.updateItem = updateItem; }
      }
      if (mode === 'local' && ['plugin.update', 'plugin.checkUpdate', 'plugin.install', 'skill.update', 'marketplace.refresh'].includes(translated.action)) options.onInstallationChange?.();
      return result;
    } catch (error) {
      if (target) await scheduler.observeError(mode, target, error).catch(() => {});
      throw error;
    } finally { requestBusy = false; }
  }
  const isBusy = () => busy || requestBusy || restarting || closing || scheduler.isRunning();
  scheduler = await createScheduler({ environments, snapshot, perform: request => action(request, true), signature: targetSignature, hasPreview, coreBusy: () => busy || requestBusy || restarting || closing, clock: options.now, pollMs: options.schedulerPollMs, startTimer: options.scheduler !== false });
  return { stateDir, project, defaultMode, environments, adapter, snapshot, skill, action, tickScheduler: () => scheduler.tick(), isBusy,
    pauseForRestart: () => { if (isBusy()) return false; restarting = true; return true; }, resumeAfterRestart: () => { restarting = false; },
    close: () => { closing = true; return scheduler.close(); } };
}
