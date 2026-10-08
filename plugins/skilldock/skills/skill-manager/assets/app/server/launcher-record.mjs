// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Launcher record written by 0.11.x (API-SDX-001 36a §5, §7). The
// legacy fields are read by frozen 0.10.2 code and must follow 36a §5.2 exactly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonical, compareVersions, parseVersion, readText } from './installs.mjs';
import { installationIdentity } from './installation.mjs';
import { CURRENT_GENERATION, readGeneration, writeAtomic } from './generation.mjs';
import { acquireFileLock } from './process-lock.mjs';
import { withStateLocks } from './state-locks.mjs';

export const RECORD_FORMAT = 2;
export const recordFile = state => path.join(state, 'launcher.json');
export const legacyProjectDir = state => path.join(state, 'compat/legacy-project');
// 0.10.x never reads or deletes compat/: the last record written by 0.11 survives a
// 0.10.x launcher removing launcher.json (PRD Q8; 36a §5.4).
export const mirrorFile = state => path.join(state, 'compat/launcher-record.json');

/** 36a §7: kept present and empty; never used as a project. */
export async function ensureLegacyProject(state) {
  const directory = legacyProjectDir(state);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  return canonical(directory);
}

/** Parsed record, null when absent; throws when present but unreadable (0.10.2 semantics). */
export async function readRecord(state) {
  const text = await readText(recordFile(state));
  if (text === undefined) return null;
  if (text === null) throw new Error('启动记录不可读。');
  try { return JSON.parse(text); } catch (error) { throw new Error(`启动记录不可读：${error.message}`); }
}

export const isCurrentRecord = record => Number.isInteger(record?.format) && record.format >= RECORD_FORMAT;

export async function writeRecord(state, record) {
  await writeAtomic(recordFile(state), `${JSON.stringify(record, null, 2)}\n`);
  await mirrorRecord(state, record);
  return record;
}

export async function mirrorRecord(state, record) {
  if (isCurrentRecord(record)) await writeAtomic(mirrorFile(state), `${JSON.stringify(record, null, 2)}\n`);
}

/** The instance named by a record answers its health check (36c §4 frozen fields). */
export async function verifyInstance(record, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${record.url}/api/health`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    const health = response.ok ? await response.json() : null;
    return health?.app === 'skilldock' && health.pid === record.pid && health.state === record.state && (!health.sourceDigest || health.sourceDigest === record.digest);
  } catch { return false; }
}

/**
 * Generation 2 without launcher.json (36a §5.4; G-07): writes back the last 0.11 record,
 * in its running form when `verify(record)` confirms that instance, otherwise stopped.
 * The caller holds the instance lock and, when the Codex root exists, the Codex lock.
 */
export async function restoreRecord(state, { verify }) {
  if (await readText(recordFile(state)) !== undefined) return null;
  let mirror;
  try { mirror = JSON.parse(await readText(mirrorFile(state)) ?? 'null'); } catch { mirror = null; }
  if (!isCurrentRecord(mirror) || mirror.state !== state) return null;
  const record = mirror.status === 'running' && await verify(mirror) ? mirror : stoppedRecord(mirror);
  await writeAtomic(recordFile(state), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * 36a §5.2 rules ① and ②: the legacy source is the highest Codex-side installation of
 * the same marketplace and source as the running one; without one it is the running
 * installation itself. `installation` is what 0.10.2 computes for that source.
 */
export async function legacyFields({ codexHome, installs, running }) {
  const home = await canonical(codexHome);
  const codexSide = installs.filter(item => item.agent === 'codex' && item.home === home
    && item.marketplace === running.marketplace && item.sourceKey && item.sourceKey === running.sourceKey)
    .sort((a, b) => compareVersions(parseVersion(b.version), parseVersion(a.version)));
  const source = codexSide[0]?.appPath ?? running.appPath;
  return { source, installation: await installationIdentity(source, home) };
}

/**
 * The record of a running instance. `running` and `preferred` are installation
 * references (installs.reference); `legacy` comes from legacyFields.
 */
export function buildRecord({ state, url, pid, digest, runtime, codexHome, cli, execution, legacyProject, legacy, running, preferred, actualProject, status = 'running' }) {
  return {
    url, pid, state, project: legacyProject, projectContext: null,
    source: legacy.source, installation: legacy.installation,
    digest, runtime, codexHome, cli: cli ?? null, execution: execution ?? null,
    format: RECORD_FORMAT, generation: CURRENT_GENERATION, status,
    running, preferred, actualProject: actualProject ?? null, updatedAt: new Date().toISOString(),
  };
}

/** 36a §5.3: stopping keeps every field and only marks the record stopped. */
export const stoppedRecord = record => ({ ...record, status: 'stopped', updatedAt: new Date().toISOString() });

/**
 * Refreshes what changes with installations (36a §5.2 ⑦, §5.3): the preferred launch
 * target always, the legacy fields when the Codex side changed. The running
 * installation changes only when an instance switches.
 */
export async function refreshRecord(record, { codexHome, installs, preferred }) {
  const legacy = await legacyFields({ codexHome, installs, running: record.running });
  const next = { ...record, preferred, source: legacy.source, installation: legacy.installation };
  const changed = JSON.stringify([next.preferred, next.source, next.installation]) !== JSON.stringify([record.preferred, record.source, record.installation]);
  return changed ? { ...next, updatedAt: new Date().toISOString() } : record;
}

/**
 * Service and background check of 36a §5.4: on generation-2 data a missing record is
 * written back under the instance lock and, when the Codex root exists, the Codex lock.
 * Busy locks skip this round; the record is checked again later.
 */
export async function restoreMissingRecord(state, codexHome) {
  if (await readText(recordFile(state)) !== undefined || await readGeneration(state) < CURRENT_GENERATION) return null;
  // A launch in progress (launcher.lock) writes the record itself.
  let launching;
  try {
    launching = acquireFileLock(path.join(state, 'launcher.lock'));
    return await withStateLocks(state, codexHome, () => restoreRecord(state, { verify: verifyInstance }), { wait: 0 });
  } catch (error) { if (error.code === 'BUSY') return null; throw error; }
  finally { launching?.(); }
}
