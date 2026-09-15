import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveProject, parseLaunchArguments } from '../server/project-context.mjs';
import { createApp } from '../server/index.mjs';
import { createService } from '../server/service.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock project ')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'); const a = path.join(home, 'alpha'); const b = path.join(home, 'beta');
  const codexHome = path.join(home, '.codex'); const stateDir = path.join(root, 'state');
  for (const directory of [a, b, codexHome, stateDir]) await fs.mkdir(directory, { recursive: true });
  for (const [project, name] of [[a, 'alpha-skill'], [b, 'beta-skill']]) {
    const dir = path.join(project, '.agents/skills', name); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Project fixture.\n---\n`);
  }
  const adapter = { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) };
  return { root, a, b, options: { home, codexHome, projectDir: a, stateDir, adapter, scheduler: false } };
}

test('project precedence and symlink diagnostics preserve requested and effective paths', async t => {
  const { root, a, b, options } = await fixture(t);
  await fs.writeFile(path.join(options.stateDir, 'project.json'), JSON.stringify({ path: b }));
  const args = parseLaunchArguments(['start', '--project', a]); assert.equal(args.options.projectDir, a);
  assert.equal((await resolveProject({ ...options, env: { SKILLDOCK_PROJECT_DIR: b } })).effective, a);
  assert.equal((await resolveProject({ stateDir: options.stateDir, env: { SKILLDOCK_PROJECT_DIR: a } })).source, 'environment');
  assert.equal((await resolveProject({ stateDir: options.stateDir, env: {}, cwd: a })).effective, b);
  assert.equal((await resolveProject({ env: {}, cwd: a })).source, 'working-directory');
  const link = path.join(root, 'alias'); await fs.symlink(a, link);
  const linked = await resolveProject({ projectDir: link, env: {} });
  assert.equal(linked.requested, link); assert.equal(linked.effective, a); assert.equal(linked.warnings.length, 1);
  assert.throws(() => parseLaunchArguments(['start', '--project', 'relative']), { code: 'INVALID_PROJECT' });
});

test('project selection rescans only the selected project and survives a new service', async t => {
  const { a, b, options } = await fixture(t); const service = await createService(options);
  const before = await service.snapshot('local'); assert.ok(before.skills.some(item => item.name === 'alpha-skill'));
  await service.action({ mode: 'local', action: 'project.select', projectDir: b });
  const after = await service.snapshot('local');
  assert.equal(service.project, b); assert.equal(service.launchProject, a); assert.equal(after.paths.project, b);
  assert.ok(after.skills.some(item => item.name === 'beta-skill')); assert.ok(!after.skills.some(item => item.name === 'alpha-skill'));
  assert.equal(JSON.parse(await fs.readFile(path.join(options.stateDir, 'project.json'), 'utf8')).path, b);
  await service.close();
  const resumed = await createService({ ...options, projectDir: undefined }); t.after(() => resumed.close());
  assert.equal(resumed.project, b); assert.equal((await resumed.snapshot('local')).projectContext.source, 'saved');
});

test('invalid or blocked selections preserve the project, schedule and saved configuration', async t => {
  const { root, a, b, options } = await fixture(t); const service = await createService(options); t.after(() => service.close());
  const before = await service.snapshot('local');
  await assert.rejects(service.action({ mode: 'local', action: 'project.select', projectDir: 'relative' }), { code: 'INVALID_PROJECT' });
  await assert.rejects(service.action({ mode: 'local', action: 'project.select', projectDir: path.join(root, 'missing') }), { code: 'PROJECT_UNAVAILABLE' });
  const file = path.join(root, 'file'); await fs.writeFile(file, 'not a folder');
  await assert.rejects(service.action({ mode: 'local', action: 'project.select', projectDir: file }), { code: 'PROJECT_UNAVAILABLE' });
  assert.equal(service.pauseForRestart(), true);
  await assert.rejects(service.action({ mode: 'local', action: 'project.select', projectDir: b }), { code: 'APP_RESTARTING' });
  service.resumeAfterRestart();
  assert.equal(service.project, a); assert.deepEqual((await service.snapshot('local')).schedule, before.schedule);
  await assert.rejects(fs.stat(path.join(options.stateDir, 'project.json')), { code: 'ENOENT' });
});

test('project switching requires an API token and health reports the actual scan root', async t => {
  const { a, b, options } = await fixture(t); const app = await createApp(options); t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'local', action: 'project.select', projectDir: b }) };
  assert.equal((await fetch(url + '/api/actions', request)).status, 403); assert.equal(app.service.project, a);
  const session = await (await fetch(url + '/api/session')).json();
  assert.equal((await fetch(url + '/api/actions', { ...request, headers: { ...request.headers, 'X-SkillDock-Token': session.token } })).status, 200);
  const invalid = await fetch(url + '/api/actions', { ...request, headers: { ...request.headers, 'X-SkillDock-Token': session.token }, body: JSON.stringify({ mode: 'local', action: 'project.select', projectDir: path.join(options.stateDir, 'absent') }) });
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).error.code, 'PROJECT_UNAVAILABLE');
  const health = await (await fetch(url + '/api/health')).json();
  assert.equal(health.project, b); assert.equal(health.launchProject, a); assert.equal(health.projectContext.effective, b);
});
