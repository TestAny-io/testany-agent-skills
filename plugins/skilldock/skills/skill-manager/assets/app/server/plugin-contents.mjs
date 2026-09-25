// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, fail, hash, inside, metadata } from './files.mjs';
import { discoverSkillRoots, readPluginManifest } from './cli.mjs';

// Read the same declared/default roots as the installed library. Names are not
// identities: two skills with the same name remain separate selectable paths.
export async function pluginContents(directory, { marketRoot = directory, entry = {}, roots } = {}) {
  const boundary = await fs.realpath(marketRoot);
  const pluginRoot = await fs.realpath(directory);
  const manifest = await readPluginManifest(directory, boundary);
  roots ||= await discoverSkillRoots(directory, { marketRoot: boundary, entry });
  const seen = new Set(); const seenSkills = new Set(); const skillDetails = []; let visited = 0;
  async function visit(location, depth = 0) {
    if (++visited > 10000 || depth > 20) fail(422, 'SOURCE_LIMIT', '插件技能目录超过读取上限。');
    const real = await fs.realpath(location);
    if (!inside(boundary, real)) fail(422, 'PLUGIN_BOUNDARY', '技能组件链接越出市场根目录。');
    if (!(await fs.stat(real)).isDirectory()) return;
    if (seen.has(real)) return;
    seen.add(real);
    const file = path.join(location, 'SKILL.md');
    if (await exists(file)) {
      const realFile = await fs.realpath(file);
      if (!inside(boundary, realFile)) fail(422, 'PLUGIN_BOUNDARY', '技能文件链接越出市场根目录。');
      if (seenSkills.has(realFile)) return;
      seenSkills.add(realFile);
      const detail = await metadata(location);
      // Codex matches skills.config against the resolved SKILL.md path. A
      // symlink alias must not make an unchecked skill appear enabled natively.
      const relative = path.relative(pluginRoot, realFile).split(path.sep).join('/');
      skillDetails.push({ path: relative, name: detail.name, description: detail.description, digest: hash(detail.content) });
      return;
    }
    for (const child of (await fs.readdir(location, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.name.startsWith('.') || child.name === 'node_modules') continue;
      if (child.isDirectory() || child.isSymbolicLink()) await visit(path.join(location, child.name), depth + 1);
    }
  }
  for (const root of roots) await visit(root);
  const components = [];
  for (const [kind, field, files] of [['commands', 'commands', ['commands']], ['agents', 'agents', ['agents']], ['hooks', 'hooks', ['hooks/hooks.json']], ['mcp', 'mcpServers', ['.mcp.json', 'mcp.json']], ['apps', 'apps', ['.app.json']]]) {
    if (entry[field] || manifest[field]) components.push(kind);
    else for (const file of files) if (await exists(path.join(directory, file))) { components.push(kind); break; }
  }
  const signature = hash(JSON.stringify({ manifest, entry, skills: skillDetails, components }));
  return { skills: skillDetails.map(skill => skill.name), skillDetails: skillDetails.map(({ digest, ...skill }) => skill), components, signature };
}
