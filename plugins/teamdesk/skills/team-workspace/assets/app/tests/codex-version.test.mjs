import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSupportedCodexVersion } from '../src/shared-connection.mjs';

test('minimum Codex version accepts current prereleases and newer patch, minor and major releases', () => {
  for (const version of ['0.155.0-alpha.9.2', '0.155.0', '0.155.1', '0.156.0-alpha.1', '0.156.0', '0.200.0', '1.0.0', '2.0.0-rc.1+build.5']) {
    assert.doesNotThrow(() => requireSupportedCodexVersion('codex-cli ' + version), version);
  }
  assert.doesNotThrow(() => requireSupportedCodexVersion('codex-cli 0.155.0\n'));
});

test('older Codex release lines are rejected numerically, regardless of patch or suffix', () => {
  for (const version of ['0.0.0', '0.99.999', '0.154.999999', '0.154.0-alpha.999', '0.154.0+build.999']) {
    assert.throws(() => requireSupportedCodexVersion('codex-cli ' + version), { code: 'unsupported_codex', status: 409 }, version);
  }
});

test('unrecognized Codex output is distinct from an old version and is never treated as supported', () => {
  for (const version of ['', null, undefined, '0.156.0', 'codex-cli dev', 'codex-cli 0.155', 'codex-cli 0.155.x', 'codex-cli 00.155.0', 'codex-cli 0.155.0 trailing', 'codex-cli 0.155.0\ncodex-cli 0.156.0', 'codex-cli 0.155.0-', 'codex-cli 0.155.0+']) {
    assert.throws(() => requireSupportedCodexVersion(version), { code: 'unrecognized_codex_version', status: 409 }, String(version));
  }
});
