#!/usr/bin/env python3
"""Deterministic local MCP-shaped adapter. No network, shell, or real credentials."""
import argparse
import copy
import datetime
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def dispatch(operation, arguments, state):
    case = state.get('case')
    if operation == 'testany_get_my_workspaces':
        return {'workspaces': [{'workspace_key': 'ACME', 'name': 'Acme Sample', 'role': 'admin'}]}
    if operation == 'testany_get_tenant_config':
        return {'deployment_type': 2}
    if operation in ('testany_get_pipeline', 'testany_list_pipelines'):
        if arguments.get('pipeline_key', 'ACME-0001A') != 'ACME-0001A':
            raise ValueError('unknown pipeline')
        pipeline = {'pipeline_key': 'ACME-0001A', 'workspace_key': 'ACME', 'name': 'Billing smoke', 'status': 'ready'}
        return pipeline if operation.endswith('get_pipeline') else {'pipelines': [pipeline]}
    if operation == 'testany_filter_case_runtimes':
        return {'runtimes': [{'runtime_uuid': '00000000-0000-4000-8000-000000000001', 'name': 'sample-runtime', 'available': True}]}
    if case is None:
        raise ValueError('operation unavailable for this profile')
    if arguments.get('case_key', 'A1B2C3D4') != 'A1B2C3D4':
        raise ValueError('unknown case')
    if arguments.get('workspace_key', 'ACME') != 'ACME':
        raise ValueError('unknown workspace')
    if operation == 'testany_get_case':
        return copy.deepcopy(case)
    if operation == 'testany_update_case':
        changes = {k: v for k, v in arguments.items() if k not in ('case_key', 'workspace_key')}
        if not changes:
            raise ValueError('no changes supplied')
        allowed = {'runtime_uuid', 'case_meta', 'description', 'name', 'is_private', 'workspace_keys', 'environments', 'case_labels', 'owned_by', 'case_version'}
        if set(changes) - allowed:
            raise ValueError('unsupported fields: ' + ', '.join(sorted(set(changes) - allowed)))
        # environment_variables replaces the whole collection, matching the skill contract.
        for key, value in changes.items():
            if key == 'case_meta':
                case.setdefault(key, {}).update(value)
            else:
                case[key] = value
        state['updates'] = state.get('updates', 0) + 1
        return {'updated': True, 'case': copy.deepcopy(case)}
    if operation == 'testany_dry_run_case':
        meta = case.get('case_meta', {})
        trigger = meta.get('trigger_method', {})
        if not case.get('runtime_uuid') or trigger.get('executor') != 'python' or trigger.get('trigger_path') != 'main.py':
            raise ValueError('case runtime or trigger_method is incomplete')
        if not any(v.get('name') == 'MODE' and v.get('type', 'env') == 'env' and v.get('value') == 'preview' for v in meta.get('environment_variables', [])):
            raise ValueError('MODE=preview is missing')
        state['dry_runs'] = state.get('dry_runs', 0) + 1
        state['dry_run_id'] = f'DR{state["dry_runs"]:04d}'
        return {'dry_run_id': state['dry_run_id'], 'dry_run_status': 0}
    if operation == 'testany_get_dry_run_result':
        if not state.get('dry_run_id') or arguments.get('dry_run_id') != state['dry_run_id']:
            raise ValueError('unknown dry_run_id')
        return {'dry_run_id': state['dry_run_id'], 'dry_run_status': 1, 'dry_run_result': {'status': 1, 'stdout': 'TEST_OK', 'exit_code': 0}}
    raise ValueError('unknown operation')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation')
    parser.add_argument('arguments', nargs='?', default='{}')
    args = parser.parse_args()
    schema = json.loads((HERE / 'schema.json').read_text())
    state_path = HERE / 'state.json'
    state = json.loads(state_path.read_text())
    arguments = json.loads(args.arguments)
    event = {'time': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'operation': args.operation, 'arguments': arguments}
    try:
        if args.operation not in schema['operations']:
            raise ValueError('tool unavailable: ' + args.operation)
        if not isinstance(arguments, dict):
            raise ValueError('arguments must be an object')
        result = {'ok': True, 'simulation': True, 'result': dispatch(args.operation, arguments, state)}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    except (TypeError, ValueError) as exc:
        result = {'ok': False, 'simulation': True, 'error': str(exc)}
    event['response'] = result
    with (HERE / 'calls.jsonl').open('a') as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if result['ok'] else 2)


if __name__ == '__main__':
    main()
