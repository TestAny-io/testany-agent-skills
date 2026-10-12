// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { acquireFileLock } from './process-lock.mjs';
import { canonicalPath, installationIdentity, sameInstallation } from './installation.mjs';

const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const routes = new Map([
  ['/api/health', []], ['/api/session', []], ['/api/state', ['mode', 'refresh', 'multiAgent']],
  ['/api/skill', ['mode', 'id', 'agent']], ['/api/updates/progress', ['mode', 'agent']],
  ['/api/plugin-icon', ['mode', 'id', 'theme', 'agent']],
]);

export function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Invalid SkillDock loopback address.');
  return url.origin;
}

export function readRoute(value) {
  if (typeof value !== 'string' || !value.startsWith('/api/') || value.includes('#') || value.includes('\\')) throw new Error('Unsupported SkillDock read route.');
  const url = new URL(value, 'http://127.0.0.1');
  const allowed = routes.get(url.pathname);
  if (!allowed || [...url.searchParams.keys()].some(key => !allowed.includes(key)) || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1))
    throw new Error('Unsupported SkillDock read route.');
  if (url.searchParams.has('mode') && !['local', 'sandbox'].includes(url.searchParams.get('mode'))) throw new Error('Invalid workspace mode.');
  if (url.searchParams.has('refresh') && !['true', 'false'].includes(url.searchParams.get('refresh'))) throw new Error('Invalid refresh flag.');
  // API-SDX-001 36c §9: multiAgent only as 1, agent only as codex or claude.
  if (url.searchParams.has('multiAgent') && url.searchParams.get('multiAgent') !== '1') throw new Error('Invalid multiAgent flag.');
  if (url.searchParams.has('agent') && !['codex', 'claude'].includes(url.searchParams.get('agent'))) throw new Error('Invalid agent.');
  return url.pathname + url.search;
}

