import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from export_fixture import BASE, HOME, ROOT, adapter_materials, git_bytes, materialize


class HarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='skill-harness-test-')
        cls.directory = Path(cls.temp.name) / 'task'
        cls.receipt = materialize('C09', cls.directory)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_all_original_skill_roots_present(self):
        self.assertEqual(len(list((self.directory / 'plugins').rglob('SKILL.md'))), 33)

    def test_original_bytes_match(self):
        for name in ('plugins/testany-eng/skills/prd-writer/SKILL.md', 'plugins/testany-mrkt/skills/media-writer/SKILL.md', 'plugins/testany-bot/skills/testany-case/SKILL.md'):
            self.assertEqual((self.directory / name).read_bytes(), git_bytes(name))

    def test_no_grader_or_audit_in_export(self):
        paths = list(self.directory.rglob('*'))
        self.assertFalse(any('grader' in p.parts or 'tests' in p.parts for p in paths))
        for p in paths:
            if p.is_file() and p.suffix in ('.md', '.json', '.py'):
                self.assertNotIn('frozen_before_model_runs', p.read_text())
        self.assertFalse((self.directory / 'REPORT.md').exists())

    def test_refuses_overwrite(self):
        with self.assertRaises(ValueError):
            materialize('C09', self.directory)

    def test_unknown_case_rejected(self):
        with self.assertRaises(ValueError):
            materialize('C99', self.directory / 'other')

    def test_receipt_hashes(self):
        for name, digest in self.receipt['input_hashes'].items():
            self.assertEqual(hashlib.sha256((self.directory / name).read_bytes()).hexdigest(), digest)

    def test_plan_complete_and_paths_valid(self):
        plan = json.loads((HOME / 'change-plan.json').read_text())
        self.assertEqual([f['id'] for f in plan['findings']], [f'F{i:02d}' for i in range(1, 21)])
        self.assertEqual({t for f in plan['findings'] for t in f['acceptance']}, {f'T{i:02d}' for i in range(1, 29)})
        for finding in plan['findings']:
            for path in finding['primary']:
                self.assertTrue((ROOT / path).is_file(), path)
            for required in ('change', 'preserve', 'acceptance', 'depends_on', 'batch'):
                self.assertIn(required, finding)

    def test_grader_and_cases_one_to_one(self):
        cases = json.loads((HOME / 'cases.json').read_text())['cases']
        grader = json.loads((HOME / 'grader/expected.json').read_text())
        self.assertEqual({c['id'] for c in cases}, set(grader['cases']))
        for case in cases:
            self.assertTrue((HOME / 'raw' / case['request']).is_file())
            for path in case['materials']:
                self.assertTrue((HOME / 'raw' / path).is_file())

    def test_adapter_update_does_not_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness'
            adapter_materials('case', harness)
            args = {'case_key': 'A1B2C3D4', 'runtime_uuid': '00000000-0000-4000-8000-000000000001'}
            result = subprocess.run([sys.executable, str(harness / 'mcp.py'), 'testany_update_case', json.dumps(args)], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            state = json.loads((harness / 'state.json').read_text())
            self.assertEqual(state.get('dry_runs', 0), 0)
            self.assertEqual(state['case']['case_meta']['environment_variables'][0]['name'], 'TOKEN')

    def test_adapter_explicit_dry_run_and_terminal(self):
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness'
            adapter_materials('case', harness)
            def call(op, args):
                process = subprocess.run([sys.executable, str(harness / 'mcp.py'), op, json.dumps(args)], text=True, capture_output=True)
                return process.returncode, json.loads(process.stdout)
            code, _ = call('testany_dry_run_case', {'case_key': 'A1B2C3D4'})
            self.assertEqual(code, 2)
            env = json.loads((harness / 'state.json').read_text())['case']['case_meta']['environment_variables']
            env.append({'name': 'MODE', 'type': 'env', 'value': 'preview'})
            code, result = call('testany_update_case', {'case_key': 'A1B2C3D4', 'runtime_uuid': '00000000-0000-4000-8000-000000000001', 'case_meta': {'trigger_method': {'executor': 'python', 'trigger_path': 'main.py'}, 'environment_variables': env}})
            self.assertEqual(code, 0)
            _, started = call('testany_dry_run_case', {'case_key': 'A1B2C3D4'})
            _, terminal = call('testany_get_dry_run_result', {'case_key': 'A1B2C3D4', 'dry_run_id': started['result']['dry_run_id']})
            self.assertEqual(terminal['result']['dry_run_status'], 1)
            self.assertEqual(terminal['result']['dry_run_result']['stdout'], 'TEST_OK')
            self.assertTrue((harness / 'calls.jsonl').is_file())

    def test_adapter_rejects_unavailable_operation(self):
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness'
            adapter_materials('trigger', harness)
            result = subprocess.run([sys.executable, str(harness / 'mcp.py'), 'testany_create_manual_trigger', '{}'], text=True, capture_output=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('unavailable', json.loads(result.stdout)['error'])

    def test_adapter_rejects_cross_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            harness = Path(tmp) / 'harness'
            adapter_materials('case', harness)
            result = subprocess.run([sys.executable, str(harness / 'mcp.py'), 'testany_update_case', '{"workspace_key":"OTHER","case_key":"A1B2C3D4","name":"bad"}'], text=True, capture_output=True)
            self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
