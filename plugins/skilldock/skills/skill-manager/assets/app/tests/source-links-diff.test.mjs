import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { githubDirectory, resolveGithubDirectory } from '../server/git-source.mjs';
import { checkoutGit, runProcess } from '../server/cli.mjs';
import { createService } from '../server/service.mjs';
import { diffFiles, inspectTree } from '../server/files.mjs';
import { previewFileDiff } from '../server/preview-diff.mjs';

const url = 'https://github.com/TestAny-io/testany-agent-skills/tree/main/plugins/testany-llm/skills/prompt-optimizer';
test('GitHub directory URLs resolve branch/tag paths, slash refs, encoded directories and explicit versions', () => {
  const location = githubDirectory(url); assert.equal(location.source, 'https://github.com/TestAny-io/testany-agent-skills.git');
  const refs = ['refs/remotes/origin/main', 'refs/remotes/origin/feature/new-ui', 'refs/tags/release/2026'];
  assert.deepEqual(resolveGithubDirectory(location, undefined, refs), { ref: 'main', subpath: 'plugins/testany-llm/skills/prompt-optimizer' });
  assert.equal(resolveGithubDirectory(location, 'release/2026', refs).ref, 'release/2026');
  const slash = githubDirectory('https://github.com/team/repo/tree/feature/new-ui/skills/日本語%20skill');
  assert.deepEqual(resolveGithubDirectory(slash, undefined, refs), { ref: 'feature/new-ui', subpath: 'skills/日本語 skill' });
  assert.equal(resolveGithubDirectory(githubDirectory('https://github.com/team/repo/tree/release%2F2026/a'), undefined, refs).ref, 'release/2026');
  assert.deepEqual(resolveGithubDirectory(githubDirectory('https://github.com/team/repo/tree/abcdef123/a#readme'), undefined, []), { ref: 'abcdef123', subpath: 'a' });
  assert.equal(githubDirectory('git@github.com:team/repo.git'), null);
  assert.equal(githubDirectory('https://github.com/team/repo.git'), null);
  for (const bad of ['https://github.com/team/repo/blob/main/SKILL.md', 'https://github.com/team/repo/tree', 'https://x:secret@github.com/team/repo/tree/main/a', 'https://github.com/team/repo/tree/main/a%5Cb', 'https://github.com/team/repo/tree/main/%FF']) assert.throws(() => githubDirectory(bad), { code: 'INVALID_GITHUB_URL' });
  assert.throws(() => resolveGithubDirectory(githubDirectory('https://github.com/team/repo/tree/missing/a'), undefined, refs), { code: 'GITHUB_REF_NOT_FOUND' });
});

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-diff-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const before = path.join(root, 'before'); const after = path.join(root, 'after');
  await fs.mkdir(before); await fs.mkdir(after);
  return { root, before, after };
}

test('actual Git checkout resolves non-default branches with slashes and an explicit tag override', async t => {
  const { root } = await fixture(t); const repo = path.join(root, 'repository'); await fs.mkdir(repo);
  const git = args => runProcess('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', repo, ...args]);
  await git(['init', '-b', 'main']); await fs.writeFile(path.join(repo, 'file'), 'main'); await git(['add', '.']); await git(['commit', '-m', 'main']); await git(['tag', 'release/one']);
  await git(['checkout', '-b', 'feature/new-ui']); await fs.writeFile(path.join(repo, 'file'), 'feature'); await git(['add', '.']); await git(['commit', '-m', 'feature']);
  const featureCommit = (await git(['rev-parse', 'HEAD'])).stdout.trim(); await git(['checkout', 'main']);
  const location = githubDirectory('https://github.com/team/repo/tree/feature/new-ui/skills/tool'); let selected;
  assert.equal(await checkoutGit(repo, undefined, path.join(root, 'clone'), { githubDirectory: location, onLocation: value => { selected = value; } }), featureCommit);
  assert.deepEqual(selected, { ref: 'feature/new-ui', subpath: 'skills/tool' });
  await checkoutGit(repo, 'release/one', path.join(root, 'tag'), { githubDirectory: location });
  assert.equal(await fs.readFile(path.join(root, 'tag/file'), 'utf8'), 'main');
  assert.equal(await checkoutGit(repo, 'feature/new-ui', path.join(root, 'legacy-ref')), featureCommit);
});

