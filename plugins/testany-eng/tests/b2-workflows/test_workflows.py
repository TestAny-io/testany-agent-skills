"""Offline packaging and fixture invariants; behavioral verdicts need public traces."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PLUGIN = ROOT / 'plugins/testany-eng'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class WorkflowTests(unittest.TestCase):
    def test_prototype_templates_do_not_restore_blanket_gate_stops(self):
        directory = PLUGIN / 'skills/prototype-reviewer'
        root = (directory / 'SKILL.md').read_text()
        self.assertNotIn('交付摘要缺失 → P1', root)
        self.assertIn('交付摘要未提供 → evidence_gap', root)
        chinese = (directory / 'references/report-templates.md').read_text()
        english = (directory / 'references/report-templates.en.md').read_text()
        self.assertNotIn('无 P0 可继续', chinese)
        self.assertNotIn('No P0 to continue', english)
        self.assertIn('evidence_gap', chinese)
        self.assertIn('not automatically P1', english)

    def test_split_hld_guidance_keeps_workflow_outside_code_fences(self):
        for relative in ('skills/hld-writer/SKILL.md', 'skills/hld-writer/references/prd-splitting.md'):
            inside = False
            headings = []
            for line in (PLUGIN / relative).read_text().splitlines():
                if line.startswith('```'):
                    inside = not inside
                elif not inside and line.startswith('## '):
                    headings.append(line)
            self.assertFalse(inside, relative)
            self.assertIn('## 正式设计工作流程' if relative.endswith('SKILL.md') else '## PRD 拆分为多个 HLD（1:N 场景）', headings)

    def test_media_mode_links_resolve_from_installed_prompt_locations(self):
        media = ROOT / 'plugins/testany-mrkt/skills/media-writer'
        prompts = list((media / 'references/prompts').glob('*.md'))
        self.assertEqual(len(prompts), 15)
        for prompt in prompts:
            self.assertIn('](../execution-modes.md)', prompt.read_text())
            self.assertTrue((prompt.parent / '../execution-modes.md').is_file())
            self.assertNotIn('必须使用 AskUserQuestion 工具', prompt.read_text())
        strategist = (media / 'references/prompts/03-strategist.md').read_text()
        self.assertIn('已知项不重问', strategist)
        self.assertIn('用户指定角度检查点时在该点停下', strategist)
        self.assertIn('references/execution-modes.md', (media / 'SKILL.md').read_text())
        self.assertIn('(execution-modes.md)', (media / 'references/orchestrator-manual.md').read_text())

    def test_shared_references_have_resolvable_links(self):
        import re
        documents = [PLUGIN / 'references' / name for name in (
            'workflow-execution.md', 'review-assurance.md', 'document-amendments.md')]
        documents += [ROOT / 'plugins/testany-mrkt/skills/media-writer' / name for name in (
            'SKILL.md', 'references/execution-modes.md', 'references/orchestrator-manual.md')]
        for document in documents:
            for target in re.findall(r'\]\(([^)]+)\)', document.read_text()):
                if not target.startswith(('https://', '#')):
                    self.assertTrue((document.parent / target.split('#')[0]).exists(), (document, target))

    def test_portable_lint_from_unrelated_cwd_with_spaces(self):
        data = module('lint_fixture', PLUGIN / 'scripts/tests/test_trace_lint.py')
        with tempfile.TemporaryDirectory(prefix='b2 install ') as directory:
            home = Path(directory)
            installed = home / 'plugin path'
            shutil.copytree(PLUGIN / 'scripts', installed / 'scripts', ignore=shutil.ignore_patterns('__pycache__', 'tests'))
            shutil.copytree(PLUGIN / 'references', installed / 'references')
            work = home / 'product path'
            work.mkdir()
            artifact = work / 'PRD draft.md'
            artifact.write_text(data.build_markdown(data.VALID_METADATA))
            before = hashlib.sha256(artifact.read_bytes()).hexdigest()
            proc = subprocess.run([sys.executable, str(installed / 'scripts/trace_lint.py'), '--format', 'json', str(artifact)], cwd=work, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            self.assertIsInstance(json.loads(proc.stdout), dict)
            self.assertEqual(before, hashlib.sha256(artifact.read_bytes()).hexdigest())
            self.assertFalse((work / 'plugins').exists())

    def test_suite_distinct_cases_and_repeats(self):
        cases = json.loads((HERE / 'suite.json').read_text())['cases']
        self.assertEqual(len(cases), len({c['id'] for c in cases}))
        self.assertEqual({c['batch'] for c in cases}, set('abcd'))
        self.assertTrue(all(c['repeats'] >= 1 and c['expect'] for c in cases))

    def test_fixture_index_matches_actual_installed_frontmatter(self):
        exporter = module('b2_exporter', HERE / 'prepare_run.py')
        case = {'id': 'control', 'reuse': 'C07', 'request': 'Only inspect local materials.'}
        target = exporter.materialize(case, 'candidate')
        try:
            index = (target / 'SKILLS.md').read_text()
            self.assertIn('runbook-writer', index)
            self.assertIn('工作流执行约定', (target / 'plugins/testany-eng/skills/runbook-writer/SKILL.md').read_text())
            self.assertFalse(any(p.name in ('suite.json', 'expected.frozen.json', 'REPORT.md') for p in target.rglob('*')))
            self.assertFalse((target / 'plugins/testany-eng/tests').exists())
        finally:
            shutil.rmtree(target)

    def test_export_refuses_nonempty_output(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'keep.txt'
            marker.write_text('keep')
            proc = subprocess.run([sys.executable, str(HERE / 'prepare_run.py'), directory, '--freeze-only'], capture_output=True, text=True)
            self.assertNotEqual(proc.returncode, 0)
            self.assertEqual(marker.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
