// Opt-in browser fixture: real UI/actions, temporary homes, and deliberately slow local discovery.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { emptyRegistry } from '../server/fixtures.mjs';
import { identity, inspectTree, writeJson } from '../server/files.mjs';

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-tags-browser-')));
const apps = [];
const result = { root };
for (const kind of ['tags', 'progress']) {
  const home = path.join(root, kind, 'home'); const projectDir = path.join(home, 'project'); const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, kind, 'state');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir); await fs.mkdir(path.join(stateDir, 'local'), { recursive: true });
  if (kind === 'progress') {
    const registry = emptyRegistry();
    for (const [index, name] of ['alpha-notes', 'beta-review', 'gamma-tests'].entries()) {
      const directory = path.join(codexHome, 'skills', name); const source = path.join(root, 'sources', name);
      await fs.mkdir(directory, { recursive: true }); await fs.mkdir(source, { recursive: true });
      const content = `---\nname: ${name}\ndescription: Isolated slow-update fixture.\n---\nOriginal\n`;
      await fs.writeFile(path.join(directory, 'SKILL.md'), content); await fs.writeFile(path.join(source, 'SKILL.md'), content + (index === 0 ? 'Updated source\n' : ''));
      const tree = await inspectTree(directory);
      registry.sources[identity(directory)] = { directory, source, sourceType: 'local', subpath: '.', fingerprint: tree.fingerprint, files: tree.entries, installedAt: new Date().toISOString() };
      if (index === 2) await fs.rm(source, { recursive: true });
    }
    await writeJson(path.join(stateDir, 'local/registry.json'), registry);
  }
  const app = await createApp({ home, projectDir, codexHome, stateDir, scheduler: false, selfUpdate: false,
    ...(kind === 'tags' ? { enableTestSandbox: true } : {}),
    adapter: { list: async () => {
      if (kind === 'progress') await new Promise(resolve => setTimeout(resolve, 2000));
      return { plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } };
    } },
  });
  if (kind === 'tags') await app.service.action({ mode: 'sandbox', action: 'plugin.install', id: 'starter-tools@starter-market' });
  apps.push(app); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  result[kind] = `http://127.0.0.1:${app.server.address().port}`;
}
if (process.env.SKILLDOCK_BROWSER_FIXTURE_INFO) await writeJson(process.env.SKILLDOCK_BROWSER_FIXTURE_INFO, result);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
let closing = false;
async function close() {
  if (closing) return; closing = true;
  await Promise.all(apps.map(app => app.close())); await fs.rm(root, { recursive: true, force: true }); process.exit(0);
}
process.once('SIGTERM', close); process.once('SIGINT', close);
