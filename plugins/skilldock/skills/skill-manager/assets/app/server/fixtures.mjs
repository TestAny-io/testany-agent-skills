import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson, identity, inspectTree, now, captureDirectoryRoot, verifyDescendantDirectory } from './files.mjs';
import { runProcess } from './cli.mjs';

export const emptyRegistry = () => ({ version: 1, sources: {}, activity: [], plugins: {}, marketplaces: {} });

async function skill(directory, name, description, body = '') {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${body || description}\n`);
}
async function marketplace(directory, name, pluginName) {
  const plugin = path.join(directory, 'plugins', pluginName);
  await fs.mkdir(path.join(directory, '.agents/plugins'), { recursive: true });
  await fs.mkdir(path.join(plugin, '.codex-plugin'), { recursive: true });
  await skill(path.join(plugin, 'skills', `${pluginName}-review`), `${pluginName}-review`, '演练插件中的审查技能，用来验证按插件管理。');
  await writeJson(path.join(plugin, '.codex-plugin/plugin.json'), { name: pluginName, version: '1.0.0', description: '文件驱动的演练插件', skills: './skills/' });
  await writeJson(path.join(directory, '.agents/plugins/marketplace.json'), { name, plugins: [{ name: pluginName, source: { source: 'local', path: `./plugins/${pluginName}` } }] });
}

export async function initializeSandbox(root) {
  const marker = path.join(root, '.initialized-v1');
  const codexHome = path.join(root, 'codex'); const skills = path.join(codexHome, 'skills');
  const project = path.join(root, 'project'); const sources = path.join(root, 'sources');
  const examples = { skillSource: path.join(sources, 'release-notes'), marketplaceSource: path.join(sources, 'community-market'), gitSource: path.join(sources, 'git-skill'), legacySource: path.join(sources, 'api-notes') };
  if (!(await exists(marker))) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await skill(path.join(skills, 'design-review'), 'design-review', '从用户目标、信息层级与可访问性审查界面。', '## 使用方式\n\n检查页面的主要任务、控件反馈和键盘可达性。');
    await skill(path.join(skills, 'test-planner'), 'test-planner', '把验收标准整理成清晰、可执行的测试清单。');
    await skill(path.join(skills, 'api-notes'), 'api-notes', '记录接口契约与集成过程中的关键决定。');
    await skill(path.join(skills, '.system', 'system-helper'), 'system-helper', '平台内置演练技能，展示受保护状态。');
    await skill(path.join(project, '.agents/skills', 'workspace-guide'), 'workspace-guide', '只在当前项目中使用的团队协作说明。');
    const installedUpdate = path.join(skills, 'writing-assistant');
    const updateSource = path.join(sources, 'writing-assistant');
    await skill(installedUpdate, 'writing-assistant', '帮助整理技术文档，保持表达清晰。', '第一版：整理文档结构。');
    await skill(updateSource, 'writing-assistant', '帮助整理技术文档，保持表达清晰。', '第二版：整理文档结构，补充检查清单和验收证据。');
    await fs.writeFile(path.join(updateSource, 'checklist.md'), '# 文档检查清单\n\n- 目标明确\n- 例子可运行\n- 记录验证结果\n');
    await skill(examples.skillSource, 'release-notes', '把已验证的改动整理成面向用户的发布说明。', '## 使用示例\n\n请根据本次变更生成发布说明，分别说明新功能、修复和验证。');
    await skill(examples.gitSource, 'git-workflow', '从 Git 来源导入的独立技能。');
    try {
      for (const args of [['init', '--quiet'], ['add', '--', 'SKILL.md'], ['-c', 'user.name=SkillDock fixture', '-c', 'user.email=fixture@localhost', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Initial isolated fixture']]) await runProcess('git', args, { cwd: examples.gitSource, timeout: 5000 });
    } catch { delete examples.gitSource; }
    await marketplace(path.join(sources, 'starter-market'), 'starter-market', 'starter-tools');
    await marketplace(examples.marketplaceSource, 'community-market', 'community-tools');
    await fs.writeFile(path.join(codexHome, 'config.toml'), `# SkillDock 隔离演练配置，不是本机 Codex 配置。\nmodel = "sandbox-fixture"\n\n[[skills.config]]\npath = ${JSON.stringify(path.join(skills, 'api-notes/SKILL.md'))}\nenabled = false\n`);
    const registry = emptyRegistry(); const tree = await inspectTree(installedUpdate);
    registry.sources[identity(installedUpdate)] = { directory: installedUpdate, source: updateSource, sourceType: 'local', subpath: '.', fingerprint: tree.fingerprint, files: tree.entries, installedAt: now() };
    registry.marketplaces['starter-market'] = { source: path.join(sources, 'starter-market'), type: 'local', root: path.join(sources, 'starter-market') };
    await writeJson(path.join(root, 'registry.json'), registry);
    await fs.writeFile(marker, `${now()}\n`, { mode: 0o600 });
  }
  // Add the round-one UAT source to existing demos without replacing any installed skill or edited source.
  if (!(await exists(examples.legacySource))) {
    await verifyDescendantDirectory(await captureDirectoryRoot(root), examples.legacySource);
    await skill(examples.legacySource, 'api-notes', '记录接口契约与集成过程中的关键决定。', '第二版：记录接口契约，并补充变更原因和验收结果。');
  }
  if (!(await exists(path.join(sources, 'git-skill/.git/HEAD')))) delete examples.gitSource;
  return { root, codexHome, home: root, project, config: path.join(codexHome, 'config.toml'), skills, registryFile: path.join(root, 'registry.json'), examples };
}
