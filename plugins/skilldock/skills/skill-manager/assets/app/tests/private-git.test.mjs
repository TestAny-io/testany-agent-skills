import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { privateGit, quote } from './helpers/private-git.mjs';
import { checkoutGit, CodexAdapter } from '../server/cli.mjs';
import { gitAccessError } from '../server/git-access.mjs';
import { createService, validateAction } from '../server/service.mjs';
import { AppError, inspectTree, publicSource } from '../server/files.mjs';
import { githubDirectory } from '../server/git-source.mjs';

function environment(t, env) {
  const prior = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  t.after(() => { for (const [key, value] of prior) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
}

test('HTTPS challenge uses the configured credential helper, CA and URL rewrite, without materialization hooks or filters', async t => {
  const f = await privateGit(t); const marker = path.join(f.root, 'unexpected-execution'); const script = path.join(f.root, 'unsafe-filter.mjs');
  await fs.writeFile(script, `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'executed');process.stdin.pipe(process.stdout);`);
  const template = path.join(f.root, 'template'); await fs.mkdir(path.join(template, 'hooks'), { recursive: true });
  const command = `${quote(process.execPath)} ${quote(script)}`;
  await fs.writeFile(path.join(template, 'config'), `[filter "fixture"]\n smudge = ${JSON.stringify(command)}\n`);
  await fs.writeFile(path.join(template, 'hooks/post-checkout'), `#!/bin/sh\n${command}\n`, { mode: 0o700 });
  await fs.appendFile(f.config, `[init]\n templateDir = ${JSON.stringify(template)}\n[core]\n hooksPath = ${JSON.stringify(path.join(template, 'hooks'))}\n[filter "fixture"]\n smudge = ${JSON.stringify(command)}\n required = true\n[clone]\n defaultRemoteName = unexpected\n`);
  const destination = path.join(f.root, 'download'); let location;
  const commit = await checkoutGit(f.source, undefined, destination, { env: f.env,
    githubDirectory: githubDirectory('https://github.com/example/private/tree/main/skills/private-notes'), onLocation: value => { location = value; } });
  assert.equal(commit, f.first); assert.deepEqual(location, { ref: 'main', subpath: 'skills/private-notes' });
  assert.match(await fs.readFile(path.join(destination, 'skills/private-notes/SKILL.md'), 'utf8'), /Revision 1/);
  await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  assert.ok(f.access.challenged > 0 && f.access.authenticated > 0);
  const helperCalls = (await fs.readFile(f.helperLog, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(helperCalls.some(call => call.action === 'get' && call.prompt === '0'));
  assert.ok(!(await fs.readFile(path.join(destination, '.git/config'), 'utf8')).includes(f.password));
});

test('missing HTTPS credentials produce actionable authentication errors and do not invoke askpass', async t => {
  const f = await privateGit(t); await fs.writeFile(f.config, f.authConfig.replace(/ helper = .*\n/g, ' helper = \n'));
  const marker = path.join(f.root, 'askpass-ran'); const askpass = path.join(f.root, 'askpass.sh');
  await fs.writeFile(askpass, `#!/bin/sh\ntouch ${quote(marker)}\n`, { mode: 0o700 });
  await assert.rejects(checkoutGit(f.source, undefined, path.join(f.root, 'download'), { env: { ...f.env, GIT_ASKPASS: askpass, SSH_ASKPASS: askpass } }), { code: 'GIT_AUTH_REQUIRED' });
  await assert.rejects(fs.access(marker), { code: 'ENOENT' }); assert.equal(f.access.authenticated, 0);
});

test('global URL rewrites cannot opt a remote source into a file or executable transport', async t => {
  const f = await privateGit(t);
  for (const target of [`file://${f.bare}`, 'ext::echo SHOULD_NOT_EXECUTE']) {
    await fs.writeFile(f.config, `[protocol "file"]\n allow = always\n[protocol "ext"]\n allow = always\n[url ${JSON.stringify(target)}]\n insteadOf = ${f.source}\n`);
    await assert.rejects(checkoutGit(f.source, undefined, path.join(f.root, `blocked-${target.startsWith('file')}`), { env: f.env }), error => error.code === 'CLI_FAILED' && /not allowed/.test(error.message));
  }
});

test('SSH transport receives the configured command and agent, and host/auth failures have separate messages', async t => {
  const sshSource = 'ssh://git@github.com/team/private.git';
  assert.equal(validateAction({ mode: 'local', action: 'skill.previewInstall', sourceType: 'git', source: sshSource }).source, sshSource);
  assert.equal(publicSource(sshSource), sshSource, 'SSH account is required for a usable source prefill');
  assert.equal(publicSource('ssh://git:secret@github.com/team/private.git?token=hidden'), sshSource);
  assert.equal(publicSource('https://user:secret@example.invalid/private.git'), 'https://example.invalid/private.git');
  const f = await privateGit(t); const transport = path.join(f.root, 'ssh.mjs'); const marker = path.join(f.root, 'ssh-environment.json');
  await fs.writeFile(transport, `import fs from 'node:fs';import {spawn} from 'node:child_process';
fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({agent:process.env.SSH_AUTH_SOCK,askpass:process.env.SSH_ASKPASS_REQUIRE}));
const child=spawn('git',['upload-pack',${JSON.stringify(f.bare)}],{stdio:'inherit'});child.once('close',code=>process.exit(code||0));`);
  await fs.writeFile(f.config, `[core]\n sshCommand = ${JSON.stringify(`${quote(process.execPath)} ${quote(transport)}`)}\n`);
  await checkoutGit('git@private.invalid:team/private.git', undefined, path.join(f.root, 'ssh-download'), { env: { ...f.env, SSH_AUTH_SOCK: '/fixture/agent.sock', GIT_SSH_VARIANT: 'ssh' } });
  assert.deepEqual(JSON.parse(await fs.readFile(marker, 'utf8')), { agent: '/fixture/agent.sock', askpass: 'never' });
  for (const [message, code] of [['Permission denied (publickey).', 'GIT_AUTH_REQUIRED'], ['Host key verification failed.', 'GIT_HOST_UNVERIFIED'], ["fatal: repository 'https://example.invalid/private.git/' not found", 'GIT_REPOSITORY_UNAVAILABLE']]) {
    const error = gitAccessError(new AppError(502, 'CLI_FAILED', message + ' password=fixture-secret'));
    assert.equal(error.code, code); assert.ok(!error.message.includes('fixture-secret'));
  }
  const timeout = new AppError(504, 'CLI_TIMEOUT', 'unknown outcome'); assert.equal(gitAccessError(timeout), timeout);
});

test('private skill installation, source association, scheduled auth failure and retry preserve files and source metadata', async t => {
  const f = await privateGit(t); environment(t, f.env);
  const home = path.join(f.root, 'home'); const project = path.join(home, 'project'); const codexHome = path.join(home, '.codex');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(codexHome);
  let time = Date.now(); const service = await createService({ home, projectDir: project, codexHome, stateDir: path.join(f.root, 'state'), scheduler: false, now: () => time,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  t.after(() => service.close());
  const act = (action, fields = {}) => service.action({ mode: 'local', action, ...fields });
  const preview = (await act('skill.previewInstall', { sourceType: 'git', source: f.source, subpath: 'skills/private-notes' })).preview;
  await act('skill.install', { previewId: preview.id });
  let skill = (await service.snapshot('local')).skills.find(item => item.name === 'private-notes');
  const target = { kind: 'skill', id: skill.id }; assert.equal(skill.sourceInfo.commit, f.first);
  const sourcePreview = (await act('skill.previewSource', { id: skill.id, sourceType: 'git', source: f.source, subpath: 'skills/private-notes', ref: 'main' })).sourcePreview;
  await act('skill.connectSource', { id: skill.id, previewId: sourcePreview.id });
  await act('schedule.configure', { schedule: { enabled: true, autoApply: true, intervalMinutes: 15, timezone: 'UTC', targets: [target] } });
  const before = await inspectTree(path.dirname(skill.path)); const newest = await f.commit(); f.access.enabled = false;
  time += 16 * 60000; await service.tickScheduler(); let state = await service.snapshot('local');
  assert.equal(state.updateRuns[0].items[0].reasonCode, 'GIT_AUTH_REQUIRED');
  assert.equal((await inspectTree(path.dirname(skill.path))).fingerprint, before.fingerprint);
  f.access.enabled = true; time += 16 * 60000; await service.tickScheduler(); state = await service.snapshot('local');
  assert.equal(state.updateRuns[0].items[0].status, 'updated'); skill = state.skills.find(item => item.id === skill.id);
  assert.equal(skill.sourceInfo.commit, newest); assert.equal(skill.sourceInfo.source, f.source);
  assert.match(await fs.readFile(skill.path, 'utf8'), /Revision 2/);
  assert.ok(!JSON.stringify(state).includes(f.password));
  const persisted = await fs.readFile(service.environments.local.registryFile, 'utf8'); assert.ok(!persisted.includes(f.password));
});

test('Codex adapter preserves Git authentication configuration for its marketplace commands', async t => {
  const f = await privateGit(t); const binary = path.join(f.root, 'codex-fixture.mjs');
  await fs.writeFile(binary, `#!${process.execPath}\nimport {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args[0]==='--version') console.log('codex-cli fixture');
else if(args.includes('--help')) console.log('list add remove marketplace');
else {const result=spawnSync('git',['clone','--no-checkout','--template=',args[3],${JSON.stringify(path.join(f.root, 'codex-source'))}],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(result.status);}console.log(JSON.stringify({ok:true}));}`,
  { mode: 0o700 });
  const adapter = new CodexAdapter({ codexHome: path.join(f.root, 'codex'), codexBin: binary, env: f.env });
  assert.deepEqual(await adapter.command(['plugin', 'marketplace', 'add', f.source, '--json'], { mutation: true }), { ok: true });
  assert.ok(f.access.authenticated > 0);
});
