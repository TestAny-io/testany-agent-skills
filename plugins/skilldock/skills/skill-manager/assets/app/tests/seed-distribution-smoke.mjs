// Opt-in: actual Codex installation in a temporary configuration, never the user's installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';

const skill = fileURLToPath(new URL('../../../', import.meta.url));
const repository = path.resolve(skill, '../../../..');
const manifest = JSON.parse(await fs.readFile(path.join(repository, 'plugins/skilldock/.codex-plugin/plugin.json'), 'utf8'));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-standalone-install-'));
const codexHome = path.join(fixture, 'codex'); const bin = path.join(fixture, 'broken-bin');
await fs.mkdir(codexHome); await fs.mkdir(bin);
await fs.writeFile(path.join(bin, 'codex'), '#!/bin/sh\nexec /missing/old-node /missing/old-codex.js "$@"\n', { mode: 0o755 });
const env = { ...process.env, CODEX_HOME: codexHome, SKILLDOCK_CODEX_BIN: '',
  PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin` };
let result;
try {
  const resolved = await runProcess('/bin/sh', [path.join(skill, 'scripts/launch.sh'), 'cli', '--print-path'], { env, cwd: fixture, timeout: 45000 });
  const cli = resolved.stdout.trim(); assert.ok(path.isAbsolute(cli)); assert.notEqual(cli, path.join(bin, 'codex'));
  const command = async args => JSON.parse((await runProcess(cli, args, { env, cwd: fixture, timeout: 90000 })).stdout);
  const marketplace = await command(['plugin', 'marketplace', 'add', repository, '--json']);
  const installed = await command(['plugin', 'add', 'skilldock@testany-agent-skills', '--json']);
  assert.equal(installed.version, manifest.version);
  const list = await command(['plugin', 'list', '--marketplace', 'testany-agent-skills', '--json']);
  assert.equal(list.installed.length, 1); assert.equal(list.installed[0].name, 'skilldock'); assert.equal(list.installed[0].enabled, true);
  const installedSkills = await fs.readdir(path.join(installed.installedPath, 'skills'));
  assert.deepEqual(installedSkills, ['skill-manager']);
  const installedSkill = path.join(installed.installedPath, 'skills/skill-manager');
  const excluded = new Set(['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report']);
  let files = 0;
  async function compare(directory, relative = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) await compare(path.join(directory, entry.name), next);
      else if (entry.isFile()) {
        assert.deepEqual(await fs.readFile(path.join(installedSkill, next)), await fs.readFile(path.join(skill, next)), next);
        assert.equal((await fs.stat(path.join(installedSkill, next))).mode & 0o111, (await fs.stat(path.join(skill, next))).mode & 0o111, next);
        files++;
      }
    }
  }
  await compare(skill);
  const doctor = JSON.parse((await runProcess('/bin/sh', [path.join(installedSkill, 'scripts/launch.sh'), 'doctor', '--project', fixture], {
    env: { ...env, SKILLDOCK_STATE_DIR: path.join(fixture, 'state') }, cwd: fixture, timeout: 45000,
  })).stdout);
  assert.equal(doctor.cli.path, cli); assert.equal(doctor.project.effective, await fs.realpath(fixture));
  assert.equal(await fs.stat(path.join(fixture, 'state')).catch(() => null), null);
  result = { passed: true, fixture, cli, marketplace, installed, installedSkills, matchedFiles: files, doctor };
} catch (error) { result = { passed: false, fixture, error: error.stack }; process.exitCode = 1; }
await fs.writeFile(path.join(fixture, 'result.json'), JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
