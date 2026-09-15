import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/index.mjs';
import { runProcess } from '../server/cli.mjs';

// Both services use temporary homes. Only the lifecycle fixture explicitly
// opts into the internal sandbox; the second exercises production defaults.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-browser-'));
// Replace only this GitHub transport with a local Git repository in browser tests.
// Parsing, checkout, provenance, preview and writes still run through production code.
const gitSource = path.join(root, 'github-source'); const gitBin = path.join(root, 'bin');
const realGit = (await runProcess('/usr/bin/which', ['git'])).stdout.trim();
const gitSkill = path.join(gitSource, 'plugins/testany-llm/skills/prompt-optimizer');
await fs.mkdir(gitSkill, { recursive: true }); await fs.mkdir(gitBin);
await fs.writeFile(path.join(gitSkill, 'SKILL.md'), '---\nname: prompt-optimizer\ndescription: Browser URL and diff fixture.\n---\n# Updated source\nNew line: 日本語 / 中文\n<script>window.__diffExecuted = true</script>\n');
await fs.writeFile(path.join(gitSkill, 'added.txt'), 'New supporting file\n');
await fs.writeFile(path.join(gitSkill, 'image.bin'), Buffer.from([0, 255, 1]));
const git = args => runProcess(realGit, ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Browser fixture', '-c', 'user.email=fixture@example.invalid', '-C', gitSource, ...args]);
await git(['init', '-b', 'main']); await git(['add', '.']); await git(['commit', '-m', 'Fixture']);
await fs.writeFile(path.join(gitBin, 'git'), `#!${process.execPath}\nimport { spawnSync } from 'node:child_process';\nconst original = process.argv.slice(2);\nconst fixtureClone = original.includes('https://github.com/TestAny-io/testany-agent-skills.git');\nconst args = original.map(arg => arg === 'https://github.com/TestAny-io/testany-agent-skills.git' ? ${JSON.stringify(gitSource)} : fixtureClone && arg === 'protocol.file.allow=never' ? 'protocol.file.allow=always' : arg);\nconst result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 1);\n`, { mode: 0o755 });
process.env.PATH = `${gitBin}${path.delimiter}${process.env.PATH}`;
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
  if (!enableTestSandbox) {
    const alternate = path.join(root, name, 'alternate-project/.agents/skills/project-switch-sentinel');
    await fs.mkdir(alternate, { recursive: true });
    await fs.writeFile(path.join(alternate, 'SKILL.md'), '---\nname: project-switch-sentinel\ndescription: Selected project fixture.\n---\n');
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
