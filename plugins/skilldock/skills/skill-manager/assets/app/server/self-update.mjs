// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import { pluginPath } from './paths.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureSource } from '../scripts/source-bundle.mjs';
import { installationIdentity, sameInstallation, readRestart, writeRestart } from './installation.mjs';
import { redact, safeSegment } from './files.mjs';
import { CURRENT_GENERATION, readGeneration } from './generation.mjs';
import { compareVersions, parseVersion } from './installs.mjs';
import { isCurrentRecord } from './launcher-record.mjs';
import { repeatedFailure } from './migration.mjs';

function startWorker(job, { service, codexHome }) {
  return new Promise(async (resolve, reject) => {
    let log;
    try {
      log = await fs.open(path.join(service.stateDir, 'server.log'), 'a', 0o600);
      const windows = process.platform === 'win32';
      const child = spawn(windows ? process.execPath : '/bin/sh', [path.resolve(job.source, windows ? '../../scripts/launch.mjs' : '../../scripts/launch.sh'), 'restart'], {
        cwd: service.project, detached: true, shell: false,
        env: { ...process.env, CODEX_HOME: codexHome, SKILLDOCK_STATE_DIR: service.stateDir,
          SKILLDOCK_PROJECT_DIR: service.project, PORT: String(new URL(job.url).port), SKILLDOCK_RESTART_JOB: job.id },
        stdio: ['ignore', log.fd, log.fd],
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`重启启动器退出（${code ?? 'signal'}）。`)));
      child.unref();
    } catch (error) { reject(error); }
    finally { await log?.close(); }
  });
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

export const RETRY_BASE_MS = 60000;
export const RETRY_MAX_MS = 30 * 60000;

