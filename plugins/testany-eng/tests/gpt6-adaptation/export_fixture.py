#!/usr/bin/env python3
"""Export frozen original skills and one neutral task, without grader or audit."""
import argparse
import functools
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

HOME = Path(__file__).resolve().parent
ROOT = HOME.parents[3]
BASE = json.loads((HOME / 'change-plan.json').read_text())['baseline_commit']


@functools.cache
def git_bytes(path):
    return subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT)


@functools.cache
def snapshot_files():
    sources = [p['source'].removeprefix('./') for p in json.loads(git_bytes('.claude-plugin/marketplace.json'))['plugins']]
    tracked = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE], cwd=ROOT).decode().splitlines()
    return [p for p in tracked if any(p.startswith(s + '/') for s in sources) and not any(x in ('tests', 'grader', '__pycache__') for x in Path(p).parts) and not p.endswith('.pyc')]


def adapter_materials(profile, harness):
    operations = {
        'testany_get_my_workspaces': {},
        'testany_get_tenant_config': {},
        'testany_get_pipeline': {'pipeline_key': 'string', 'workspace_key': 'string'},
        'testany_list_pipelines': {'workspace_key': 'string'},
    }
    state = {'profile': profile}
    if profile == 'case':
        operations.update({
            'testany_filter_case_runtimes': {},
            'testany_get_case': {'case_key': 'string'},
            'testany_update_case': {'case_key': 'string', 'runtime_uuid': 'optional string', 'case_meta': {'trigger_method': {'executor': 'string', 'trigger_path': 'string', 'trigger_command': 'optional string'}, 'environment_variables': 'array; whole collection replacement'}},
            'testany_dry_run_case': {'case_key': 'string'},
            'testany_get_dry_run_result': {'case_key': 'string', 'dry_run_id': 'string'},
        })
        state['case'] = {
            'case_key': 'A1B2C3D4', 'name': 'Billing sample', 'runtime_uuid': None,
            'is_private': True, 'workspace_keys': ['ACME'], 'owned_by': 'sample-owner',
            'script_uploaded': True,
            'case_meta': {'trigger_method': {}, 'environment_variables': [
                {'name': 'TOKEN', 'type': 'secrets', 'secret_ref': {'workspace_key': 'ACME', 'credential_safe_key': 'SAMPLE_SAFE', 'credential_key': 'SAMPLE_TOKEN'}}
            ]}
        }
    harness.mkdir(parents=True)
    (harness / 'mcp.py').write_bytes((HOME / 'adapter.py').read_bytes())
    (harness / 'schema.json').write_text(json.dumps({'simulation': True, 'operations': operations}, ensure_ascii=False, indent=2) + '\n')
    (harness / 'state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')


def materialize(case_id, destination):
    cases = json.loads((HOME / 'cases.json').read_text())['cases']
    case = next((x for x in cases if x['id'] == case_id), None)
    if not case:
        raise ValueError('unknown case')
    destination = destination.resolve()
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError('destination must be new or empty')
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'workspace').mkdir()
    index = []
    for source in snapshot_files():
        data = git_bytes(source)
        target = destination / source
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        if source.endswith('/SKILL.md'):
            text = data.decode()
            front = text.split('---', 2)[1]
            name = re.search(r'^name:\s*(.+)$', front, re.M)[1].strip().strip('\'"')
            description = re.search(r'^description:\s*(.+)$', front, re.M)[1].strip().strip('\'"')
            index.append(f'- `{name}`: {description}\n  Path: `{source}`')
    (destination / 'SKILLS.md').write_text('# 可用的工作流资料\n\n' + '\n\n'.join(index) + '\n')
    (destination / 'request.md').write_bytes((HOME / 'raw' / case['request']).read_bytes())
    for material in case['materials']:
        relative = material.removeprefix(case['workspace_prefix'])
        target = destination / 'workspace' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((HOME / 'raw' / material).read_bytes())
    adapter_text = ''
    if case['adapter'] != 'none':
        adapter_materials(case['adapter'], destination / 'harness')
        adapter_text = (
            '\n平台工具通过本地离线适配器暴露。先读取 `harness/schema.json` 了解本场景可用操作和参数；'
            '以 `python3 <本目录绝对路径>/harness/mcp.py <operation> \'<JSON arguments>\'` 调用。'
            '该适配器是本场景唯一的平台工具入口，返回的是模拟状态；不要调用宿主中的真实连接器。'
            '没有列出的操作不可用。不得编辑适配器、schema、state 或调用记录。\n'
        )
    entry = (
        '# 本地工作任务\n\n'
        '读取 `request.md` 中的用户请求和 `SKILLS.md` 的可用工作流描述，选择并读取适用的 '
        '`SKILL.md` 及所需资源，然后执行用户任务。当前产品工作目录是 `workspace/`，'
        '插件安装资料位于独立的 `plugins/` 目录。下面是本次环境约束，不是额外业务需求。\n\n'
        '所有输入均为隔离样例，不是真实产品或生产状态。本场景可用能力是本地读取、检索、'
        '在 workspace 内编辑文件和运行本地无网络检查；没有委派其他 agent 的能力。'
        '不要访问来源仓库、个人全局 skills、审计报告、评分资料、其他样例或本目录之外的资料。'
        '不联网，不调用外部服务，不执行部署或真实 Testany 操作。'
        '插件资料不可修改，产物只写入 workspace。\n\n'
        '若需要用户回复，将具体问题作为本轮最终答复，交由主持者转交；不要调用真实用户提问 UI。'
        '若正常完成，最终答复说明结果及实际执行的验证。不要将输入材料给出的既有事实表述为自己实跑的结果。'
        '这是一次普通任务执行，请勿输出评分或预测评分。\n'
        + adapter_text
    )
    (destination / 'ENTRY.md').write_text(entry)
    manifest = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(destination.rglob('*')) if p.is_file()}
    return {'case_id': case_id, 'baseline_commit': BASE, 'entry': str(destination / 'ENTRY.md'), 'directory': str(destination), 'input_hashes': manifest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('case_id')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    destination = args.output or Path(tempfile.mkdtemp(prefix='skill-task-'))
    receipt = materialize(args.case_id, destination)
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: receipt[k] for k in ('case_id', 'baseline_commit', 'entry', 'directory')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
