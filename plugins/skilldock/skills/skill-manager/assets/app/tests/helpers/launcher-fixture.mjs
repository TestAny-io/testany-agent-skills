// SPDX-License-Identifier: AGPL-3.0-only
// Launcher fixtures: a minimal SkillDock app copied from this tree, an isolated HOME and
// environment, and Codex plugin-cache installations of it.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { ROOT_FILES } from '../../scripts/source-bundle.mjs';

export const MARKET = 'testany-agent-skills';
export const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
// Launches never see this session's HOME, Codex or Claude variables, and never run the
// Agent command lines installed on this machine (absent explicit ones fail cleanly).
export const absentCommandLines = home => ({ SKILLDOCK_CODEX_BIN: path.join(home, 'no-agent-cli/codex'), SKILLDOCK_CLAUDE_BIN: path.join(home, 'no-agent-cli/claude') });
export const isolated = home => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDE|CODEX_|SKILLDOCK_|ANTHROPIC_)|^PORT$/.test(key))), HOME: home, ...absentCommandLines(home) });

export async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock launcher '));
  const sourceRoot = path.join(root, 'software source');
  const appDir = path.join(sourceRoot, 'assets/app');
  const stateDir = path.join(root, 'app state');
  const projectDir = path.join(root, 'project');
  const home = path.join(root, 'home');
  await fs.mkdir(home);
  for (const folder of ['src', 'server', 'shared', 'scripts', 'tests']) await fs.mkdir(path.join(appDir, folder), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, 'scripts'), { recursive: true });
  for (const file of ROOT_FILES) await fs.copyFile(fileURLToPath(new URL(`../../../../${file}`, import.meta.url)), path.join(sourceRoot, file));
  await fs.copyFile(fileURLToPath(new URL('../../scripts/source-bundle.mjs', import.meta.url)), path.join(appDir, 'scripts/source-bundle.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../../server/installation.mjs', import.meta.url)), path.join(appDir, 'server/installation.mjs'));
  await fs.copyFile(fileURLToPath(new URL('../../server/toolchain.mjs', import.meta.url)), path.join(appDir, 'server/toolchain.mjs'));
  for (const file of ['codex-runtime.mjs', 'project-context.mjs', 'background-entry.mjs']) await fs.copyFile(fileURLToPath(new URL(`../../server/${file}`, import.meta.url)), path.join(appDir, `server/${file}`));
  await fs.mkdir(projectDir);
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'skilldock-launcher-fixture', version: '0.0.0', type: 'module',
    scripts: { build: 'node scripts/source-bundle.mjs --stage && node scripts/source-bundle.mjs' },
  }));
  await fs.writeFile(path.join(appDir, 'package-lock.json'), JSON.stringify({
    name: 'skilldock-launcher-fixture', version: '0.0.0', lockfileVersion: 3,
    packages: { '': { name: 'skilldock-launcher-fixture', version: '0.0.0' } },
  }));
  for (const file of ['tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'playwright.config.ts']) await fs.writeFile(path.join(appDir, file), 'fixture');
  await fs.writeFile(path.join(appDir, 'server/index.mjs'), `
    import http from 'node:http';
    const server = http.createServer((req,res) => {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({app:'skilldock',pid:process.pid,project:process.env.SKILLDOCK_PROJECT_DIR,state:process.env.SKILLDOCK_STATE_DIR}));
    });
    server.listen(Number(process.env.PORT),'127.0.0.1');
    process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
  `);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, sourceRoot, appDir, stateDir, projectDir, home, env: isolated(home), codexBin: path.join(root, 'absent-cli') };
}

export async function listen() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

export async function installedVersion(options, version, { plugin = 'skilldock' } = {}) {
  const codexHome = path.join(options.root, 'codex');
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nsource_type = "git"\nsource = "${SOURCE}"\n`);
  const packageRoot = path.join(codexHome, 'plugins/cache', MARKET, plugin, version);
  const skill = path.join(packageRoot, 'skills/skill-manager');
  await fs.cp(options.sourceRoot, skill, { recursive: true });
  await fs.mkdir(path.join(packageRoot, '.codex-plugin'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, '.codex-plugin/plugin.json'), JSON.stringify({ name: plugin, version }));
  await versionSkill(skill, version);
  return { ...options, codexHome, appDir: path.join(skill, 'assets/app') };
}

// A Claude-side installation: the plugin directory copied into the Claude plugin cache,
// without a Claude manifest and under a commit-digest directory (HLD 9.3 V6). The Codex
// home of `installedVersion` stands in for the default one.
export async function installedClaudeVersion(options, version, { configDir = path.join(options.home, '.claude') } = {}) {
  await fs.mkdir(path.join(configDir, 'plugins'), { recursive: true });
  await fs.writeFile(path.join(configDir, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: SOURCE } } }));
  const skill = path.join(configDir, 'plugins/cache', MARKET, 'skilldock', `sha-${version.replaceAll('.', '-')}`, 'skills/skill-manager');
  await fs.cp(options.sourceRoot, skill, { recursive: true });
  await versionSkill(skill, version);
  return { ...options, codexHome: path.join(options.root, 'codex'), appDir: path.join(skill, 'assets/app') };
}

async function versionSkill(skill, version) {
  await fs.writeFile(path.join(skill, 'scripts/launch.sh'), '#!/bin/sh\nexit 1\n');
  for (const file of ['package.json', 'package-lock.json']) {
    const target = path.join(skill, 'assets/app', file); const value = JSON.parse(await fs.readFile(target, 'utf8'));
    value.name = 'skilldock'; value.version = version; if (value.packages) value.packages[''] = { name: 'skilldock', version };
    await fs.writeFile(target, JSON.stringify(value));
  }
  await fs.appendFile(path.join(skill, 'assets/app/README.md'), `\n${version}`);
}