export function createSelfUpdater({ service, codexHome, pollMs = 1000, startTimer = true,
  worker = startWorker, runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), now = Date.now, appSource = process.env.SKILLDOCK_APP_SOURCE }) {
  let pending = false; let closed = false; let task; let workerRunning = false; let timer;
  // 0.10.3 (API-SDX-001 36b §7.3): back off after a failed restart so a refused migration
  // is not retried, with a full inventory refresh, on every poll.
  // The trigger key is the observed background digest (generation 1) or the newer target
  // (generation 2); a notification only resets.
  let trigger = ''; let failures = 0; let retryAt = 0;
  const reset = () => { failures = 0; retryAt = 0; };
  const failed = () => { failures += 1; retryAt = now() + Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS); };
  const request = () => { reset(); pending = true; };
  const readRecord = () => fs.readFile(path.join(service.stateDir, 'launcher.json'), 'utf8').then(JSON.parse, () => null);
  // Generation 2 (HLD 3.7, DEC-SDX-008): the highest installation of the family runs, on either
  // side. The service and the background keep the record's preferred target current (every
  // 10 seconds); one higher than the running installation is restarted into.
  function newerTarget(record) {
    if (!isCurrentRecord(record) || record.status !== 'running' || record.pid !== process.pid || record.state !== service.stateDir || record.runtime !== runtime) return null;
    const { preferred, running } = record;
    if (!preferred?.appPath || !running?.appPath || preferred.appPath === running.appPath) return null;
    const higher = parseVersion(preferred.version); const current = parseVersion(running.version);
    return higher && current && compareVersions(higher, current) > 0 ? preferred : null;
  }
  async function check() {
    const modern = !closed && await readGeneration(service.stateDir).catch(() => 0) >= CURRENT_GENERATION;
    if (modern) {
      // A new target starts over (36b §7.3); the background digest is no trigger here.
      // A target whose switch failed and was rolled back is not tried again until it changes or an
      // interactive start succeeds (36b §7.4; phase 5 re-review P3-03): the launcher refuses it anyway.
      let target = newerTarget(await readRecord());
      if (target && await repeatedFailure(service.stateDir, { appDir: target.appPath, version: target.version }).catch(() => null)) target = null;
      const key = target ? `${target.appPath}\n${target.version}` : '';
      if (key !== trigger) { reset(); trigger = key; }
      if (target) pending = true;
    } else if (!closed && process.env.SKILLDOCK_SOURCE_DIGEST) {
      let observed = '';
      try {
        const background = JSON.parse(await fs.readFile(path.join(service.stateDir, 'background/context.json'), 'utf8'));
        if (typeof background.digest === 'string') observed = background.digest;
      } catch { /* Background updates may not be configured. */ }
      if (observed !== trigger) { reset(); trigger = observed; }
      if (observed && observed !== process.env.SKILLDOCK_SOURCE_DIGEST) pending = true;
    }
    if (closed || workerRunning || !pending || service.isBusy() || now() < retryAt) return;
    pending = false;
    let job;
    try {
      if (modern) {
        const record = await readRecord(); const target = newerTarget(record);
        if (!target || await repeatedFailure(service.stateDir, { appDir: target.appPath, version: target.version }).catch(() => null)) return;
        // The target is still the version the record named.
        const pkg = await fs.readFile(path.join(target.appPath, 'package.json'), 'utf8').then(JSON.parse, () => null);
        if (pkg?.version !== target.version) return;
        const { sourceDigest } = await captureSource(target.appPath);
        if (closed) return;
        if (!service.pauseForRestart()) { pending = true; return; }
        job = { id: crypto.randomUUID(), source: target.appPath, sourceDigest, previousPid: record.pid, url: record.url,
          status: 'preparing', requestedAt: new Date().toISOString() };
        await writeRestart(service.stateDir, job);
        start(job);
        return;
      }
      let record;
      try { record = JSON.parse(await fs.readFile(path.join(service.stateDir, 'launcher.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (record.pid !== process.pid || record.state !== service.stateDir || record.project !== (service.launchProject || service.project) || record.runtime !== runtime) return;
      const current = await installationIdentity(record.source, codexHome, { expected: record.installation });
      let source = record.source;
      if (current.kind === 'plugin') {
        const snapshot = await service.snapshot('local', true);
        const installed = snapshot.plugins.find(item => item.installed && item.id === `${current.plugin}@${current.marketplace}`);
        if (!installed || !safeSegment(installed.version)) return;
        source = path.join(pluginPath(current.codexHome, current.marketplace, current.plugin, installed.version), current.appPath);
        if (!sameInstallation(current, await installationIdentity(source, codexHome))) throw new Error('新版应用的安装身份不匹配。');
      }
      const { sourceDigest } = await captureSource(source);
      if (sourceDigest === record.digest || closed) return;
      if (!service.pauseForRestart()) { pending = true; return; }
      job = { id: crypto.randomUUID(), source, sourceDigest, previousPid: record.pid, url: record.url,
        status: 'preparing', requestedAt: new Date().toISOString() };
      await writeRestart(service.stateDir, job);
      start(job);
    } catch (error) {
      failed();
      service.resumeAfterRestart();
      await writeRestart(service.stateDir, { ...(job || { id: crypto.randomUUID() }), status: 'failed', message: redact(error.message), completedAt: new Date().toISOString() });
    }
  }
  function start(job) {
    workerRunning = true;
    // The child must outlive this server; close() must never wait for it to stop us.
    Promise.resolve().then(() => worker(job, { service, codexHome })).catch(async error => {
      failed();
      if (closed) return;
      const result = await readRestart(service.stateDir).catch(() => null);
      if (result?.id === job.id && result.status !== 'failed')
        await writeRestart(service.stateDir, { ...job, status: 'failed', message: redact(error.message), completedAt: new Date().toISOString() });
    }).finally(() => {
      workerRunning = false;
      if (!closed) service.resumeAfterRestart();
    }).catch(() => {});
  }
  function tick() {
    if (task) return task;
    task = check().finally(() => { task = undefined; }); return task;
  }
  // 36b §7.4: an accepting launcher runs while its pid is alive and still holds launcher.lock.
  async function executorRunning(executor) {
    if (!Number.isInteger(executor.pid) || !alive(executor.pid)) return false;
    try { return JSON.parse(await fs.readFile(path.join(service.stateDir, 'launcher.lock'), 'utf8'))?.pid === executor.pid; } catch { return false; }
  }
  // Derived from restart.json only. A job accepted by a 0.11 launcher that no longer runs
  // is reported closed: ready when this instance runs the job's source.
  async function status() {
    const record = await readRestart(service.stateDir).catch(() => null);
    if (!record || !['preparing', 'restarting', 'ready', 'failed'].includes(record.status)) return undefined;
    if (['preparing', 'restarting'].includes(record.status) && record.executor && !(await executorRunning(record.executor)))
      return record.source === appSource ? { id: record.id, status: 'ready' } : { id: record.id, status: 'failed', message: '重启任务未完成。' };
    return { id: record.id, status: record.status, ...(record.message ? { message: redact(record.message) } : {}), ...(record.restored ? { restored: true } : {}) };
  }
  if (startTimer) { timer = setInterval(() => { tick().catch(() => {}); }, pollMs); timer.unref(); }
  return { request, tick, status, close: async () => { closed = true; clearInterval(timer); await task?.catch(() => {}); } };
}
