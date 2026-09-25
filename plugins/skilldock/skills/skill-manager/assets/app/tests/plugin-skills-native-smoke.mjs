// Explicit host test: SKILLDOCK_CODEX_BIN must name an installed Codex CLI.
// The CLI and app-server use only disposable configuration and harmless skills.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createService } from '../server/service.mjs';
import { writeJson } from '../server/files.mjs';

const cli = process.env.SKILLDOCK_CODEX_BIN;
assert.ok(cli && path.isAbsolute(cli), 'Set SKILLDOCK_CODEX_BIN to the absolute Codex CLI path.');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-native-selection-')));
const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), projectDir = path.join(root, 'project');
const actualCodexHome = path.join(home, '.codex-data');
await fs.mkdir(actualCodexHome, { recursive: true }); await fs.symlink('.codex-data', codexHome); await fs.mkdir(projectDir);
const service = await createService({ home, codexHome, projectDir, stateDir: path.join(root, 'state'), codexBin: cli, scheduler: false, background: false });
const act = (action, fields = {}) => service.action({ mode: 'local', action, ...fields });

async function nativeSkills() {
  const child = spawn(cli, ['app-server', '--stdio'], { cwd: projectDir, env: { ...process.env, CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let sequence = 0; const pending = new Map();
  child.stderr.on('data', () => {});
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await request('initialize', { clientInfo: { name: 'skilldock-selection-test', version: '0.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const result = await request('skills/list', { cwds: [projectDir], forceReload: true });
    return result.data.flatMap(item => item.skills).filter(item => item.name.startsWith('selection-smoke:')).map(item => ({ name: item.name, path: item.path, enabled: item.enabled }));
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    child.kill(); let timer; await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); clearTimeout(timer);
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
    lines.close();
  }
}

try {
  for (const route of ['marketplace', 'direct', 'marketplace-alias']) {
    const market = path.join(root, route), source = path.join(market, 'plugin');
    const skill = async name => { const directory = path.join(source, 'skills', name); await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Isolated selection validation\n---\nDo nothing.\n`); };
    const manifest = version => writeJson(path.join(source, '.codex-plugin/plugin.json'), { name: 'selection-smoke', version, skills: './skills/' });
    await skill('alpha'); await skill('beta'); await manifest('1.0.0');
    const withAlias = route.endsWith('-alias');
    if (withAlias) await fs.symlink('beta', path.join(source, 'skills/00-beta-alias'));
    let preview;
    if (route.startsWith('marketplace')) {
      const marketName = `selection-smoke-${route}`;
      await writeJson(path.join(market, '.agents/plugins/marketplace.json'), { name: marketName, plugins: [{ name: 'selection-smoke', source: './plugin' }] });
      await act('marketplace.add', { sourceType: 'local', source: market });
      preview = (await act('plugin.previewMarketplace', { id: `selection-smoke@${marketName}` })).pluginPreview;
      await act('plugin.install', { id: preview.pluginId, previewId: preview.id, enabledSkills: ['skills/alpha/SKILL.md'] });
    } else {
      preview = (await act('plugin.previewInstall', { sourceType: 'local', source })).pluginPreview;
      await act('plugin.installSource', { previewId: preview.id, enabledSkills: ['skills/alpha/SKILL.md'] });
    }
    assert.equal(preview.skillDetails.length, 2);
    const plugin = (await service.snapshot('local', true)).plugins.find(item => item.name === 'selection-smoke' && item.installed);
    assert.equal(plugin.enabled, true);
    let skills = await nativeSkills();
    assert.equal(skills.length, 2); assert.equal(skills.find(item => item.name.endsWith(':alpha')).enabled, true); assert.equal(skills.find(item => item.name.endsWith(':beta')).enabled, false);
    const installed = (await service.snapshot('local', true)).skills.filter(item => item.pluginId === plugin.id);
    const alpha = installed.find(item => item.name === 'alpha'), beta = installed.find(item => item.name === 'beta');
    await act('skill.toggle', { id: beta.id, enabled: true });
    await act('skill.toggle', { id: alpha.id, enabled: false });
    skills = await nativeSkills();
    assert.deepEqual(skills.filter(item => item.enabled).map(item => item.name), ['selection-smoke:beta']);
    assert.equal((await service.snapshot('local', true)).plugins.find(item => item.id === plugin.id).enabled, true);
    await act('skill.toggle', { id: alpha.id, enabled: true });
    await act('skill.toggle', { id: beta.id, enabled: false });
    await manifest('1.1.0'); await skill('gamma');
    const target = { kind: 'plugin', id: plugin.id };
    const update = (await act('update.check', { target })).updateItem; assert.equal(update.status, 'available');
    // This host omits symlinks when caching a native package. Preserve the
    // existing strict update readback guard; never claim a full package match.
    if (withAlias) await assert.rejects(act('update.apply', { target, previewId: update.previewId }), { code: 'READBACK_FAILED' });
    else await act('update.apply', { target, previewId: update.previewId });
    skills = await nativeSkills(); assert.equal(skills.length, 3);
    assert.deepEqual(skills.filter(item => item.enabled).map(item => item.name), ['selection-smoke:alpha']);
    assert.ok(skills.every(item => item.path.includes('/1.1.0/')));
    await act('plugin.remove', { id: plugin.id });
    process.stdout.write(withAlias
      ? `${route}: PASS — aliases use the canonical skill selection; omitted cache links remain an explicit update readback failure\n`
      : `${route}: PASS — native installation and native skill loading preserve the selection across an update\n`);
  }
} finally { await service.close(); await fs.rm(root, { recursive: true, force: true }); }