test('line diff preserves added/removed files, Unicode, HTML text, line numbers and missing EOF newline', async t => {
  const { before, after } = await fixture(t);
  await fs.writeFile(path.join(before, 'modified.md'), 'unchanged\n旧版\nlast');
  await fs.writeFile(path.join(after, 'modified.md'), 'unchanged\n新版\n<script>alert(1)</script>\nlast\n');
  await fs.writeFile(path.join(before, 'removed.md'), 'removed\n'); await fs.writeFile(path.join(after, 'added.md'), 'added\n');
  const a = await inspectTree(before); const b = await inspectTree(after);
  const result = await Promise.all(diffFiles(a.entries, b.entries).map(change => previewFileDiff(a, b, change)));
  const diff = result.find(item => item.path === 'modified.md'); const lines = diff.hunks.flatMap(hunk => hunk.lines);
  assert.ok(lines.some(line => line.kind === 'removed' && line.content === '旧版' && line.oldLine === 2));
  assert.ok(lines.some(line => line.kind === 'added' && line.content === '新版' && line.newLine === 2));
  assert.ok(lines.some(line => line.content === '<script>alert(1)</script>'));
  assert.ok(lines.some(line => line.kind === 'note'));
  assert.equal(result.find(item => item.type === 'added').additions, 1);
  assert.equal(result.find(item => item.type === 'removed').deletions, 1);
});

test('diff marks binary, oversized and symbolic-link content, bounds output and rejects changed files', async t => {
  const { before, after } = await fixture(t);
  await fs.writeFile(path.join(after, 'binary'), Buffer.from([0, 255, 1]));
  await fs.writeFile(path.join(after, 'large'), 'x'.repeat(300 * 1024));
  await fs.writeFile(path.join(after, 'many-lines'), Array.from({ length: 2500 }, (_, index) => `line ${index}\n`).join(''));
  await fs.symlink('binary', path.join(after, 'link'));
  const a = await inspectTree(before); const b = await inspectTree(after);
  const check = file => previewFileDiff(a, b, { path: file, type: 'added' });
  assert.equal((await check('binary')).status, 'binary'); assert.equal((await check('large')).status, 'too-large');
  assert.equal((await check('link')).status, 'symlink');
  const many = await check('many-lines'); assert.equal(many.truncated, true); assert.equal(many.hunks.flatMap(hunk => hunk.lines).length, 2000);
  await fs.writeFile(path.join(after, 'many-lines'), 'changed'); await assert.rejects(check('many-lines'), { code: 'DIFF_CHANGED' });
});

test('preview diff is read-only, limited to approved changed files and invalidated by edits or consumed previews', async t => {
  const { root } = await fixture(t); const home = path.join(root, 'home'); const project = path.join(root, 'project');
  await fs.mkdir(home); await fs.mkdir(project);
  const service = await createService({ home, projectDir: project, codexHome: path.join(home, '.codex'), stateDir: path.join(root, 'state'), enableTestSandbox: true, scheduler: false, adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  t.after(() => service.close());
  const action = request => service.action({ mode: 'sandbox', ...request });
  const initial = await service.snapshot('sandbox'); const skill = initial.skills.find(item => item.name === 'writing-assistant');
  const checked = (await action({ action: 'skill.checkUpdate', id: skill.id })).update;
  const request = { action: 'preview.diff', previewId: checked.id, path: checked.changes[0].path };
  const before = (await inspectTree(path.dirname(skill.path))).fingerprint;
  assert.equal((await action(request)).diff.status, 'text');
  assert.equal((await inspectTree(path.dirname(skill.path))).fingerprint, before);
  assert.deepEqual((await service.snapshot('sandbox')).activity, initial.activity);
  await assert.rejects(action({ ...request, path: '../../secret' }), { code: 'INVALID_DIFF_PATH' });
  await assert.rejects(action({ ...request, path: 'unlisted' }), { code: 'DIFF_FILE_NOT_FOUND' });
  await assert.rejects(service.action({ ...request, mode: 'local' }), { code: 'STALE_PREVIEW' });
  await action({ action: 'skill.update', id: skill.id, previewId: checked.id });
  await assert.rejects(action(request), { code: 'STALE_PREVIEW' });
  const source = (await action({ action: 'skill.previewSource', id: skill.id, sourceType: 'local', source: initial.examples.legacySource })).sourcePreview;
  await fs.appendFile(skill.path, '\nLocal edit');
  await assert.rejects(action({ ...request, previewId: source.id }), { code: 'LOCAL_CHANGES' });
});