async function json(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function createNativeBackend({ skillRoot, env = process.env, fetchImpl = fetch, startImpl, execImpl = exec, gateCheck } = {}) {
  const state = path.resolve(env.SKILLDOCK_STATE_DIR || path.join(os.homedir(), '.local/share/skilldock'));
  const codexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  const appSource = path.join(skillRoot, 'assets/app');
  const identity = installationIdentity(appSource, codexHome);
  const sourceVersion = json(path.join(appSource, 'package.json')).then(value => value?.version);
  let starting;
  let prepared = false;
  let lastAttempt = 0;
  let lastError;

  async function configuration() {
    const record = await json(path.join(state, 'launcher.json'));
    let launchRoot = skillRoot;
    const origin = localOrigin(env.PORT ? 'http://127.0.0.1:' + env.PORT : record?.url || 'http://127.0.0.1:4771');
    if (record) {
      if (record.state !== await canonicalPath(state)) throw new Error('SkillDock state ownership does not match.');
      if (record.source !== await canonicalPath(appSource)) {
        const ours = await identity;
        const prior = await installationIdentity(record.source, codexHome, { expected: record.installation });
        if (ours.kind !== 'plugin' || !sameInstallation(ours, prior)) throw new Error('SkillDock 数据目录属于另一个安装来源；未接管其后台。');
        // A long-lived MCP connection must not downgrade the app after its
        // independent updater has advanced this installation to a newer cache.
        const ownVersion = await sourceVersion;
        const priorVersion = (await json(path.join(record.source, 'package.json')))?.version;
        const numbers = version => /^\d+\.\d+\.\d+$/.test(version || '') ? version.split('.').map(Number) : [];
        const left = numbers(ownVersion), right = numbers(priorVersion);
        const different = left.findIndex((number, index) => number !== right[index]);
        if (left.length === 3 && right.length === 3 && different >= 0 && right[different] > left[different]) launchRoot = path.resolve(record.source, '../..');
      }
    }
    return { record, origin, launchRoot };
  }

  async function request(origin, route, options = {}) {
    const response = await fetchImpl(origin + route, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(120000), ...options,
    });
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 24 * 1024 * 1024) throw new Error('SkillDock response is too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('SkillDock returned invalid JSON.'); }
    return { status: response.status, data };
  }

  async function health(config) {
    let result;
    try { result = await request(config.origin, '/api/health', { signal: AbortSignal.timeout(2000) }); }
    catch (error) {
      // Only transport unavailability allows starting a service. Invalid JSON is
      // evidence of a different/broken listener, not permission to replace it.
      if (error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name)) return null;
      throw error;
    }
    const h = result.data; const r = config.record;
    if (result.status !== 200 || h?.app !== 'skilldock' || typeof h.instanceId !== 'string' ||
        !r || h.pid !== r.pid || h.state !== r.state || h.sourceDigest !== r.digest)
      throw new Error('端口上的服务与 SkillDock 启动记录不匹配；未替换或停止该服务。');
    return h;
  }

  // HLD 3.7 (G-01): the Agents whose older SkillDock stopped the migration gate, read again
  // from the same evidence the launcher used; the interface offers to update them.
  async function gateAgents(config) {
    const { planLaunch } = await import('./launch-plan.mjs');
    // The gate's blockers do not depend on which installation judges, so no handover here (5d review P3-03).
    const plan = await planLaunch({ action: 'start', env: { ...env, SKILLDOCK_STATE_DIR: state, SKILLDOCK_UPDATE_AGENT: '', SKILLDOCK_DELEGATED: '1' }, home: env.HOME || os.homedir(),
      appDir: path.join(config.launchRoot, 'assets/app'), update: async () => { throw new Error('not here'); }, log() {} });
    return [...new Set((plan.error?.output?.blockers ?? []).map(item => item.agent))];
  }

  async function start(config, extra = {}) {
    const saved = await json(path.join(state, 'project.json'));
    const project = env.SKILLDOCK_PROJECT_DIR || saved?.path || config.record?.project || os.homedir();
    // The gate's update runs only with the agreement given in the interface (5d review P3-04).
    const startupEnv = { ...env, SKILLDOCK_STATE_DIR: state, PORT: new URL(config.origin).port, SKILLDOCK_UPDATE_AGENT: '', ...extra };
    if (startImpl) return startImpl({ skillRoot: config.launchRoot, state, project, env: startupEnv });
    try {
      await execImpl('/bin/sh', [path.join(config.launchRoot, 'scripts/launch.sh'), 'start', '--project', project], {
        cwd: project, env: startupEnv, timeout: 600000, maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      // Launcher diagnostics are local stderr; never include credentials or
      // unrestricted command output in a tool result.
      const { redact } = await import('./errors.mjs');
      const details = redact(String(error.stderr || error.message).slice(-2500));
      const agents = error.code === 4 ? await (gateCheck ?? gateAgents)(config).catch(() => []) : [];
      if (agents.length) throw new Error('SKILLDOCK_ERROR:' + JSON.stringify({ code: 'MIGRATION_BLOCKED', message: 'SkillDock 后台启动未完成。' + details, agents }));
      throw new Error('SkillDock 后台启动未完成。' + details);
    }
  }

  // `updateAgent`: the user agreed to the gate's one-click update of that Agent's SkillDock.
  async function ensure({ updateAgent } = {}) {
    const config = await configuration();
    const live = await health(config);
    if (live && prepared) return { ...config, health: live };
    if (starting) return starting;
    if (lastError && !updateAgent && Date.now() - lastAttempt < 10000) throw lastError;
    starting = (async () => {
      let release;
      const deadline = Date.now() + 600000;
      try {
        for (;;) {
          try { release = acquireFileLock(path.join(state, 'native-start.lock')); break; }
          catch (error) {
            if (error.code !== 'BUSY' || Date.now() >= deadline) throw error;
            await delay(300);
            const current = await configuration(); const ready = await health(current);
            if (ready) { prepared = true; return { ...current, health: ready }; }
          }
        }
        const current = await configuration(); const ready = await health(current);
        if (!ready || !prepared) await start(current, updateAgent ? { SKILLDOCK_UPDATE_AGENT: updateAgent } : {});
        const next = await configuration(); const checked = await health(next);
        if (!checked) throw new Error('SkillDock 后台尚未就绪，请重试。');
        lastError = undefined;
        prepared = true;
        return { ...next, health: checked };
      } catch (error) { lastAttempt = Date.now(); lastError = error; throw error; }
      finally { release?.(); }
    })();
    try { return await starting; } finally { starting = undefined; }
  }

  return {
    async read(route) {
      route = readRoute(route);
      const current = await ensure();
      if (route === '/api/health') return { status: 200, data: current.health };
      if (route === '/api/session') {
        const response = await request(current.origin, route);
        return { status: response.status, data: { token: current.health.instanceId, defaultMode: response.data.defaultMode } };
      }
      return request(current.origin, route);
    },
    async action(body, session) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 32768) throw new Error('Invalid SkillDock action body.');
      const current = await ensure();
      if (session !== current.health.instanceId) return { status: 409, data: { error: { code: 'SESSION_CHANGED', message: '后台已重启，请刷新清单后重新操作。' } } };
      const token = await request(current.origin, '/api/session');
      if (token.status !== 200 || typeof token.data.token !== 'string') throw new Error('SkillDock session is unavailable.');
      // No retry after dispatch: an interrupted response can have committed.
      try {
        return await request(current.origin, '/api/actions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': token.data.token }, body: JSON.stringify(body),
        });
      } catch {
        throw new Error('操作响应中断，结果尚未确认。请先刷新操作记录和清单，确认后再决定是否重试。');
      }
    },
    async updateAtGate(agent) {
      if (!['codex', 'claude'].includes(agent)) throw new Error('Invalid agent.');
      await ensure({ updateAgent: agent });
      return { status: 200, data: { ok: true } };
    },
    async download(name) {
      if (!['license', 'source'].includes(name)) throw new Error('Unsupported download.');
      return (await ensure()).origin + '/api/' + name;
    },
  };
}
