import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import collect_evidence as collector


class PublicEvidenceTests(unittest.TestCase):
    def parse(self, records):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'session.jsonl'
            path.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records), encoding='utf-8')
            return collector.read_public_session(path, 'task')

    def records(self, text='public result'):
        return [
            {'type': 'session_meta', 'payload': {'id': 'test', 'cwd': '/fixture'}},
            {'type': 'turn_context', 'payload': {'model': 'test-model', 'effort': 'high'}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant',
                'phase': 'final', 'content': [{'type': 'output_text', 'text': text}]}},
            {'type': 'event_msg', 'payload': {'type': 'task_complete'}},
        ]

    def test_unicode_separators_are_data_not_record_boundaries(self):
        result = self.parse(self.records('one\u0085two\u2028three\u2029four'))
        self.assertEqual(result['finals'], ['one\u0085two\u2028three\u2029four'])
        encoded = collector.public_jsonl(result['public'])
        self.assertEqual(len(encoded.splitlines()), 1)
        self.assertEqual(json.loads(encoded)['content'][0]['text'], result['finals'][0])

    def test_private_reasoning_and_initial_context_never_exported(self):
        records = self.records()
        records[:0] = [
            {'type': 'response_item', 'payload': {'type': 'reasoning', 'summary': ['PRIVATE_REASONING']}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant', 'channel': 'analysis',
                'content': [{'text': 'PRIVATE_ANALYSIS'}]}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'developer',
                'content': [{'text': 'PRIVATE_INITIAL_CONTEXT'}]}},
        ]
        result = self.parse(records)
        self.assertNotIn('PRIVATE_', json.dumps(result))
        self.assertEqual(len(result['context_fingerprints']), 1)

    def test_missing_final_or_completion_rejected(self):
        for records in (self.records()[:-1], self.records()[:2] + self.records()[-1:]):
            with self.assertRaises(RuntimeError):
                self.parse(records)

    def test_typed_private_blocks_stripped_from_final_and_commentary(self):
        for channel in ('commentary', 'final', 'final_answer'):
            for typ in ('thinking', 'redacted_thinking', 'reasoning', 'analysis', 'reasoning_text'):
                with self.subTest(channel=channel, typ=typ):
                    records = self.records()
                    content = [{'type': 'output_text', 'text': ' public\u0085\u2028text\n'},
                               {'type': typ, 'text': 'PRIVATE_TEXT', 'thinking': 'PRIVATE_THINKING'},
                               {'type': 'output_text', 'text': ' second ', 'opaque': {'type': 'thinking',
                                                                                  'text': 'PRIVATE_NESTED'}}]
                    records.insert(2, {'type': 'response_item', 'payload': {'type': 'message',
                        'role': 'assistant', 'channel': channel, 'content': content}})
                    result = self.parse(records)
                    self.assertNotIn('PRIVATE_', json.dumps(result))
                    self.assertEqual(result['public'][0]['content'], [content[0],
                                     {'type': 'output_text', 'text': ' second '}])
                    if channel != 'commentary':
                        self.assertEqual(result['finals'][0], ' public\u0085\u2028text\n\n second ')

    def test_private_only_or_empty_final_does_not_satisfy_completion(self):
        for content in ([], [{'type': 'thinking', 'text': 'PRIVATE'}],
                        [{'type': 'output_text', 'channel': 'analysis', 'text': 'PRIVATE'}],
                        [{'type': 'output_text', 'text': ' \n\t'}]):
            with self.subTest(content=content):
                records = self.records()
                records[2]['payload']['content'] = content
                with self.assertRaises(RuntimeError):
                    self.parse(records)

    def test_completion_must_follow_public_final_in_latest_turn(self):
        records = self.records()
        with self.assertRaises(RuntimeError):
            self.parse(records[:2] + [records[3], records[2]])
        for start in ({'type': 'turn_context', 'payload': {'turn_id': 'new-turn'}},
                      {'type': 'event_msg', 'payload': {'type': 'task_started'}},
                      {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user',
                       'content': [{'type': 'input_text', 'text': 'task'}]}}):
            with self.subTest(start=start), self.assertRaises(RuntimeError):
                self.parse(records + [start, records[-1]])
        self.assertEqual(self.parse(records + records[1:])['finals'], ['public result', 'public result'])

    def test_conflicting_private_channel_or_phase_is_not_public(self):
        for channel, phase in (('final', 'analysis'), ('analysis', 'final')):
            with self.subTest(channel=channel, phase=phase):
                records = self.records()
                records[2]['payload'].update(channel=channel, phase=phase)
                with self.assertRaises(RuntimeError):
                    self.parse(records)

    def test_public_user_message_and_refusal_preserved_without_initial_context(self):
        records = self.records()
        records[2]['payload']['content'] = [{'type': 'refusal', 'refusal': 'Public refusal.'}]
        for text in ('PRIVATE_INITIAL_CONTEXT', 'task'):
            records.insert(2, {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user',
                            'content': [{'type': 'input_text', 'text': text}]}})
        result = self.parse(records)
        self.assertNotIn('PRIVATE_', json.dumps(result))
        self.assertEqual([p['role'] for p in result['public']], ['user', 'assistant'])
        self.assertEqual(result['public'][0]['content'], [{'type': 'input_text', 'text': 'task'}])
        self.assertEqual(result['finals'], ['Public refusal.'])

    def test_tool_actions_and_numeric_usage_preserved(self):
        records = self.records()
        records.insert(2, {'type': 'response_item', 'payload': {'type': 'function_call',
            'call_id': 'call-1', 'name': 'read', 'arguments': '{"path":"fixture"}'}})
        records.insert(3, {'type': 'event_msg', 'payload': {'type': 'token_count',
            'info': {'total_token_usage': {'input_tokens': 12, 'output_tokens': 3, 'unknown': 'omit'}}}})
        result = self.parse(records)
        self.assertEqual(result['public'][0]['call_id'], 'call-1')
        self.assertEqual(result['token_usage'], {'input_tokens': 12, 'output_tokens': 3})


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.collector-test ', dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.batch = self.base / 'batch'
        self.batch.mkdir()
        self.sessions = self.base / 'synthetic-sessions'
        self.sessions.mkdir()
        self.root = self.base / 'task'
        (self.root / 'workspace').mkdir(parents=True)
        (self.root / 'harness').mkdir()
        (self.root / 'workspace/result.md').write_bytes(b'changed public artifact\n')
        (self.root / 'workspace/new.txt').write_bytes(b'new public artifact\n')
        (self.root / 'harness/calls.jsonl').write_bytes(b'{"operation":"read"}\n')
        self.task = {'run_key': 'b3-A01-candidate-1', 'agent_id': 'test-agent',
                     'directory': str(self.root), 'message': 'task'}
        self.receipt = {**self.task, 'input_hashes': {
            'workspace/result.md': hashlib.sha256(b'original').hexdigest(),
            'workspace/missing.md': hashlib.sha256(b'missing').hexdigest()}}
        self.records = PublicEvidenceTests().records(' public\u0085one\u2028two\u2029three\n')
        self.records[0]['payload']['id'] = self.task['agent_id']
        self.records.insert(2, {'type': 'response_item', 'payload': {'type': 'function_call',
            'call_id': 'call-1', 'name': 'read', 'arguments': '{"path":"workspace/result.md"}'}})
        self.session = self.sessions / ('rollout-' + self.task['agent_id'] + '.jsonl')
        self.write_inputs()

    def write_json(self, path, value):
        path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

    def write_inputs(self):
        self.write_json(self.batch / 'dispatch.json', [self.task])
        self.write_json(self.batch / (self.task['run_key'] + '-receipt.json'), self.receipt)
        self.session.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in self.records),
                                encoding='utf-8')

    def collect(self):
        with contextlib.redirect_stdout(io.StringIO()):
            collector.collect(self.batch, sessions_root=self.sessions)

    def assert_preflight_rejected(self, exception, pattern):
        with self.assertRaisesRegex(exception, pattern):
            self.collect()
        self.assertFalse((self.batch / 'evidence').exists())
        self.assertFalse((self.batch / 'evidence-index.json').exists())

    def test_collect_preserves_public_evidence_and_input_diff_semantics(self):
        (self.root / 'workspace/alias.md').symlink_to('result.md')
        self.collect()
        dest = self.batch / 'evidence' / self.task['run_key']
        self.assertEqual((dest / 'final.md').read_bytes(), ' public\u0085one\u2028two\u2029three\n\n'.encode())
        trace = (dest / 'public-trace.jsonl').read_text(encoding='utf-8')
        self.assertEqual(len(trace.splitlines()), 2)
        self.assertEqual(json.loads(trace.splitlines()[1])['content'][0]['text'],
                         ' public\u0085one\u2028two\u2029three\n')
        self.assertIn('"call_id": "call-1"', (dest / 'tool-calls.md').read_text(encoding='utf-8'))
        for rel in ('workspace/result.md', 'workspace/new.txt', 'workspace/alias.md', 'harness/calls.jsonl'):
            self.assertEqual((dest / rel).read_bytes(), (self.root / rel).read_bytes())
        index = json.loads((self.batch / 'evidence-index.json').read_bytes())
        self.assertEqual(index, [json.loads((dest / 'metadata.json').read_bytes())])
        self.assertEqual(index[0]['changed_inputs'], ['workspace/result.md'])
        self.assertEqual(index[0]['missing_inputs'], ['workspace/missing.md'])
        self.assertEqual(index[0]['new_files'], ['harness/calls.jsonl', 'workspace/alias.md', 'workspace/new.txt'])
        self.assertEqual(index[0]['public_tool_call_count'], 1)
        before = {p.relative_to(self.batch): p.read_bytes() for p in self.batch.rglob('*') if p.is_file()}
        with self.assertRaises(FileExistsError):
            self.collect()
        self.assertEqual(before, {p.relative_to(self.batch): p.read_bytes()
                                 for p in self.batch.rglob('*') if p.is_file()})

    def test_duplicate_dispatch_agent_or_run_key_rejected(self):
        for second in (dict(self.task, run_key='other'), dict(self.task, agent_id='other')):
            with self.subTest(second=second):
                self.write_json(self.batch / 'dispatch-extra.json', [second])
                self.assert_preflight_rejected(ValueError, 'duplicate dispatch')

    def test_no_dispatch_or_incomplete_session_rejected(self):
        self.write_json(self.batch / 'dispatch.json', [])
        self.assert_preflight_rejected(ValueError, 'no actual dispatch')
        self.records.pop()
        self.write_inputs()
        self.assert_preflight_rejected(RuntimeError, 'session incomplete')

    def test_unsafe_dispatch_identifiers_rejected(self):
        original = dict(self.task)
        for field in ('run_key', 'agent_id'):
            for value in ('../escape', '/absolute', '..', '*', 'a/b', 'a\\b', ''):
                with self.subTest(field=field, value=value):
                    self.write_json(self.batch / 'dispatch.json', [{**original, field: value}])
                    self.assert_preflight_rejected(ValueError, 'unsafe ' + field)

    def test_existing_partial_and_dangling_evidence_paths_rejected(self):
        for name in ('evidence', 'evidence-index.json'):
            for dangling in (False, True):
                with self.subTest(name=name, dangling=dangling):
                    path = self.batch / name
                    if dangling:
                        path.symlink_to('absent-target')
                    else:
                        path.write_bytes(b'preserve')
                    with self.assertRaises(FileExistsError):
                        self.collect()
                    self.assertTrue(path.is_symlink() if dangling else path.read_bytes() == b'preserve')
                    path.unlink()

    def test_unsafe_or_mismatched_receipts_rejected_before_writes(self):
        original = dict(self.receipt)
        for rel in ('../outside', '/outside', './workspace/result.md', 'workspace//result.md',
                    'workspace/../result.md', 'workspace\\result.md', '.'):
            with self.subTest(rel=rel):
                self.write_json(self.batch / (self.task['run_key'] + '-receipt.json'),
                                {**original, 'input_hashes': {rel: 'a' * 64}})
                self.assert_preflight_rejected(ValueError, 'unsafe receipt input path')
        self.receipt['directory'] = str(self.base)
        self.write_inputs()
        self.assert_preflight_rejected(ValueError, 'dispatch/receipt identity mismatch')

    def test_outside_dangling_and_recursive_copy_links_rejected(self):
        link = self.root / 'workspace/link'
        for target, pattern in ((self.base, 'out-of-task'), ('absent', 'invalid task symlink'),
                                ('.', 'recursive copied directory')):
            with self.subTest(target=target):
                link.symlink_to(target)
                self.assert_preflight_rejected(ValueError, pattern)
                link.unlink()

    def test_overlapping_or_missing_task_root_rejected(self):
        for directory, pattern in ((self.base, 'overlapping'), (self.batch, 'overlapping'),
                                   (self.base / 'missing', 'absolute existing')):
            with self.subTest(directory=directory):
                self.write_json(self.batch / 'dispatch.json', [{**self.task, 'directory': str(directory)}])
                self.assert_preflight_rejected(ValueError, pattern)

    def test_ambiguous_or_mismatched_session_rejected(self):
        second = self.sessions / ('other-' + self.task['agent_id'] + '.jsonl')
        second.write_bytes(self.session.read_bytes())
        self.assert_preflight_rejected(RuntimeError, 'one exact session')
        second.unlink()
        self.records[0]['payload']['id'] = 'wrong-agent'
        self.write_inputs()
        self.assert_preflight_rejected(ValueError, 'dispatch/session identity mismatch')

    def test_all_tasks_preflight_before_reserving_evidence(self):
        second_root = self.base / 'second-task'
        second_root.mkdir()
        second = {**self.task, 'agent_id': 'other-agent', 'run_key': 'other-run', 'directory': str(second_root)}
        self.write_json(self.batch / 'dispatch.json', [self.task, second])
        self.assert_preflight_rejected(RuntimeError, 'one exact session')

    def test_copy_failure_leaves_no_completion_index_and_refuses_retry(self):
        with patch.object(collector.shutil, 'copytree', side_effect=OSError('synthetic copy failure')):
            with self.assertRaisesRegex(OSError, 'synthetic copy failure'):
                self.collect()
        self.assertTrue((self.batch / 'evidence').is_dir())
        self.assertFalse((self.batch / 'evidence-index.json').exists())
        with self.assertRaises(FileExistsError):
            self.collect()


if __name__ == '__main__':
    unittest.main()
