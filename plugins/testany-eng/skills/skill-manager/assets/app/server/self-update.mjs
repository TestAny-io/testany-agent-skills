// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureSource } from '../scripts/source-bundle.mjs';
import { installationIdentity, sameInstallation, readRestart, writeRestart } from './installation.mjs';
import { redact, safeSegment } from './files.mjs';

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

export function createSelfUpdater({ service, codexHome, pollMs = 1000, startTimer = true,
  worker = startWorker, runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') }) {
  let pending = false; let closed = false; let task; let workerRunning = false; let timer;
  const request = () => { pending = true; };
  async function check() {
    if (closed || workerRunning || !pending || service.isBusy()) return;
    pending = false;
    let job;
    try {
      let record;
      try { record = JSON.parse(await fs.readFile(path.join(service.stateDir, 'launcher.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (record.pid !== process.pid || record.state !== service.stateDir || record.project !== service.project || record.runtime !== runtime) return;
      const current = await installationIdentity(record.source, codexHome, { expected: record.installation });
      let source = record.source;
      if (current.kind === 'plugin') {
        const snapshot = await service.snapshot('local', true);
        const installed = snapshot.plugins.find(item => item.installed && item.id === `${current.plugin}@${current.marketplace}`);
        if (!installed || !safeSegment(installed.version)) return;
        source = path.join(current.codexHome, 'plugins/cache', current.marketplace, current.plugin, installed.version, current.appPath);
        if (!sameInstallation(current, await installationIdentity(source, codexHome))) throw new Error('新版应用的安装身份不匹配。');
      }
      const { sourceDigest } = await captureSource(source);
      if (sourceDigest === record.digest || closed) return;
      if (!service.pauseForRestart()) { pending = true; return; }
      job = { id: crypto.randomUUID(), source, sourceDigest, previousPid: record.pid, url: record.url,
        status: 'preparing', requestedAt: new Date().toISOString() };
      await writeRestart(service.stateDir, job);
      workerRunning = true;
      // The child must outlive this server; close() must never wait for it to stop us.
      Promise.resolve().then(() => worker(job, { service, codexHome })).catch(async error => {
        if (closed) return;
        const result = await readRestart(service.stateDir).catch(() => null);
        if (result?.id === job.id && result.status !== 'failed')
          await writeRestart(service.stateDir, { ...job, status: 'failed', message: redact(error.message), completedAt: new Date().toISOString() });
      }).finally(() => {
        workerRunning = false;
        if (!closed) service.resumeAfterRestart();
      }).catch(() => {});
    } catch (error) {
      service.resumeAfterRestart();
      await writeRestart(service.stateDir, { ...(job || { id: crypto.randomUUID() }), status: 'failed', message: redact(error.message), completedAt: new Date().toISOString() });
    }
  }
  function tick() {
    if (task) return task;
    task = check().finally(() => { task = undefined; }); return task;
  }
  async function status() {
    const record = await readRestart(service.stateDir).catch(() => null);
    if (!record || !['preparing', 'restarting', 'ready', 'failed'].includes(record.status)) return undefined;
    if (record.sourceDigest && record.sourceDigest === process.env.SKILLDOCK_SOURCE_DIGEST) return { id: record.id, status: 'ready' };
    return { id: record.id, status: record.status, ...(record.message ? { message: redact(record.message) } : {}), ...(record.restored ? { restored: true } : {}) };
  }
  if (startTimer) { timer = setInterval(() => { tick().catch(() => {}); }, pollMs); timer.unref(); }
  return { request, tick, status, close: async () => { closed = true; clearInterval(timer); await task?.catch(() => {}); } };
}
