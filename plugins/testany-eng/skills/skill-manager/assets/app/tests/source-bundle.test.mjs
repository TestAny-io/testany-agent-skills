import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { captureSource, materializeRuntime, stageBuild, publishSource, ROOT_FILES } from '../scripts/source-bundle.mjs';

const execute = promisify(execFile);
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-source-test-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); const app = path.join(source, 'assets/app');
  for (const dir of ['src', 'server', 'shared', 'scripts', 'tests']) await fs.mkdir(path.join(app, dir), { recursive: true });
  await fs.mkdir(path.join(source, 'scripts'));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'playwright.config.ts']) await fs.writeFile(path.join(app, name), `${name} fixture\n`);
  for (const name of ROOT_FILES) await fs.copyFile(fileURLToPath(new URL(`../../../${name}`, import.meta.url)), path.join(source, name));
  await fs.copyFile(fileURLToPath(new URL('../scripts/source-bundle.mjs', import.meta.url)), path.join(app, 'scripts/source-bundle.mjs'));
  await fs.writeFile(path.join(app, 'server/index.mjs'), 'export const runningVersion = "fixture-original";\n');
  await fs.writeFile(path.join(app, 'src/main.tsx'), 'export const view = "source";\n');
  return { root, source, app };
}
async function extract(archive, destination) {
  await fs.mkdir(destination);
  await execute('tar', ['-xzf', archive, '-C', destination]);
  return path.join(destination, 'skilldock');
}

test('source archive is standard tar.gz, deterministic, includes legal/build source and excludes user or generated state', async t => {
  const { root, source, app } = await fixture(t);
  for (const dir of ['node_modules', '.state', '.git', 'dist']) { await fs.mkdir(path.join(app, dir)); await fs.writeFile(path.join(app, dir, 'PRIVATE_SENTINEL'), 'never distribute'); }
  await fs.mkdir(path.join(source, 'references')); await fs.writeFile(path.join(source, 'references/private-smoke.md'), 'private user paths');
  await stageBuild(app); await publishSource(app);
  const file = path.join(app, 'dist/skilldock-source.tar.gz'); const original = await fs.readFile(file);
  await stageBuild(app); await publishSource(app); assert.deepEqual(await fs.readFile(file), original);
  const extracted = await extract(file, path.join(root, 'extracted'));
  for (const name of [...ROOT_FILES, 'assets/app/package-lock.json', 'assets/app/server/index.mjs', 'assets/app/scripts/source-bundle.mjs']) assert.deepEqual(await fs.readFile(path.join(extracted, name)), await fs.readFile(path.join(source, name)));
  assert.deepEqual(await fs.readFile(path.join(app, 'dist/LICENSE.txt')), await fs.readFile(path.join(source, 'LICENSE')));
  const listing = (await execute('tar', ['-tzf', file])).stdout;
  assert.ok(!/PRIVATE_SENTINEL|references|node_modules|\.state|\.git|\/dist\//.test(listing));
  const manifest = JSON.parse(await fs.readFile(path.join(extracted, 'SOURCE_MANIFEST.json'), 'utf8'));
  assert.ok(manifest.files.every(entry => !path.isAbsolute(entry.path) && !entry.path.includes('..')));
});

test('source capture rejects links in source files, source directories and required licenses', async t => {
  const { root, source, app } = await fixture(t); const outside = path.join(root, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'secret'), 'PRIVATE');
  const link = path.join(app, 'src/escape'); await fs.symlink(outside, link);
  await assert.rejects(captureSource(app), /符号链接/); await fs.unlink(link);
  await fs.symlink(path.join(outside, 'secret'), link); await assert.rejects(captureSource(app), /符号链接/); await fs.unlink(link);
  await fs.unlink(path.join(source, 'LICENSE')); await fs.symlink(path.join(outside, 'secret'), path.join(source, 'LICENSE'));
  await assert.rejects(captureSource(app), /符号链接/);
});

test('runtime code and downloadable source come from the same captured bytes even if checkout changes', async t => {
  const { root, source, app } = await fixture(t); const snapshot = await captureSource(app);
  const entry = snapshot.entries.find(item => item.path === 'assets/app/server/index.mjs');
  await fs.writeFile(path.join(app, 'server/index.mjs'), 'export const runningVersion = "later-checkout";\n');
  await fs.appendFile(path.join(source, 'scripts/launch.mjs'), '\n// later launcher\n');
  const runtime = path.join(root, 'runtime'); await materializeRuntime(snapshot, runtime);
  await stageBuild(runtime); const result = await publishSource(runtime);
  assert.equal(result.sourceDigest, snapshot.sourceDigest);
  const extracted = await extract(path.join(runtime, 'dist/skilldock-source.tar.gz'), path.join(root, 'extracted'));
  assert.deepEqual(await fs.readFile(path.join(runtime, 'server/index.mjs')), entry.bytes);
  assert.deepEqual(await fs.readFile(path.join(extracted, 'assets/app/server/index.mjs')), entry.bytes);
  assert.deepEqual(await fs.readFile(path.join(extracted, 'scripts/launch.mjs')), snapshot.entries.find(item => item.path === 'scripts/launch.mjs').bytes);
  await fs.appendFile(path.join(runtime, 'server/index.mjs'), '\n// changed runtime\n');
  await assert.rejects(publishSource(runtime), /构建过程中发生变化/);
});

test('development build refuses source changed after staging and corrupted archives', async t => {
  const { app } = await fixture(t); await stageBuild(app);
  await fs.appendFile(path.join(app, 'src/main.tsx'), '// edit during build\n');
  await assert.rejects(publishSource(app), /构建过程中发生变化/);
  await stageBuild(app); await fs.appendFile(path.join(app, '.source-snapshot/skilldock-source.tar.gz'), 'corrupt');
  await assert.rejects(publishSource(app), /与快照不一致/);
});
