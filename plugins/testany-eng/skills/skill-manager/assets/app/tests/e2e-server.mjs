import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/index.mjs';

// Both services use temporary homes. Only the lifecycle fixture explicitly
// opts into the internal sandbox; the second exercises production defaults.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-browser-'));
const port = Number(process.env.SKILLDOCK_E2E_PORT || 4821);
const apps = [];
for (const [name, enableTestSandbox] of [['fixture', true], ['production', false]]) {
  const home = path.join(root, name, 'home');
  const projectDir = path.join(root, name, 'project');
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  if (!enableTestSandbox) {
    const skillDir = path.join(codexHome, 'skills', 'production-sentinel');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: production-sentinel\ndescription: Local inventory regression fixture.\n---\n# Production sentinel\n');
  }
  const app = await createApp({
    home, projectDir, codexHome,
    stateDir: path.join(root, name, 'state'), codexBin: path.join(root, 'no-codex'),
    ...(enableTestSandbox ? { enableTestSandbox: true } : {}),
  });
  apps.push(app);
  await new Promise(resolve => app.server.listen(port + apps.length - 1, '127.0.0.1', resolve));
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all(apps.map(app => app.close()));
  await fs.rm(root, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
