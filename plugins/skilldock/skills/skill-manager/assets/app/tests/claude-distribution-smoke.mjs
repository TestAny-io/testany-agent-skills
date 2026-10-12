// Opt-in: actual Claude installation of the committed tree, in a temporary HOME and Claude
// configuration directory, never the user's (REQ-SDX-017; DEC-SDX-013, 014; HLD 9.3 V6).
// A local clone stands in for the marketplace: a directory marketplace also copies
// untracked files (V8), and without Git history Claude records the version as "unknown".
// Only the Claude command line is borrowed from the user's machine. It is never asked for
// the remote plugin directory (`plugin list --available` downloads it, HLD 3.3); run this
// inside a sandbox that denies outbound connections to be sure nothing else goes out.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';
import { resolveClaudeCli } from '../server/claude-cli.mjs';
import { claudeCliEnvironment } from '../server/process-env.mjs';
import { agentRoots, locate, inspect } from '../server/installs.mjs';

const skill = fileURLToPath(new URL('../../../', import.meta.url));
const repository = path.resolve(skill, '../../../..');
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-install-')));
const home = path.join(fixture, 'home'); const configDir = path.join(home, '.claude');
const market = path.join(fixture, 'testany-agent-skills'); const project = path.join(fixture, 'project');
await fs.mkdir(home); await fs.mkdir(project);
const base = { HOME: home, PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' };
let result;
try {
  await runProcess('git', ['clone', '--quiet', '--no-hardlinks', repository, market], { cwd: fixture, timeout: 120000 });
  const commit = (await runProcess('git', ['-C', market, 'rev-parse', 'HEAD'], { cwd: fixture })).stdout.trim();
  const cli = await resolveClaudeCli({ save: false });
  assert.ok(cli.available, cli.error);
  const env = { ...claudeCliEnvironment(base, { configDir }), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  const claude = async args => (await runProcess(cli.path, args, { env, cwd: fixture, timeout: 120000 })).stdout;
  await claude(['plugin', 'marketplace', 'add', market]);
  await claude(['plugin', 'install', 'skilldock@testany-agent-skills']);
  const listed = JSON.parse(await claude(['plugin', 'list', '--json']));
  assert.deepEqual(listed.map(item => [item.id, item.enabled]), [['skilldock@testany-agent-skills', true]], '只装上 SkillDock');
  const installed = listed[0];
  assert.ok(commit.startsWith(installed.version), 'Claude 以提交摘要作版本');
  // DEC-SDX-013: no Claude manifest, and the Codex MCP configuration is not loaded.
  const details = await claude(['plugin', 'details', 'skilldock@testany-agent-skills']);
  assert.match(details, /MCP servers \(0\)/); assert.match(details, /Skills \(2\)\s+skill-manager, skill-manager/);
  const root = await fs.readdir(installed.installPath);
  assert.deepEqual(['.mcp.json', '.claude-plugin', 'codex.mcp.json'].filter(name => root.includes(name)), ['codex.mcp.json']);
  // DEC-SDX-014: the plugin browser shows which Agents each entry supports.
  assert.match(details, /Codex 与 Claude/);
  // The entry descriptions as Claude's plugin browser reads them: the marketplace Claude registered.
  const known = JSON.parse(await fs.readFile(path.join(configDir, 'plugins/known_marketplaces.json'), 'utf8'))['testany-agent-skills'];
  const catalog = JSON.parse(await fs.readFile(path.join(known.installLocation, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.match(catalog.plugins.find(item => item.name === 'teamdesk').description, /仅支持 Codex/);
  // Nothing remote was fetched into the configuration directory.
  for (const name of ['plugin-catalog-cache.json', 'plugin-directory-cache-v2.json']) {
    for (const directory of [configDir, path.join(configDir, 'plugins')]) assert.equal(await fs.stat(path.join(directory, name)).catch(() => null), null, name);
  }
  // The installed copy is recognised as a Claude-side SkillDock; its doctor writes nothing.
  const appPath = path.join(installed.installPath, 'skills/skill-manager/assets/app');
  const own = await inspect(await locate(appPath, await agentRoots({ env: { CLAUDE_CONFIG_DIR: configDir }, home })));
  const version = JSON.parse(await fs.readFile(path.join(skill, 'assets/app/package.json'), 'utf8')).version;
  assert.deepEqual([own?.agent, own?.marketplace, own?.version], ['claude', 'testany-agent-skills', version]);
  const doctor = JSON.parse((await runProcess('/bin/sh', [path.join(installed.installPath, 'skills/skill-manager/scripts/launch.sh'), 'doctor', '--project', project], {
    env: { ...base, CLAUDE_CONFIG_DIR: configDir, SKILLDOCK_STATE_DIR: path.join(fixture, 'state'), SKILLDOCK_NO_DIALOG: '1' }, cwd: project, timeout: 60000 })).stdout);
  assert.equal(doctor.project.effective, project);
  assert.equal(await fs.stat(path.join(fixture, 'state')).catch(() => null), null, 'doctor 不写数据目录');
  result = { passed: true, fixture, cli: { path: cli.path, version: cli.version }, commit, installed, sourceKey: own.sourceKey,
    node: doctor.available === false ? null : doctor.bootstrap, details: details.split('\n').filter(line => /\(\d+\)/.test(line)).map(line => line.trim()) };
} catch (error) { result = { passed: false, fixture, error: error.stack }; process.exitCode = 1; }
await fs.writeFile(path.join(fixture, 'result.json'), JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
