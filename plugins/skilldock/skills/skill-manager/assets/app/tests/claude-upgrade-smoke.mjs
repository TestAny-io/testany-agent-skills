// Opt-in: Claude's own command line taking SkillDock from a commit whose marketplace entry states no
// version (0.11.0) to the committed tree, which states one (0.11.1; HLD 9.3 V21), and what a session
// then offers. A bare clone stands in for GitHub: the temporary HOME's git configuration rewrites the
// repository's address to it, so Claude registers the marketplace as it does the real one (source:
// github). Temporary HOME and Claude configuration directory, never the user's. Run it in a sandbox
// that denies outbound connections:
//   SKILLDOCK_SMOKE_CLAUDE=/path/to/claude sandbox-exec -f no-network.sb node tests/claude-upgrade-smoke.mjs
// SKILLDOCK_UPGRADE_FROM names the starting commit; the default is the 0.11.0 release.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../server/cli.mjs';
import { claudeCliEnvironment } from '../server/process-env.mjs';

const claudePath = process.env.SKILLDOCK_SMOKE_CLAUDE;
if (!claudePath) { console.error('SKILLDOCK_SMOKE_CLAUDE 未设置。'); process.exit(2); }
const repository = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)), '../../../..');
const ADDRESS = 'TestAny-io/testany-agent-skills'; const ID = 'skilldock@testany-agent-skills'; const ENTRY = 'skilldock:skill-manager';
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-upgrade-')));
const home = path.join(fixture, 'home'); const configDir = path.join(home, '.claude');
const remote = path.join(fixture, 'testany-agent-skills.git'); const work = path.join(fixture, 'work');
await fs.mkdir(home);
const env = { ...claudeCliEnvironment({ HOME: home, PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' }, { configDir }), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
const git = async (...args) => (await runProcess('git', args, { cwd: fixture, timeout: 120000 })).stdout.trim();
const claude = async (...args) => { const done = await runProcess(claudePath, args, { env, cwd: fixture, timeout: 120000 }); return `${done.stdout}\n${done.stderr}`; };
const installed = async () => { const [item, ...others] = JSON.parse((await runProcess(claudePath, ['plugin', 'list', '--json'], { env, cwd: fixture, timeout: 120000 })).stdout); assert.deepEqual([item.id, others.length], [ID, 0]); return item; };
const update = async () => { await claude('plugin', 'marketplace', 'update', 'testany-agent-skills'); return claude('plugin', 'update', ID); };
// What a session offers, from the first event of print mode. Nothing is sent: the address is unreachable.
const offered = () => new Promise((resolve, reject) => {
  const child = spawn(claudePath, ['-p', 'hi', '--output-format', 'stream-json', '--verbose'], { cwd: fixture, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', ANTHROPIC_API_KEY: 'unused' } });
  let text = ''; const timer = setTimeout(() => child.kill(), 60000);
  const first = () => text.split('\n').slice(0, -1).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(event => event?.subtype === 'init');
  child.stdout.on('data', chunk => { text += chunk; if (first()) child.kill(); });
  child.on('close', () => { clearTimeout(timer); const init = first(); if (init) resolve({ skills: init.skills.filter(name => name === ENTRY).length, commands: init.slash_commands.filter(name => name === ENTRY).length }); else reject(new Error('会话没有给出启动事件。')); });
});
const entryVersion = async commit => JSON.parse(await git('-C', repository, 'show', `${commit}:.claude-plugin/marketplace.json`)).plugins.find(item => item.name === 'skilldock').version;

let result;
try {
  const from = await git('-C', repository, 'rev-parse', process.env.SKILLDOCK_UPGRADE_FROM || '838b6191431a6fae71e54f9d3b1ef4830ed4249b');
  const to = await git('-C', repository, 'rev-parse', 'HEAD');
  const declared = await entryVersion(to);
  assert.equal(await entryVersion(from), undefined, '起点提交的条目不应声明版本');
  assert.match(declared, /^\d+\.\d+\.\d+$/, '当前提交的条目应声明版本');
  await git('clone', '--quiet', '--bare', '--no-hardlinks', repository, remote);
  const move = async commit => { await git('-C', remote, 'update-ref', 'refs/heads/main', commit); await git('-C', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main'); };
  await move(from);
  await fs.writeFile(path.join(home, '.gitconfig'), [`https://github.com/${ADDRESS}`, `git@github.com:${ADDRESS}`].flatMap(base => [`${base}.git`, base])
    .map(address => `[url "file://${remote}"]\n\tinsteadOf = ${address}\n`).join(''));

  await claude('plugin', 'marketplace', 'add', ADDRESS);
  const source = JSON.parse(await fs.readFile(path.join(configDir, 'plugins/known_marketplaces.json'), 'utf8'))['testany-agent-skills'].source.source;
  assert.equal(source, 'github', 'marketplace 按真实来源登记');
  await claude('plugin', 'install', ID);
  const before = await installed();
  assert.equal(before.version, from.slice(0, 12), '没有声明版本时以提交摘要作版本');
  // One entry while the command file and the skill share a name (0.11.0).
  assert.deepEqual(await offered(), { skills: 1, commands: 1 }, '0.11.0 的会话中有且只有一个 SkillDock 入口');

  // The marketplace moves on to the commit that states a version.
  await move(to);
  assert.match(await update(), new RegExp(`updated from ${before.version} to ${declared.replaceAll('.', '\\.')}`));
  const after = await installed();
  assert.deepEqual([after.version, path.basename(after.installPath)], [declared, declared], '采用条目声明的版本，缓存目录以它命名');
  // Claude keeps the previous version's directory, marked as orphaned (HLD 3.3A).
  assert.ok(await fs.stat(path.join(before.installPath, '.orphaned_at')).then(() => true, () => false), '旧版本目录保留并带废弃标记');
  // One entry for the model and for the user, with or without the command file 0.11.0 carried.
  assert.deepEqual(await offered(), { skills: 1, commands: 1 }, '会话中有且只有一个 SkillDock 入口');

  // Two more commits: content changed with the version kept, then the entry's version raised.
  await git('clone', '--quiet', '--branch', 'main', `file://${remote}`, work);
  const commit = async message => { await git('-C', work, '-c', 'user.name=smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '--quiet', '-am', message); await git('-C', work, 'push', '--quiet', 'origin', 'main'); };
  await fs.appendFile(path.join(work, 'plugins/skilldock/README.md'), '\nupgrade-smoke\n');
  await commit('content only');
  assert.match(await update(), /already at the latest version/);
  const same = await installed();
  assert.equal(same.version, declared);
  assert.ok(!(await fs.readFile(path.join(same.installPath, 'README.md'), 'utf8')).includes('upgrade-smoke'), '同一版本不换内容');
  const raised = declared.replace(/\d+$/, patch => String(Number(patch) + 1));
  const catalogFile = path.join(work, '.claude-plugin/marketplace.json'); const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
  catalog.plugins.find(item => item.name === 'skilldock').version = raised;
  await fs.writeFile(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
  await commit('entry version');
  assert.match(await update(), new RegExp(`updated from ${declared.replaceAll('.', '\\.')} to ${raised.replaceAll('.', '\\.')}`));
  const last = await installed();
  assert.equal(last.version, raised);
  assert.ok((await fs.readFile(path.join(last.installPath, 'README.md'), 'utf8')).includes('upgrade-smoke'));
  result = { passed: true, cli: (await claude('--version')).trim(), from: from.slice(0, 12), to: to.slice(0, 12), source, versions: [before.version, after.version, same.version, last.version] };
} catch (error) { result = { passed: false, error: error.stack }; process.exitCode = 1; }
await fs.rm(fixture, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
