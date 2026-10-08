// SPDX-License-Identifier: AGPL-3.0-only
// Rules shared by 0.10.3's transfer chain and 0.11's ownership checks (API-SDX-001 36a §9, 36b §4.4, §5.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeGitSource, codexMarketplaceEntry, codexSourceKey, claudeSourceKey, agentRoots, compareVersions, parseVersion } from '../server/installs.mjs';
import { validProject } from '../server/project-context.mjs';

async function temp(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-installs-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('source identifiers normalise equivalent Git forms and reject unverifiable ones (36a §9)', () => {
  const key = 'github.com/testany-io/testany-agent-skills';
  for (const value of ['https://github.com/TestAny-io/testany-agent-skills.git', 'https://user:secret@GitHub.com/TestAny-io/testany-agent-skills/',
    'ssh://git@github.com:22/TestAny-io/testany-agent-skills.git', 'git@github.com:TestAny-io/testany-agent-skills.git']) assert.equal(normalizeGitSource(value), key, value);
  assert.equal(normalizeGitSource('https://gitlab.example/Org/Repo.git'), 'gitlab.example/Org/Repo');
  for (const value of ['', '/local/path', 'file:///tmp/x', 'git://github.com/o/r', 'C:/repo', 'https://github.com/a/../b', 'https://github.com/a b', 'git@github.com:/abs',
    'https://github.com/o/r?x=1', 'https://github.com/o/r#main', 'https://github.com/o/r%2Fx']) assert.equal(normalizeGitSource(value), null, value);
  assert.equal(claudeSourceKey({ source: 'github', repo: 'TestAny-io/testany-agent-skills' }), key);
  assert.equal(claudeSourceKey({ source: 'git', url: 'https://github.com/TestAny-io/testany-agent-skills.git' }), key);
  for (const source of [{ source: 'directory', path: '/x' }, { source: 'url', url: 'https://x/marketplace.json' }, null]) assert.equal(claudeSourceKey(source), null);
  assert.equal(codexSourceKey({ source_type: 'local', source: '/x' }), null);
});

test('Codex marketplace reader only reads source keys of the named table', () => {
  const text = '[x]\nsource = "no"\n[ marketplaces . "m" ]\nlast_updated = "t"\nsource_type = "git" # c\nsource = \'https://github.com/o/r\'\n[marketplaces.other]\nsource_type = "git"\nsource = "https://github.com/o/fork"\n';
  assert.deepEqual(codexMarketplaceEntry(text, 'm'), { source_type: 'git', source: 'https://github.com/o/r' });
  assert.equal(codexSourceKey(codexMarketplaceEntry(text, 'other')), 'github.com/o/fork');
  assert.deepEqual(codexMarketplaceEntry(text, 'absent'), {});
});

test('versions compare numerically and reject pre-releases', () => {
  assert.equal(compareVersions(parseVersion('0.11.0'), parseVersion('0.10.12')), 1);
  assert.equal(parseVersion('0.11.0-beta.1'), null);
});

test('valid projects exclude the data directory, missing paths and files (36b §4.4)', async t => {
  const root = await temp(t); const state = path.join(root, 'state'); const project = path.join(root, 'project');
  await fs.mkdir(path.join(state, 'compat/legacy-project'), { recursive: true }); await fs.mkdir(project);
  await fs.writeFile(path.join(root, 'file'), 'x');
  assert.equal(await validProject(project, state), project);
  for (const value of [state, path.join(state, 'compat/legacy-project'), path.join(root, 'missing'), path.join(root, 'file'), 'relative', undefined]) assert.equal(await validProject(value, state), null, String(value));
});

test('roots include the saved Claude root, session variables and paths derived from the record (36b §5.1)', async t => {
  const root = await temp(t); const home = path.join(root, 'home');
  const record = { running: { agent: 'codex', appPath: path.join(root, 'alt-codex/plugins/cache/m/skilldock/0.11.0/skills/skill-manager/assets/app') },
    preferred: { agent: 'claude', appPath: path.join(root, 'elsewhere/m/skilldock/abc/skills/skill-manager/assets/app') } };
  const claudeRoot = { configDir: path.join(root, 'custom'), pluginCacheDir: path.join(root, 'custom/plugins/cache') };
  const roots = await agentRoots({ env: { CLAUDE_CONFIG_DIR: path.join(root, 'session') }, home, claudeRoot, record });
  const caches = roots.caches.map(item => [item.agent, item.cacheDir, item.configDir ?? null]);
  assert.deepEqual(caches, [
    ['codex', path.join(home, '.codex/plugins/cache'), null],
    ['codex', path.join(root, 'alt-codex/plugins/cache'), null],
    ['claude', path.join(root, 'custom/plugins/cache'), path.join(root, 'custom')],
    ['claude', path.join(root, 'session/plugins/cache'), path.join(root, 'session')],
    ['claude', path.join(home, '.claude/plugins/cache'), path.join(home, '.claude')],
    ['claude', path.join(root, 'elsewhere'), null],
  ]);
});
