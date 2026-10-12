// Opt-in: the skills SkillDock lists for installed Claude plugins are the ones Claude itself lists for them,
// under the names it gives them, and every one a session offers is among them (REQ-SDX-002; HLD 9.3 V23). A marketplace made here covers the ways a plugin names its skills: the
// marketplace root with particular directories listed, the root with none, a subdirectory whose entry
// adds a directory or a single skill, and a plugin with its own manifest whose skills include ones without
// a name, a description or any frontmatter, one named differently from its folder, and a link. A bare repository stands in
// for GitHub (see claude-upgrade-smoke.mjs). Temporary HOME and Claude configuration directory, never
// the user's. Run it in a sandbox that denies outbound connections:
//   SKILLDOCK_SMOKE_CLAUDE=/path/to/claude sandbox-exec -f no-network.sb node tests/claude-plugin-skills-smoke.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runProcess } from '../server/cli.mjs';
import { claudeCliEnvironment } from '../server/process-env.mjs';
import { claudeCatalog } from '../server/claude-catalog.mjs';

const claudePath = process.env.SKILLDOCK_SMOKE_CLAUDE;
if (!claudePath) { console.error('SKILLDOCK_SMOKE_CLAUDE 未设置。'); process.exit(2); }
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-skills-')));
const home = path.join(fixture, 'home'); const configDir = path.join(home, '.claude'); const work = path.join(fixture, 'work'); const remote = path.join(fixture, 'market.git');
await fs.mkdir(home);
const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
const skill = (directory, name) => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\nbody\n`);
const plugins = [
  { name: 'one', source: './', strict: false, description: 'The root; lists x.', skills: ['./skills/x'] },
  { name: 'two', source: './', strict: false, description: 'The root; lists y.', skills: ['./skills/y'] },
  { name: 'rootall', source: './', strict: false, description: 'The root; lists nothing.' },
  { name: 'sub', source: './plugins/sub', strict: false, description: 'A subdirectory; adds ./tools.', skills: ['./tools'] },
  { name: 'subone', source: './plugins/sub', strict: false, description: 'A subdirectory; adds one skill.', skills: ['./tools/t1'] },
  { name: 'man', source: './plugins/man', description: 'Its own manifest adds ./custom.' },
];
const env = { ...claudeCliEnvironment({ HOME: home, PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' }, { configDir }), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
const git = async (...args) => (await runProcess('git', args, { cwd: fixture, timeout: 60000 })).stdout.trim();
const claude = async (...args) => (await runProcess(claudePath, args, { env, cwd: fixture, timeout: 120000 })).stdout;
// What a session offers, from the first event of print mode. Nothing is sent: the address is unreachable.
const offered = () => new Promise((resolve, reject) => {
  const child = spawn(claudePath, ['-p', 'hi', '--output-format', 'stream-json', '--verbose'], { cwd: fixture, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', ANTHROPIC_API_KEY: 'unused' } });
  let text = ''; const timer = setTimeout(() => child.kill(), 60000);
  const first = () => text.split('\n').slice(0, -1).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(event => event?.subtype === 'init');
  child.stdout.on('data', chunk => { text += chunk; if (first()) child.kill(); });
  child.on('close', () => { clearTimeout(timer); const init = first(); if (init) resolve(init.skills); else reject(new Error('会话没有给出启动事件。')); });
});

let result;
try {
  await write(path.join(work, '.claude-plugin/marketplace.json'), { name: 'declared', owner: { name: 'smoke' }, plugins });
  for (const name of ['x', 'y', 'z']) await skill(path.join(work, 'skills'), name);
  await skill(path.join(work, 'plugins/sub/skills'), 's1'); await skill(path.join(work, 'plugins/sub/tools'), 't1'); await skill(path.join(work, 'plugins/sub/tools'), 't2');
  await write(path.join(work, 'plugins/man/.claude-plugin/plugin.json'), { name: 'man', description: 'Manifest.', skills: './custom' });
  await skill(path.join(work, 'plugins/man/skills'), 'm1'); await skill(path.join(work, 'plugins/man/custom'), 'c1');
  await write(path.join(work, 'plugins/man/skills/noname/SKILL.md'), '---\ndescription: No name here.\n---\nbody\n');
  await write(path.join(work, 'plugins/man/skills/nodesc/SKILL.md'), '---\nname: nodesc\n---\nbody\n');
  await write(path.join(work, 'plugins/man/skills/bare/SKILL.md'), 'No frontmatter at all.\n');
  await write(path.join(work, 'plugins/man/skills/renamed/SKILL.md'), '---\nname: other-name\ndescription: Named differently from its folder.\n---\nbody\n');
  await fs.symlink('../custom/c1', path.join(work, 'plugins/man/skills/alias'));
  // A legacy command is not a skill, though Claude's own list of a plugin's skills names it too.
  await write(path.join(work, 'plugins/man/commands/cmd-only.md'), '---\ndescription: A command.\n---\nrun\n');
  await git('-C', work, 'init', '--quiet', '-b', 'main'); await git('-C', work, 'add', '-A');
  await git('-C', work, '-c', 'user.name=smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '--quiet', '-m', 'fixture');
  await git('clone', '--quiet', '--bare', work, remote);
  await fs.writeFile(path.join(home, '.gitconfig'), ['https://github.com/Fixture/declared', 'git@github.com:Fixture/declared'].flatMap(base => [`${base}.git`, base])
    .map(address => `[url "file://${remote}"]\n\tinsteadOf = ${address}\n`).join(''));
  await claude('plugin', 'marketplace', 'add', 'Fixture/declared');
  for (const { name } of plugins) await claude('plugin', 'install', `${name}@declared`);
  const session = await offered();
  const catalog = await claudeCatalog({ claudeRoot: { configDir, pluginCacheDir: path.join(configDir, 'plugins/cache') }, project: fixture, cli: { available: true, path: claudePath }, env, managedDir: path.join(fixture, 'no-managed') });
  assert.equal(catalog.unconfirmed, null, catalog.unconfirmed ?? '');
  const compared = {};
  for (const { name } of plugins) {
    const plugin = catalog.plugins.find(item => item.name === name && item.installed);
    const listed = catalog.skills.filter(item => item.pluginId === plugin.id).map(item => item.name).sort();
    // Claude's own list of the plugin's skills, less its command files; and what a session offers the model.
    const details = (await claude('plugin', 'details', `${name}@declared`)).match(/Skills \(\d+\)\s*([^\n]*)/)?.[1].split(',').map(value => value.trim()).filter(value => value && value !== 'cmd-only').sort();
    const offers = session.filter(value => value.startsWith(`${name}:`)).map(value => value.slice(name.length + 1)).sort();
    compared[name] = { listed, offers };
    assert.deepEqual(listed, details, name);
    assert.equal(plugin.skillCount, details.length, `${name} 的技能数`);
    assert.deepEqual(offers.filter(value => !listed.includes(value)), [], `${name}：会话提供的都在清单中`);
  }
  // The cases are not vacuous: the root's listed directories are a complete set, others add to the default;
  // a skill goes by its folder's name and is listed whatever its frontmatter holds.
  assert.deepEqual(['one', 'two', 'rootall', 'sub', 'subone'].map(name => compared[name].listed), [['x'], ['y'], ['x', 'y', 'z'], ['s1', 't1', 't2'], ['s1', 't1']]);
  assert.deepEqual(compared.man.listed, ['alias', 'bare', 'c1', 'm1', 'nodesc', 'noname', 'renamed']);
  assert.ok(['m1', 'noname', 'renamed'].every(value => compared.man.offers.includes(value)) && !compared.man.offers.includes('other-name'));
  result = { passed: true, cli: (await claude('--version')).trim(), compared };
} catch (error) { result = { passed: false, error: error.stack }; process.exitCode = 1; }
await fs.rm(fixture, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify(result)}\n`);
