import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveCodexCli } from '../server/codex-runtime.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock cli '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const app = path.join(root, 'Custom ChatGPT.app');
  const binary = path.join(app, 'Contents/Resources/codex');
  await fs.mkdir(path.dirname(binary), { recursive: true });
  await fs.writeFile(binary, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 1.0.0"; else echo "plugin list add remove marketplace"; fi\n', { mode: 0o755 });
  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  return { root, binary, bin, options: { home: root, codexHome: path.join(root, 'codex'), apps: [app], env: { PATH: bin } } };
}

test('a broken npm wrapper on PATH falls back to the desktop CLI and reports the exact path', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.bin, 'codex'), '#!/bin/sh\nexec /missing/node /missing/codex.js "$@"\n', { mode: 0o755 });
  const result = await resolveCodexCli(f.options);
  assert.equal(result.available, true); assert.equal(result.path, f.binary); assert.equal(result.source, 'codex-app');
  assert.equal(result.attempts[0].path, path.join(f.bin, 'codex'));
  assert.match(result.attempts[0].error, /退出码/);
});

test('an executable CLI without plugin support does not hide the working app CLI', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.bin, 'codex'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 0.1.0"; else echo "old commands: exec"; fi\n', { mode: 0o755 });
  const result = await resolveCodexCli(f.options);
  assert.equal(result.path, f.binary); assert.match(result.attempts[0].error, /不支持 plugin/);
});

test('a dangling PATH link is skipped and an invalid explicit override does not silently fall back', async t => {
  const f = await fixture(t); const broken = path.join(f.bin, 'codex');
  await fs.symlink(path.join(f.root, 'missing'), broken);
  assert.equal((await resolveCodexCli(f.options)).path, f.binary);
  const explicit = await resolveCodexCli({ ...f.options, explicit: broken });
  assert.equal(explicit.available, false); assert.equal(explicit.attempts.length, 1);
  assert.equal((await resolveCodexCli({ ...f.options, explicit: 'codex' })).available, false);
});

test('Codex-managed CLI is a fallback when the desktop application is unavailable', async t => {
  const f = await fixture(t); const managed = path.join(f.options.codexHome, 'plugins/.plugin-appserver/codex');
  await fs.mkdir(path.dirname(managed), { recursive: true }); await fs.copyFile(f.binary, managed);
  const result = await resolveCodexCli({ ...f.options, apps: [] });
  assert.equal(result.path, managed); assert.equal(result.source, 'codex-managed');
});
