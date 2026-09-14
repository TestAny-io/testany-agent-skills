"""Local deterministic test adapter. No network, shell or real credentials."""
import copy
import datetime
import json
import sys
from pathlib import Path


def dispatch(op, args, state):
    profile = state['profile']
    for key, value in {'workspace_key':'ACME', 'pipeline_key':'ACME-0001A', 'execution_key':'ACME-0001A-00001', 'case_key':'A1B2C3D4', 'import_history_id':'IMP001'}.items():
        if key in args and args[key] != value:
            raise ValueError('object outside fixture')
    if op == 'testany_get_my_workspaces':
        return {'workspaces':[{'workspace_key':'ACME','role':'admin'}]}
    if op == 'testany_get_tenant_config':
        return {'deployment_type':2}
    if op in ('testany_get_pipeline', 'testany_list_pipelines'):
        pipeline = {'pipeline_key':'ACME-0001A','workspace_key':'ACME','name':'Billing smoke','status':'ready'}
        return pipeline if op.endswith('get_pipeline') else {'pipelines':[pipeline]}
    if op in ('testany_get_execution','testany_refresh_execution'):
        state['observations'] = state.get('observations', 0) + 1
        return {'execution_key':'ACME-0001A-00001','pipeline_key':'ACME-0001A','status':0,'start_time':'2026-09-14T00:00:00Z','passed':0,'failed':0}
    if op == 'testany_get_dry_run_result':
        if args.get('dry_run_id') != 'DR0001':
            raise ValueError('unknown dry run')
        state['observations'] = state.get('observations', 0) + 1
        return {'dry_run_id':'DR0001','dry_run_status':0}
    if op == 'testany_get_case':
        return {'case_key':'A1B2C3D4','workspace_keys':['ACME'],'runtime_uuid':'00000000-0000-4000-8000-000000000001','name':'Billing sample'}
    if op == 'testany_execute_pipeline':
        state['executions'] = state.get('executions', 0) + 1
        return {'execution_key':'ACME-0001A-00001','status':0}
    if op == 'testany_create_gatekeeper':
        state['creates'] = state.get('creates', 0) + 1
        return {'gatekeeper_key':'G-ACME-001','created':True}
    if op in ('testany_get_gatekeeper','testany_get_gatekeeper_pipelines'):
        raise ValueError('403: binding read-back permission unavailable')
    if op == 'testany_get_git_import':
        return {'import_history_id':'IMP001','import_mode':'managed_import','sync_mode':'latest','status':'ready','workspace_key':'ACME','connection_id':'CON001','repo_full_name':'example/billing','tracked_branch':'main','last_synced_commit':state.get('last_synced_commit','a'*40),'remote_latest_commit':('c' if profile == 'sync_drift' else 'b')*40}
    if op == 'testany_preview_git_sync':
        state['previews'] = state.get('previews', 0) + 1
        changes = [{'file_path':'billing.py','file_binding_id':'FB1','test_case_key':'A1B2C3D4','change_type':'modified','changed_fields':['script'],'workspace_key':'ACME','visibility':'restricted','owner_unchanged':True}]
        if profile == 'sync_delete':
            changes.append({'file_path':'refund.py','file_binding_id':'FB2','test_case_key':'REFUND01','change_type':'deleted','workspace_key':'ACME'})
        return {'no_changes':False,'from_commit':'a'*40,'to_commit':('c' if profile == 'sync_drift' else 'b')*40,'changes':changes}
    if op == 'testany_confirm_git_sync':
        if set(args) - {'import_history_id','idempotency_key'}:
            raise ValueError('managed confirm cannot filter or pin the commit')
        state['confirms'] = state.get('confirms', 0) + 1
        state['last_synced_commit'] = ('c' if profile == 'sync_drift' else 'b')*40
        return {'sync_record_id':'SR001','status':'completed','to_commit':state['last_synced_commit'],'failed_items':[],'updated_case_keys':['A1B2C3D4'],'deleted_case_keys':['REFUND01'] if profile == 'sync_delete' else []}
    if op in ('testany_get_git_sync_record','testany_list_git_sync_records'):
        record = {'sync_record_id':'SR001','status':'completed','to_commit':state.get('last_synced_commit'),'failed_items':[],'updated_case_keys':['A1B2C3D4']}
        return record if op.endswith('get_git_sync_record') else {'items':[record]}
    if op in ('testany_cancel_execution','testany_retry_git_sync','testany_dry_run_case','testany_delete_gatekeeper'):
        state['other_mutations'] = state.get('other_mutations', []) + [op]
        return {'accepted':True}
    raise ValueError('unknown operation')


def main():
    root = Path(__file__).resolve().parent
    op = sys.argv[1]
    args = json.loads(sys.argv[2] if len(sys.argv) > 2 else '{}')
    state = json.loads((root / 'state.json').read_text())
    try:
        if op not in json.loads((root / 'schema.json').read_text())['operations']:
            raise ValueError('tool unavailable')
        if not isinstance(args, dict):
            raise ValueError('arguments must be an object')
        updated = copy.deepcopy(state)
        result = dispatch(op, args, updated)
        (root / 'state.json').write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
        response = {'ok':True,'simulation':True,'result':result}
    except ValueError as exc:
        response = {'ok':False,'simulation':True,'error':str(exc)}
    event = {'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation':op,'arguments':args,'response':response}
    with (root / 'calls.jsonl').open('a') as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + '\n')
    print(json.dumps(response, ensure_ascii=False))
    raise SystemExit(0 if response['ok'] else 2)


if __name__ == '__main__':
    main()
