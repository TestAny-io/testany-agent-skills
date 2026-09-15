// Opt-in, read-only verification of this machine. Never included in npm test.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createService } from '../server/service.mjs';

const home = os.homedir();
const codexHome = path.resolve(process.env.CODEX_HOME || path.join(home, '.codex'));
const projectDir = path.resolve(process.env.SKILLDOCK_PROJECT_DIR || process.cwd());
const protectedPaths = [path.join(codexHome, 'config.toml'), path.join(codexHome, 'skills'), path.join(home, '.agents/skills'), path.join(projectDir, '.agents/skills'), path.join(projectDir, '.codex/skills')];

async function digest(paths) {
  const hash = crypto.createHash('sha256'); let files = 0;
  async function visit(file) {
    hash.update(file).update('\0');
    let stat;
    try { stat = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') { hash.update('missing'); return; } throw error; }
    if (stat.isSymbolicLink()) { hash.update('link:').update(await fs.readlink(file)); return; }
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) {
        if (name !== '.git' && name !== 'node_modules') await visit(path.join(file, name));
      }
    } else if (stat.isFile()) { files++; hash.update(await fs.readFile(file)); }
  }
  for (const file of paths) await visit(file);
  return { sha256: hash.digest('hex'), files };
}

const before = await digest(protectedPaths);
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-local-smoke-'));
let service;
try {
  service = await createService({ home, codexHome, projectDir, stateDir, scheduler: false });
  const start = performance.now();
  const snapshot = await service.snapshot('local', true);
  const elapsed = Math.round(performance.now() - start);
  const sample = snapshot.skills.find(skill => skill.scope === 'user') || snapshot.skills[0];
  if (!sample) throw new Error('No local skill discovered; read-only smoke has no evidence.');
  const detail = await service.skill('local', sample.id);
  if (!detail.content.includes('---')) throw new Error('Skill detail did not contain frontmatter.');
  const after = await digest(protectedPaths);
  const unchanged = before.sha256 === after.sha256;
  console.log(JSON.stringify({
    status: unchanged ? 'pass' : 'changed-during-scan', node: process.version, project: projectDir,
    skills: snapshot.skills.length,
    scopes: Object.fromEntries(['user', 'project', 'system', 'plugin', 'cache'].map(scope => [scope, snapshot.skills.filter(skill => skill.scope === scope).length])),
    installedPlugins: snapshot.plugins.filter(plugin => plugin.installed).length,
    marketplaces: snapshot.marketplaces.length, cli: snapshot.cli,
    totalSnapshotMs: elapsed, snapshotReportedMs: snapshot.durationMs,
    detailRead: !!detail.content, duplicateNames: snapshot.skills.filter(skill => skill.duplicateNames?.length).map(skill => skill.name),
    diagnostics: snapshot.diagnostics,
    updateTargets: snapshot.updates?.length,
    updateRoutes: Object.fromEntries(['skill-source', 'plugin-reinstall', 'owner-managed', 'connect-source'].map(route => [route, snapshot.updates?.filter(item => item.route === route).length || 0])),
    scheduleEnabled: snapshot.schedule?.enabled,
    protectedFileCount: before.files, protectedBytesUnchanged: unchanged,
    mutationApiCalled: false,
    evidenceBoundary: 'Hash checks config and files in known user/project skill roots; symlink entries are hashed without traversing their targets. Plugin caches are read-only inputs, not asserted byte-for-byte.',
  }, null, 2));
  if (!unchanged) process.exitCode = 1;
} finally { await service?.close(); await fs.rm(stateDir, { recursive: true, force: true }); }
