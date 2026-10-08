// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Launcher record written by 0.11.x (API-SDX-001 36a §5, §7). The
// legacy fields are read by frozen 0.10.2 code and must follow 36a §5.2 exactly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonical, compareVersions, parseVersion, readText } from './installs.mjs';
import { installationIdentity } from './installation.mjs';
import { CURRENT_GENERATION, writeAtomic } from './generation.mjs';

export const RECORD_FORMAT = 2;
export const recordFile = state => path.join(state, 'launcher.json');
export const legacyProjectDir = state => path.join(state, 'compat/legacy-project');

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
