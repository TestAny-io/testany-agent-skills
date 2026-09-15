import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createService } from '../server/service.mjs';

test('a 100-skill local fixture loads completely within the three-second product target', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-scale-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const projectDir = path.join(home, 'project');
  await fs.mkdir(projectDir, { recursive: true });
  for (let i = 0; i < 100; i++) {
    const name = `fixture-${String(i).padStart(3, '0')}`;
    const dir = path.join(codexHome, 'skills', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Verify complete indexed inventory at useful scale.\n---\n\n# ${name}\n`);
  }
  const adapter = { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false, error: 'isolated performance fixture' } }) };
  const service = await createService({ home, codexHome, projectDir, stateDir: path.join(root, 'state'), adapter });
  const start = performance.now();
  const snapshot = await service.snapshot('local');
  const elapsed = performance.now() - start;
  assert.equal(snapshot.skills.length, 100);
  assert.equal(new Set(snapshot.skills.map(skill => skill.id)).size, 100);
  assert.ok(snapshot.skills.every(skill => skill.scope === 'user' && skill.canToggle));
  assert.ok(elapsed < 3000, `100-skill inventory took ${Math.round(elapsed)}ms`);
  t.diagnostic(`100-skill scan ${Math.round(elapsed)}ms; excludes external CLI latency by design.`);
});
