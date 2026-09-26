"""Exercise binding proofs against real Git objects, raw worktrees and filters."""
from __future__ import annotations
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / 'skills/code-reviewer/scripts'
SPEC = importlib.util.spec_from_file_location('candidate_binding', SCRIPTS / 'verify_candidate_binding.py')
BINDING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BINDING)
SNAPSHOT = BINDING.snapshot


class CandidateBindingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='binding-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Binding Test')
        self.git('config', 'user.email', 'binding@example.invalid')
        self.git('config', 'core.autocrlf', 'false')
        self.git('config', 'core.filemode', 'true')
        (self.repo / '.gitignore').write_text('ignored/\n')
        (self.repo / 'source.txt').write_text('initial\n')
        (self.repo / 'delete.txt').write_text('delete me\n')
        self.base = self.commit()

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], text=True,
                              capture_output=True, check=True).stdout.strip()

    def commit(self):
        self.git('add', '-A')
        self.git('commit', '--allow-empty', '-qm', 'candidate')
        return self.git('rev-parse', 'HEAD')

    def capture(self, **kwargs):
        self.payload = SNAPSHOT.create_snapshot(self.repo, self.base, **kwargs)
        self.saved = self.root / 'snapshot.json'
        self.saved.write_text(json.dumps(self.payload))
        return self.payload['snapshot_sha256']

    def compare(self, commit, digest=None):
        return BINDING.compare(self.repo, commit, snapshot_path=self.saved,
                               snapshot_sha256=digest or self.payload['snapshot_sha256'])

    def test_staged_unstaged_untracked_deleted_symlink_and_mode_bind_after_commit(self):
        (self.repo / 'source.txt').write_text('staged\n')
        self.git('add', 'source.txt')
        (self.repo / 'source.txt').write_text('actually reviewed\n')
        (self.repo / 'source.txt').chmod(0o755)
        (self.repo / 'delete.txt').unlink()
        (self.repo / 'new\n文.txt').write_bytes(b'\x00raw\xff')
        (self.repo / 'link').symlink_to('source.txt')
        self.capture()
        result = self.compare(self.commit())
        self.assertEqual(result['result'], 'SAME_CONTENT')
        self.assertEqual(result['changes'], [])
        self.assertFalse(result['approval_granted'])
        self.assertIn('approval_validity_and_newer_blockers', result['unverified_by_tool'])
        self.assertEqual(result['prior_content_sha256'], result['current_content_sha256'])

    def test_wrong_bytes_same_paths_are_not_binding_only(self):
        (self.repo / 'source.txt').write_text('reviewed\n')
        self.capture()
        (self.repo / 'source.txt').write_text('unreviewed\n')
        result = self.compare(self.commit())
        self.assertEqual(result['result'], 'CONTENT_CHANGED')
        self.assertEqual([x['path'] for x in result['changes']], ['source.txt'])

    def test_omitted_untracked_file_cannot_disappear_from_receipt(self):
        (self.repo / 'new.txt').write_text('candidate-owned')
        self.capture()
        (self.repo / 'new.txt').unlink()
        result = self.compare(self.commit())
        self.assertEqual(result['changes'][0]['path'], 'new.txt')
        self.assertIsNone(result['changes'][0]['after'])

    def test_extra_committed_file_not_in_review_is_detected(self):
        self.capture()
        (self.repo / 'surprise.txt').write_text('not reviewed')
        result = self.compare(self.commit())
        self.assertEqual(result['changes'][0]['path'], 'surprise.txt')
        self.assertIsNone(result['changes'][0]['before'])

    def test_git_executable_mode_change_is_detected(self):
        self.capture()
        (self.repo / 'source.txt').chmod(0o755)
        result = self.compare(self.commit())
        self.assertEqual(result['changes'][0]['before']['mode'], '100644')
        self.assertEqual(result['changes'][0]['after']['mode'], '100755')

    def test_symlink_target_is_raw_content(self):
        (self.repo / 'link').symlink_to('source.txt')
        self.capture()
        (self.repo / 'link').unlink()
        (self.repo / 'link').symlink_to('delete.txt')
        self.assertEqual(self.compare(self.commit())['changes'][0]['path'], 'link')

    def test_eol_filter_cannot_hide_raw_byte_changes(self):
        (self.repo / '.gitattributes').write_text('source.txt text eol=lf\n')
        (self.repo / 'source.txt').write_bytes(b'line\r\n')
        self.capture()
        commit = self.commit()
        self.assertEqual(self.git('diff', '--name-only'), '')
        self.assertEqual(self.compare(commit)['changes'][0]['path'], 'source.txt')

    def test_candidate_owned_ignored_is_included(self):
        (self.repo / 'ignored').mkdir()
        (self.repo / 'ignored/input').write_text('required')
        self.capture(candidate_ignored=['ignored/input'])
        self.git('add', '-f', 'ignored/input')
        self.assertEqual(self.compare(self.commit())['result'], 'SAME_CONTENT')

    def test_baseline_change_or_symlink_blocks_proof(self):
        baseline = self.root / 'approval.md'
        baseline.write_text('approved invariant')
        self.capture(mutable_baselines=[baseline])
        commit = self.commit()
        self.assertEqual(self.compare(commit)['result'], 'SAME_CONTENT')
        baseline.write_text('different invariant')
        with self.assertRaisesRegex(BINDING.BindingError, 'baseline changed'):
            self.compare(commit)
        baseline.unlink()
        baseline.symlink_to(self.repo / 'source.txt')
        with self.assertRaises(SNAPSHOT.SnapshotError):
            self.compare(commit)

    def test_pinned_digest_prevents_tampered_or_self_rehashed_snapshot(self):
        old_digest = self.capture()
        self.payload['manifest']['candidate_untracked'] = []
        self.payload['manifest']['head_commit'] = '0' * 40
        self.payload['snapshot_sha256'] = BINDING.digest(self.payload['manifest'])
        self.saved.write_text(json.dumps(self.payload))
        with self.assertRaisesRegex(BINDING.BindingError, 'does not match'):
            self.compare(self.base, old_digest)

    def test_excluded_untracked_wip_is_not_silently_committed(self):
        (self.repo / 'wip.txt').write_text('someone else')
        self.capture(exclusions=['wip.txt'])
        self.assertEqual(self.compare(self.base)['result'], 'SAME_CONTENT')
        result = self.compare(self.commit())
        self.assertEqual(result['result'], 'CONTENT_CHANGED')
        self.assertEqual(result['changes'][0]['path'], 'wip.txt')

    def test_excluded_tracked_wip_must_retain_committed_baseline(self):
        (self.repo / 'delete.txt').write_text('someone else changed this')
        (self.repo / 'source.txt').write_text('reviewed change')
        self.capture(exclusions=['delete.txt'])
        self.git('add', 'source.txt')
        self.git('commit', '-qm', 'candidate only')
        self.assertEqual(self.compare(self.git('rev-parse', 'HEAD'))['result'], 'SAME_CONTENT')
        result = self.compare(self.commit())
        self.assertEqual(result['result'], 'CONTENT_CHANGED')
        self.assertEqual(result['changes'][0]['path'], 'delete.txt')

    def test_gitlink_identity_changes_are_detected(self):
        self.git('update-index', '--add', '--cacheinfo', f'160000,{self.base},module')
        first = self.git('write-tree')
        self.capture()
        self.git('commit', '-qm', 'initial link')
        first_commit = self.git('rev-parse', 'HEAD')
        self.assertEqual(self.compare(first_commit)['result'], 'SAME_CONTENT')
        self.git('update-index', '--cacheinfo', f'160000,{first_commit},module')
        self.git('commit', '-qm', 'update link')
        result = self.compare(self.git('rev-parse', 'HEAD'))
        self.assertNotEqual(first, result['current_binding']['tree'])
        self.assertEqual(result['changes'][0]['path'], 'module')

    def test_immutable_same_tree_has_distinct_commit_binding_and_no_approval(self):
        second = self.commit()
        result = BINDING.compare(self.repo, second, prior_commit=self.base)
        self.assertEqual(result['result'], 'SAME_CONTENT')
        self.assertNotEqual(result['prior_binding']['commit'], result['current_binding']['commit'])
        self.assertEqual(result['prior_binding']['tree'], result['current_binding']['tree'])
        self.assertFalse(result['approval_granted'])

    def test_rejects_symbolic_commit_and_object_replacement(self):
        self.capture()
        with self.assertRaisesRegex(BINDING.BindingError, 'full lowercase'):
            self.compare('HEAD')
        second = self.commit()
        self.git('replace', self.base, second)
        with self.assertRaises(SNAPSHOT.SnapshotError):
            self.compare(second)

    def test_large_blob_stream_and_no_repo_mutation(self):
        (self.repo / 'large.bin').write_bytes(b'abc\x00' * 600000)
        self.capture()
        commit = self.commit()
        before = self.git('status', '--porcelain=v1')
        self.assertEqual(self.compare(commit)['result'], 'SAME_CONTENT')
        self.assertEqual(self.git('status', '--porcelain=v1'), before)

    def test_cli_returns_compact_receipt_and_refuses_overwrite_or_inside_repo_output(self):
        self.capture()
        commit = self.commit()
        output = self.root / 'receipt.json'
        command = [sys.executable, str(SCRIPTS / 'verify_candidate_binding.py'), '--repo', str(self.repo),
                   '--snapshot', str(self.saved), '--snapshot-sha256', self.payload['snapshot_sha256'],
                   '--commit', commit, '--output', str(output)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        summary = json.loads(run.stdout)
        receipt = json.loads(output.read_text())
        self.assertEqual(summary['receipt_sha256'], hashlib.sha256(output.read_bytes()).hexdigest())
        original = output.read_bytes()
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 2)
        self.assertEqual(output.read_bytes(), original)
        command[-1] = str(self.repo / 'receipt.json')
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 2)
        self.assertFalse((self.repo / 'receipt.json').exists())


if __name__ == '__main__':
    unittest.main()
