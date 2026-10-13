// Opt-in: the skills SkillDock lists for installed Claude plugins are the ones Claude itself lists for them,
// under the names it gives them, and every one a session offers is among them (REQ-SDX-002; HLD 9.3 V23). A marketplace made here covers the ways a plugin names its skills: the
// marketplace root with particular directories listed, the root with none, a subdirectory whose entry
// adds a directory or a single skill, and a plugin with its own manifest whose skills include ones without
// a name, a description or any frontmatter, one named differently from its folder, and a link. A second marketplace's
// root carries its own manifest, and a third holds a plugin Claude does not load (HLD 9.3 V24). Bare repositories stand in
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
const home = path.join(fixture, 'home'); const configDir = path.join(home, '.claude'); const work = path.join(fixture, 'work'); const rooted = path.join(fixture, 'rooted');
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
  // The declared path is the skill itself, named differently from its folder; the plugin's own directory is a skill;
  // a listed file is no directory.
  { name: 'direct', source: './', strict: false, description: 'The root; lists skills by their own folders.', skills: ['./named/dirname', './named/nameless'] },
  { name: 'subdirect', source: './plugins/sub', strict: false, description: 'A subdirectory; adds a skill named differently.', skills: ['./tools/onedir'] },
  { name: 'single', source: './', strict: false, description: 'The root itself is a skill.', skills: ['./'] },
  { name: 'solo', source: './plugins/solo', strict: false, description: 'The plugin directory itself is a skill.', skills: ['.'] },
  { name: 'file', source: './', strict: false, description: 'The root; lists a file.', skills: ['./skills/x/SKILL.md'] },
];
// A second marketplace whose root carries its own manifest, which declares ./more: an entry that lists any
// directory that exists, the root and the default one included, leaves the manifest's out (73 IF4-P3-01).
const rootedPlugins = [
  { name: 'r-skills', source: './', description: 'Lists the default directory.', skills: ['./skills/'] },
  { name: 'r-bare', source: './', description: 'Lists the default directory, no slash.', skills: ['./skills'] },
  { name: 'r-root', source: './', description: 'Lists the root.', skills: ['./'] },
  { name: 'r-both', source: './', description: 'Lists the default directory and another.', skills: ['./skills/', './extra'] },
  { name: 'r-extra', source: './', description: 'Lists another directory.', skills: ['./extra'] },
  { name: 'r-absent', source: './', description: 'Lists a directory that is not there.', skills: ['./skills/absent'] },
  { name: 'r-none', source: './', description: 'Lists nothing.' },
  // The default directory is read before what else is listed, wherever the entry puts it: a skill inside it that is
  // listed too goes by its folder's name. Another directory is read where it is listed (75 C12-P3-01).
  { name: 'r-childfirst', source: './', description: 'Lists a skill of the default directory, then the directory.', skills: ['./skills/x', './skills'] },
  { name: 'r-childonly', source: './', description: 'Lists a skill of the default directory.', skills: ['./skills/x'] },
  { name: 'r-rootlater', source: './', description: 'Lists a skill of the default directory, then the root.', skills: ['./skills/x', './'] },
  { name: 'r-morefirst', source: './', description: 'Lists a skill of another directory, then that directory.', skills: ['./more/m1', './more'] },
];
// A third whose one plugin Claude does not load: its entry is not strict and the root's manifest declares components too.
// Claude's list reports that in the same field as a declared path that failed, which leaves the rest loaded (`file`,
// `r-absent`): SkillDock shows the report and keeps the skills listed (73 IF4-P3-03).
const broken = path.join(fixture, 'broken'); const brokenPlugins = [{ name: 'conflict', source: './', strict: false, description: 'Both name components.', skills: ['./skills/x'] }];
const markets = [{ name: 'declared', work, plugins }, { name: 'rooted', work: rooted, plugins: rootedPlugins }, { name: 'broken', work: broken, plugins: brokenPlugins }];
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
  const named = (directory, name) => write(path.join(directory, 'SKILL.md'), name ? `---\nname: ${name}\ndescription: ${name} skill.\n---\nbody\n` : '---\ndescription: No name.\n---\nbody\n');
  await named(path.join(work, 'named/dirname'), 'fm-direct'); await named(path.join(work, 'named/nameless')); await named(work, 'root-skill');
  await named(path.join(work, 'plugins/sub/tools/onedir'), 'fm-subdirect'); await named(path.join(work, 'plugins/solo'), 'fm-solo'); await skill(path.join(work, 'plugins/solo/skills'), 'inner');
  await skill(path.join(work, 'plugins/man/skills'), '.hidden');
  await write(path.join(work, 'plugins/man/.claude-plugin/plugin.json'), { name: 'man', description: 'Manifest.', skills: './custom' });
  await skill(path.join(work, 'plugins/man/skills'), 'm1'); await skill(path.join(work, 'plugins/man/custom'), 'c1');
  await write(path.join(work, 'plugins/man/skills/noname/SKILL.md'), '---\ndescription: No name here.\n---\nbody\n');
  await write(path.join(work, 'plugins/man/skills/nodesc/SKILL.md'), '---\nname: nodesc\n---\nbody\n');
  await write(path.join(work, 'plugins/man/skills/bare/SKILL.md'), 'No frontmatter at all.\n');
  await write(path.join(work, 'plugins/man/skills/renamed/SKILL.md'), '---\nname: other-name\ndescription: Named differently from its folder.\n---\nbody\n');
  await fs.symlink('../custom/c1', path.join(work, 'plugins/man/skills/alias'));
  // A legacy command is not a skill, though Claude's own list of a plugin's skills names it too.
  await write(path.join(work, 'plugins/man/commands/cmd-only.md'), '---\ndescription: A command.\n---\nrun\n');
  await write(path.join(rooted, '.claude-plugin/marketplace.json'), { name: 'rooted', owner: { name: 'smoke' }, plugins: rootedPlugins });
  await write(path.join(rooted, '.claude-plugin/plugin.json'), { name: 'rooted', description: 'The root has a manifest.', skills: './more' });
  for (const name of ['y', 'z']) await skill(path.join(rooted, 'skills'), name);
  await named(path.join(rooted, 'skills/x'), 'fm-x'); await named(path.join(rooted, 'more/m1'), 'fm-m1');
  await skill(path.join(rooted, 'more'), 'm2'); await skill(path.join(rooted, 'extra'), 'e1'); await named(rooted, 'root-skill');
  await write(path.join(broken, '.claude-plugin/marketplace.json'), { name: 'broken', owner: { name: 'smoke' }, plugins: brokenPlugins });
  await write(path.join(broken, '.claude-plugin/plugin.json'), { name: 'conflict', description: 'The root has a manifest.', skills: './more' });
  await skill(path.join(broken, 'skills'), 'x'); await skill(path.join(broken, 'more'), 'm1');
  let rewrites = '';
  for (const market of markets) {
    const remote = path.join(fixture, `remote-${market.name}.git`);
    await git('-C', market.work, 'init', '--quiet', '-b', 'main'); await git('-C', market.work, 'add', '-A');
    await git('-C', market.work, '-c', 'user.name=smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '--quiet', '-m', 'fixture');
    await git('clone', '--quiet', '--bare', '--no-local', market.work, remote);
    rewrites += [`https://github.com/Fixture/${market.name}`, `git@github.com:Fixture/${market.name}`].flatMap(base => [`${base}.git`, base]).map(address => `[url "file://${remote}"]\n\tinsteadOf = ${address}\n`).join('');
  }
  await fs.writeFile(path.join(home, '.gitconfig'), rewrites);
  for (const market of markets) {
    await claude('plugin', 'marketplace', 'add', `Fixture/${market.name}`);
    assert.equal(JSON.parse(await fs.readFile(path.join(configDir, 'plugins/known_marketplaces.json'), 'utf8'))[market.name].source.source, 'github', 'marketplace 按真实来源登记');
    for (const { name } of market.plugins) await claude('plugin', 'install', `${name}@${market.name}`);
  }
  // A skills-directory plugin whose manifest declares a directory that is not there: Claude reports that in the same list (75 C12-P3-02).
  await write(path.join(configDir, 'skills/sdp/.claude-plugin/plugin.json'), { name: 'sdp', description: 'In the skills directory.', skills: './absent' });
  await skill(path.join(configDir, 'skills/sdp/skills'), 'sd-inner');
  const session = await offered();
  const catalog = await claudeCatalog({ claudeRoot: { configDir, pluginCacheDir: path.join(configDir, 'plugins/cache') }, project: fixture, cli: { available: true, path: claudePath }, env, managedDir: path.join(fixture, 'no-managed') });
  assert.equal(catalog.unconfirmed, null, catalog.unconfirmed ?? '');
  const compared = {};
  for (const market of markets.slice(0, 2)) for (const { name } of market.plugins) {
    const plugin = catalog.plugins.find(item => item.name === name && item.installed);
    const listed = catalog.skills.filter(item => item.pluginId === plugin.id).map(item => item.name).sort();
    // Claude's own list of the plugin's skills, less its command files; and what a session offers the model.
    const details = (await claude('plugin', 'details', `${name}@${market.name}`)).match(/Skills \(\d+\)\s*([^\n]*)/)?.[1].split(',').map(value => value.trim()).filter(value => value && value !== 'cmd-only').sort();
    const offers = session.filter(value => value.startsWith(`${name}:`)).map(value => value.slice(name.length + 1)).sort();
    compared[name] = { listed, offers };
    assert.deepEqual(listed, details, name);
    assert.equal(plugin.skillCount, details.length, `${name} 的技能数`);
    // A session writes a leading dot of a folder's name as a hyphen; Claude's own list, and SkillDock's, keep the dot.
    assert.deepEqual(offers.filter(value => !listed.map(item => item.replace(/^\./, '-')).includes(value)), [], `${name}：会话提供的都在清单中`);
  }
  // The cases are not vacuous: the root's listed directories are a complete set, others add to the default;
  // a skill goes by its folder's name and is listed whatever its frontmatter holds.
  assert.deepEqual(['one', 'two', 'rootall', 'sub', 'subone'].map(name => compared[name].listed), [['x'], ['y'], ['x', 'y', 'z'], ['onedir', 's1', 't1', 't2'], ['s1', 't1']]);
  // A declared path that is the skill itself goes by its frontmatter's name, a skill below a directory by its folder's.
  assert.deepEqual(['direct', 'subdirect', 'single', 'solo', 'file'].map(name => compared[name].listed), [['fm-direct', 'nameless'], ['fm-subdirect', 's1'], ['root-skill', 'x', 'y', 'z'], ['fm-solo', 'inner'], ['x', 'y', 'z']]);
  // The root's own manifest adds its directory only when the entry lists no directory that exists.
  assert.deepEqual(rootedPlugins.map(({ name }) => compared[name].listed.join(' ')), ['x y z', 'x y z', 'root-skill x y z', 'e1 x y z', 'e1', 'm1 m2 x y z', 'm1 m2 x y z',
    'x y z', 'fm-x', 'root-skill x y z', 'fm-m1 m2']);
  // A session offers exactly what is listed, except of the plugin that holds skills it does not offer the model.
  // (The second marketplace's plugins share one manifest, and a session names their skills by its name: not compared.)
  for (const { name } of plugins) if (name !== 'man') assert.deepEqual(compared[name].offers, compared[name].listed, name);
  assert.deepEqual(compared.man.listed, ['.hidden', 'alias', 'bare', 'c1', 'm1', 'nodesc', 'noname', 'renamed']);
  assert.ok(['m1', 'noname', 'renamed'].every(value => compared.man.offers.includes(value)) && !compared.man.offers.includes('other-name'));
  // What Claude's list reports about loading: for the plugin it does not load (no details, no skill in a session) and for
  // the two with a declared path that failed, which load the rest. SkillDock shows each report with the plugin.
  const claudeList = JSON.parse(await claude('plugin', 'list', '--json'));
  const reports = Object.fromEntries(claudeList.filter(item => item.errors?.length).map(item => [item.id, item.errorDetails?.map(detail => detail.type)]));
  assert.deepEqual(reports, { 'conflict@broken': ['generic-error'], 'file@declared': ['component-load-failed'], 'r-absent@rooted': ['path-not-found'], 'sdp@skills-dir': ['path-not-found'] });
  // The others carry neither field; the one that loaded nothing is still enabled; a failed path names its component.
  assert.deepEqual(claudeList.filter(item => !reports[item.id] && ('errors' in item || 'errorDetails' in item)).map(item => item.id), []);
  const reported = id => claudeList.find(item => item.id === id);
  assert.equal(reported('conflict@broken').enabled, true);
  assert.deepEqual(Object.keys(reported('file@declared').errorDetails[0]).sort(), ['component', 'path', 'plugin', 'type']); assert.equal(reported('file@declared').errorDetails[0].component, 'skills');
  await assert.rejects(claude('plugin', 'details', 'conflict@broken'), /not found/);
  assert.equal(session.filter(value => value.startsWith('conflict:')).length, 0);
  for (const id of Object.keys(reports)) {
    const plugin = catalog.plugins.find(item => `${item.name}@${item.marketplace}` === id && item.installed);
    assert.ok(plugin.warnings?.every(line => line.startsWith('Claude 报告这个插件有加载问题：')), id);
    assert.ok(catalog.skills.filter(item => item.pluginId === plugin.id).every(item => item.reason.startsWith('Claude 报告所属插件有加载问题')), id);
    assert.equal(catalog.diagnostics.filter(line => line.startsWith(`插件 ${id}：Claude 报告了加载问题`)).length, 1, id);
  }
  assert.equal(catalog.plugins.filter(item => item.warnings).length, 4);
  result = { passed: true, cli: (await claude('--version')).trim(), compared, reports };
} catch (error) { result = { passed: false, error: error.stack }; process.exitCode = 1; }
await fs.rm(fixture, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify(result)}\n`);
