"""Exercise bounded JSON navigation through the public CLI, without evidence claims."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

READER = Path(__file__).resolve().parents[2] / 'skills/code-reviewer/scripts/read_machine_context.py'


class MachineContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='machine-context-')
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'state.json'

    def save(self, value):
        self.path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

    def run_reader(self, *args, code=0, budget=6144):
        before = self.path.read_bytes()
        result = subprocess.run([sys.executable, str(READER), str(self.path), *args], capture_output=True)
        self.assertEqual(result.returncode, code, result.stderr.decode(errors='replace'))
        self.assertLessEqual(len(result.stdout), budget)
        self.assertLessEqual(len(result.stderr), budget)
        self.assertEqual(self.path.read_bytes(), before)
        return json.loads(result.stderr if code == 2 else result.stdout)

    def test_large_single_line_defaults_to_inventory(self):
        self.save({'history': '历史' * 100000, 'current': {'next': 'inspect failing consumer'}})
        result = self.run_reader()
        self.assertEqual(result['purpose'], 'navigation_only')
        self.assertFalse(result['complete'])
        self.assertEqual(result['selections'][0]['children'], ['/history', '/current'])
        self.assertNotIn('value', result['selections'][0])

    def test_selected_fields_are_exact_and_unselected_failure_not_claimed_covered(self):
        self.save({'history': 'x' * 500000, 'current': {'next': 'inspect consumer', 'open': ['P1-17']},
                   'other': {'failure': 'not part of this selection'}})
        result = self.run_reader('--pointer', '/current/next', '--pointer', '/current/open')
        self.assertEqual(result['status'], 'SELECTED')
        self.assertTrue(result['complete'])
        self.assertEqual([r['value'] for r in result['selections']], ['inspect consumer', ['P1-17']])
        self.assertEqual(len(result['selections']), 2)
        self.assertFalse(result['source']['prior_pin_checked'])

    def test_oversized_value_is_not_a_truncated_success(self):
        self.save({'current': {'results': [{'failed': True, 'trace': '错' * 5000}]}})
        result = self.run_reader('--pointer', '/current/results')
        row = result['selections'][0]
        self.assertEqual(result['status'], 'PARTIAL')
        self.assertEqual(row['count'], 1)
        self.assertEqual(row['children'], ['/current/results/0'])
        self.assertTrue(row['value_omitted'])
        self.assertNotIn('value', row)
        narrow = self.run_reader('--pointer', '/current/results/0/failed')
        self.assertIs(narrow['selections'][0]['value'], True)

    def test_utf8_budget_applies_to_bytes_not_characters(self):
        self.save({'value': '中文' * 200})
        result = self.run_reader('--pointer', '/value', '--value-bytes', '1000')
        self.assertTrue(result['selections'][0]['value_omitted'])
        self.assertEqual(result['selections'][0]['count'], 400)

    def test_aggregate_limit_keeps_omitted_fields_visible(self):
        self.save({str(i): '文' * 150 for i in range(12)})
        args = [arg for i in range(12) for arg in ('--pointer', '/' + str(i))]
        result = self.run_reader(*args, '--max-bytes', '2300', budget=2300)
        self.assertEqual(len(result['selections']), 12)
        self.assertTrue(any(r['value_omitted'] for r in result['selections']))
        self.assertTrue(any(not r['value_omitted'] for r in result['selections']))

    def test_giant_key_inventory_drops_paths_explicitly(self):
        self.save({'k' * 20000: 'value'})
        result = self.run_reader('--max-bytes', '700', '--value-bytes', '600', budget=700)
        row = result['selections'][0]
        self.assertEqual(row['children_omitted'], 1)
        self.assertNotIn('children', row)
        self.assertFalse(result['complete'])

    def test_pointer_escaping_arrays_and_false_values(self):
        self.save({'a/b~c': [None, False, 0, ''], '': 'empty-key'})
        args = [arg for i in range(4) for arg in ('--pointer', '/a~1b~0c/' + str(i))]
        result = self.run_reader(*args, '--pointer', '/')
        self.assertEqual([r['value'] for r in result['selections']], [None, False, 0, '', 'empty-key'])
        self.assertTrue(result['complete'])

    def test_missing_does_not_hide_available_value(self):
        self.save({'current': 'known', 'items': ['first']})
        result = self.run_reader('--pointer', '/current', '--pointer', '/items/1', code=1)
        self.assertEqual(result['selections'][0]['value'], 'known')
        self.assertTrue(result['selections'][1]['missing'])
        self.assertFalse(result['complete'])

    def test_supplied_prior_pin_and_subsequent_change(self):
        self.save({'current': 'first'})
        pin = hashlib.sha256(self.path.read_bytes()).hexdigest()
        result = self.run_reader('--pointer', '/current', '--sha256', pin)
        self.assertTrue(result['source']['prior_pin_checked'])
        self.save({'current': 'changed'})
        changed = self.run_reader('--pointer', '/current', '--sha256', pin, code=2)
        self.assertEqual(changed['status'], 'UNAVAILABLE')
        self.assertNotIn('selections', changed)

    def test_ambiguous_invalid_json_is_unavailable(self):
        for raw in ('{"a":1,"a":2}', '{"value":NaN}', '{"value":Infinity}', '{bad'):
            with self.subTest(raw=raw):
                self.path.write_text(raw)
                result = self.run_reader('--pointer', '/value', code=2)
                self.assertEqual(result['status'], 'UNAVAILABLE')

    def test_invalid_selector_and_budgets_do_not_dump_source(self):
        self.save({'value': 'private-data-marker'})
        for args in (('--pointer', 'value'), ('--pointer', '/bad~2'),
                     ('--pointer', '/value', '--pointer', '/value'),
                     ('--max-bytes', '999999'), ('--value-bytes', '0')):
            with self.subTest(args=args):
                result = self.run_reader(*args, code=2)
                self.assertEqual(result['status'], 'UNAVAILABLE')
                self.assertNotIn('private-data-marker', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
