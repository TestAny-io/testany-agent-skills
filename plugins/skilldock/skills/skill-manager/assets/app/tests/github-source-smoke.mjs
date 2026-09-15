// Opt-in public network test. Reads GitHub and writes only a new temporary fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createService } from '../server/service.mjs';

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-github-url-')));
const home = path.join(root, 'home'); const project = path.join(root, 'project');
const directory = path.join(home, '.codex/skills/prompt-optimizer');
await fs.mkdir(directory, { recursive: true }); await fs.mkdir(project);
await fs.writeFile(path.join(directory, 'SKILL.md'), '---\nname: prompt-optimizer\ndescription: Existing skill fixture.\n---\nOld local contents.\n');
const service = await createService({ home, projectDir: project, codexHome: path.join(home, '.codex'), stateDir: path.join(root, 'state'), scheduler: false,
  adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
const url = 'https://github.com/TestAny-io/testany-agent-skills/tree/main/plugins/testany-llm/skills/prompt-optimizer';
const action = request => service.action({ mode: 'local', ...request });
try {
  const skill = (await service.snapshot('local')).skills.find(item => item.name === 'prompt-optimizer');
  const preview = (await action({ action: 'skill.previewSource', id: skill.id, sourceType: 'git', source: url })).sourcePreview;
  assert.equal(preview.source, 'https://github.com/TestAny-io/testany-agent-skills.git');
  assert.equal(preview.ref, 'main'); assert.equal(preview.subpath, 'plugins/testany-llm/skills/prompt-optimizer'); assert.match(preview.commit, /^[a-f0-9]{40}$/);
  const diff = (await action({ action: 'preview.diff', previewId: preview.id, path: 'SKILL.md' })).diff;
  assert.equal(diff.status, 'text'); assert.ok(diff.additions > 0 && diff.deletions > 0);
  await action({ action: 'skill.connectSource', id: skill.id, previewId: preview.id });
  assert.match(await fs.readFile(skill.path, 'utf8'), /Old local contents/);
  const connected = (await service.snapshot('local')).skills.find(item => item.id === skill.id);
  assert.equal(connected.sourceInfo.source, preview.source); assert.equal(connected.sourceInfo.subpath, preview.subpath);
  const checked = (await action({ action: 'skill.checkUpdate', id: skill.id })).update;
  assert.equal(checked.available, true);
  process.stdout.write(JSON.stringify({ passed: true, fixture: root, url, canonicalSource: preview.source, subpath: preview.subpath, ref: preview.ref, commit: preview.commit,
    diff: { status: diff.status, additions: diff.additions, deletions: diff.deletions }, sourcePreservedForNextUpdate: true, localContentsUnchanged: true }, null, 2) + '\n');
} finally { await service.close(); }
