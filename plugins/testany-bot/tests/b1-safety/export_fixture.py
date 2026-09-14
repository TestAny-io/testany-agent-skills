"""Export old or working-tree skill bytes without audit/grader/test context."""
import argparse
import hashlib
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

HOME = Path(__file__).resolve().parent
ROOT = HOME.parents[3]
ORIGINAL = ROOT / 'plugins/testany-eng/tests/gpt6-adaptation/export_fixture.py'
spec = importlib.util.spec_from_file_location('original_export', ORIGINAL)
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)


def materialize(case_id, variant, destination):
    case = next(c for c in json.loads((HOME / 'suite.json').read_text())['cases'] if c['id'] == case_id)
    root = Path(destination).resolve()
    original.materialize(case.get('reuse', 'C08'), root)
    if variant == 'candidate':
        # Overlay only runtime files, including new helpers, never test or grader data.
        for plugin in ('testany-eng','testany-bot','testany-llm','testany-mrkt'):
            for path in (ROOT / 'plugins' / plugin).rglob('*'):
                if path.is_file() and not any(p in ('tests','grader','__pycache__') for p in path.relative_to(ROOT).parts):
                    target = root / path.relative_to(ROOT)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(path.read_bytes())
    if case['profile'] != 'original':
        (root / 'request.md').write_text(case['request'] + '\n')
        profile = case['profile']
        operations = {
            'testany_get_my_workspaces':{},'testany_get_tenant_config':{},
            'testany_get_pipeline':{'pipeline_key':'string','workspace_key':'string'},
            'testany_list_pipelines':{'workspace_key':'string'}
        }
        if profile in ('execution','run_now'):
            operations.update({op:{'execution_key':'string'} for op in ('testany_get_execution','testany_refresh_execution','testany_cancel_execution')})
            operations['testany_execute_pipeline'] = {'pipeline_key':'string','workspace_key':'string'}
        if profile == 'dry_wait':
            operations.update({'testany_get_case':{'case_key':'string'},'testany_get_dry_run_result':{'case_key':'string','dry_run_id':'string'},'testany_dry_run_case':{'case_key':'string'}})
        if profile.startswith('sync_'):
            operations.update({op:{'import_history_id':'string'} for op in ('testany_get_git_import','testany_preview_git_sync','testany_confirm_git_sync','testany_list_git_sync_records')})
            operations['testany_get_git_sync_record'] = {'record_id':'string'}
            operations['testany_retry_git_sync'] = {'sync_record_id':'string'}
        if profile == 'trigger_partial':
            operations['testany_create_gatekeeper'] = {'workspace':'string','name':'string','pipelines':'array'}
            operations.update({op:{'gatekeeper_key':'string'} for op in ('testany_get_gatekeeper','testany_get_gatekeeper_pipelines','testany_delete_gatekeeper')})
        (root / 'harness/schema.json').write_text(json.dumps({'simulation':True,'operations':operations}, ensure_ascii=False, indent=2) + '\n')
        (root / 'harness/state.json').write_text(json.dumps({'profile':profile}) + '\n')
        shutil.copyfile(HOME / 'adapter.py', root / 'harness/mcp.py')
        if profile.startswith('log_'):
            command = "curl -sS -X GET 'https://00000000-0000-4000-8000-000000000001.tr.testany.io/api/v2/logproxy/internal/view?sign=FAKE_SIGNATURE' -H 'Authorization: Bearer FAKE_TOKEN'"
            if profile == 'log_invalid':
                command += '; printf CHAIN > workspace/marker'
            (root / 'workspace/request.json').write_text(json.dumps({'curlCommand':command}) + '\n')
    hashes = {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
    return {'case_id':case_id,'variant':variant,'entry':str(root / 'ENTRY.md'),'directory':str(root),'input_hashes':hashes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('case_id')
    parser.add_argument('--variant', choices=('original','candidate'), required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    receipt = materialize(args.case_id, args.variant, tempfile.mkdtemp(prefix='skill-task-'))
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k:receipt[k] for k in ('case_id','variant','entry','directory')}))


if __name__ == '__main__':
    main()
