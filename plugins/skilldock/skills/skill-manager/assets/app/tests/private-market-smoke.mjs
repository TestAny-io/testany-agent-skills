// Opt-in: verify the real Codex CLI with a temporary authenticated Git server and Codex home.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { privateGit } from './helpers/private-git.mjs';
import { CodexAdapter } from '../server/cli.mjs';
import { createService } from '../server/service.mjs';

const cleanups = [];
let service;
try {
  const f = await privateGit({ after: callback => cleanups.push(callback) });
  const prior = new Map(Object.keys(f.env).map(key => [key, process.env[key]]));
  Object.assign(process.env, f.env);
  cleanups.push(() => { for (const [key, value] of prior) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const home = path.join(f.root, 'home'); const project = path.join(home, 'project'); const codexHome = path.join(home, '.codex');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(codexHome);
  const adapter = new CodexAdapter({ codexHome, codexBin: process.env.SKILLDOCK_CODEX_BIN, env: f.env });
  const cli = await adapter.probe(); assert.equal(cli.available, true, cli.error);
  service = await createService({ home, projectDir: project, codexHome, stateDir: path.join(f.root, 'state'), adapter, scheduler: false });
  const act = (action, fields = {}) => service.action({ mode: 'local', action, ...fields });
  await act('marketplace.add', { sourceType: 'git', source: f.source, ref: 'main' });
  const id = 'private-tools@private-fixture'; await act('plugin.install', { id });
  let state = await service.snapshot('local'); assert.equal(state.plugins.find(item => item.id === id && item.installed)?.version, '1.0.0');
  await f.commit();
  const result = await act('update.check', { target: { kind: 'plugin', id } });
  if (result.updateItem?.status === 'available') await act('update.apply', { target: { kind: 'plugin', id }, previewId: result.updateItem.previewId });
  state = await service.snapshot('local'); const plugin = state.plugins.find(item => item.id === id && item.installed);
  assert.equal(plugin?.version, '2.0.0');
  const skill = state.skills.find(item => item.pluginId === id); assert.ok(skill); assert.match(await fs.readFile(skill.path, 'utf8'), /Revision 2/);
  assert.ok(!JSON.stringify(state).includes(f.password));
  console.log(JSON.stringify({ passed: true, cli: cli.version, privateMarketplace: true, pluginVersion: plugin.version, bundledSkillUpdated: true, authenticatedGitRequests: f.access.authenticated }, null, 2));
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await service?.close(); for (const cleanup of cleanups.reverse()) await cleanup(); }
