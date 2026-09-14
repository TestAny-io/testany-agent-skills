import copy
import json
import unittest
from pathlib import Path

from adapter import dispatch


class AdapterTests(unittest.TestCase):
    def test_safe_sync_readback(self):
        state = {'profile':'sync_safe'}
        args = {'import_history_id':'IMP001'}
        preview = dispatch('testany_preview_git_sync',args,state)
        self.assertEqual(preview['changes'][0]['changed_fields'],['script'])
        result = dispatch('testany_confirm_git_sync',args,state)
        self.assertEqual(result['to_commit'],preview['to_commit'])
        self.assertEqual(dispatch('testany_get_git_import',args,state)['last_synced_commit'],result['to_commit'])

    def test_deletion_visible_before_confirm(self):
        state = {'profile':'sync_delete'}
        preview = dispatch('testany_preview_git_sync',{'import_history_id':'IMP001'},state)
        self.assertTrue(any(c['change_type']=='deleted' for c in preview['changes']))
        self.assertNotIn('confirms',state)

    def test_commit_drift(self):
        result = dispatch('testany_preview_git_sync',{}, {'profile':'sync_drift'})
        self.assertEqual(result['to_commit'],'c'*40)

    def test_managed_confirm_rejects_fake_selection(self):
        with self.assertRaises(ValueError):
            dispatch('testany_confirm_git_sync',{'file_selections':[]},{'profile':'sync_safe'})

    def test_rejects_wrong_object(self):
        with self.assertRaises(ValueError):
            dispatch('testany_get_execution',{'workspace_key':'OTHER'},{'profile':'execution'})

    def test_wait_never_completes_itself(self):
        state = {'profile':'execution'}
        for _ in range(3):
            self.assertEqual(dispatch('testany_get_execution',{},state)['status'],0)
        self.assertEqual(state['observations'],3)

    def test_failed_readback_does_not_hide_creation(self):
        state = {'profile':'trigger_partial'}
        dispatch('testany_create_gatekeeper',{},state)
        with self.assertRaises(ValueError):
            dispatch('testany_get_gatekeeper',{},state)
        self.assertEqual(state['creates'],1)

    def test_suite_grader_ids(self):
        root = Path(__file__).resolve().parent
        cases = json.loads((root / 'suite.json').read_text())['cases']
        expected = json.loads((root / 'grader/expected.json').read_text())['cases']
        self.assertEqual({c['id'] for c in cases},set(expected))
        self.assertEqual(sum(c['repeats'] for c in cases),21)


if __name__ == '__main__':
    unittest.main()
