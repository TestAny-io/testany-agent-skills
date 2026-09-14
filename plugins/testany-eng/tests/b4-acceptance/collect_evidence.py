"""Collect public evidence from explicitly dispatched agents, never private reasoning."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil


def public_content(content):
    """Keep public text only, not typed thinking or opaque block metadata."""
    result = []
    for block in content:
        if not isinstance(block, dict):
            continue
        typ = block.get('type')
        if any(block.get(k) not in (None, 'commentary', 'final', 'final_answer') for k in ('channel', 'phase')):
            continue
        field = 'refusal' if typ == 'refusal' else 'text'
        if typ not in (None, 'text', 'input_text', 'output_text', 'refusal'):
            continue
        if isinstance(block.get(field), str):
            result.append({k: block[k] for k in ('type', field) if k in block})
    return result


def content_text(content):
    return '\n'.join(c.get('text', c.get('refusal', '')) for c in content)


def read_public_session(path, message):
    public, contexts, session, finals, fingerprints = [], [], {}, [], []
    started = ended = None
    completed = False
    turn_has_final = False
    usage = None
    # JSONL records are LF-delimited; splitlines also splits valid U+0085/U+2028 strings.
    with Path(path).open(encoding='utf-8', newline='\n') as stream:
        for line in stream:
            if not line.strip():
                continue
            item = json.loads(line)
            kind, p, timestamp = item['type'], item.get('payload', {}), item.get('timestamp')
            if kind == 'session_meta':
                session = {k: p.get(k) for k in ('id', 'timestamp', 'cwd', 'originator', 'source', 'model_provider')}
                started = timestamp
            if kind == 'turn_context':
                contexts.append({k: p.get(k) for k in ('model', 'effort', 'cwd', 'turn_id')})
                completed = turn_has_final = False
            if kind == 'event_msg' and p.get('type') == 'task_started':
                completed = turn_has_final = False
            if kind == 'event_msg' and p.get('type') == 'task_complete':
                completed, ended = turn_has_final, timestamp
            if kind == 'event_msg' and p.get('type') == 'token_count':
                candidate = (p.get('info') or {}).get('total_token_usage')
                if isinstance(candidate, dict):
                    usage = {k: v for k, v in candidate.items() if isinstance(v, (int, float))}
            if kind != 'response_item':
                continue
            typ, safe = p.get('type'), None
            if typ == 'message' and p.get('role') == 'user':
                completed = turn_has_final = False
            elif typ == 'message' and p.get('role') == 'assistant':
                completed = False
            if typ == 'message' and p.get('role') in ('developer', 'user'):
                body = '\n'.join(c.get('text', '') for c in p.get('content', []))
                fingerprints.append({'role': p['role'], 'sha256': hashlib.sha256(body.encode()).hexdigest(),
                    'characters': len(body), 'mentions_global_skill_paths': '/.codex/skills' in body,
                    'mentions_audit_report': 'gpt6-audit-2026-09-12' in body,
                    'mentions_frozen_grader': 'expected.frozen.json' in body or 'grader/expected.json' in body})
            if typ == 'message' and p.get('role') in ('assistant', 'user'):
                channel = p.get('channel') or p.get('phase')
                content = public_content(p.get('content', []))
                body = content_text(content)
                public_channel = channel in ('commentary', 'final', 'final_answer') and all(
                    p.get(k) in (None, 'commentary', 'final', 'final_answer') for k in ('channel', 'phase'))
                if (p['role'] == 'assistant' and public_channel) or (p['role'] == 'user' and body == message):
                    if content:
                        safe = {'type': typ, 'role': p['role'], 'content': content, 'channel': channel}
                    if p['role'] == 'assistant' and channel in ('final', 'final_answer'):
                        turn_has_final = bool(body.strip())
                        if turn_has_final:
                            finals.append(body)
                            ended = timestamp
            elif typ in ('function_call', 'custom_tool_call', 'function_call_output', 'custom_tool_call_output'):
                safe = {k: p[k] for k in ('type', 'call_id', 'name', 'arguments', 'input', 'output', 'status') if k in p}
            if safe is not None:
                public.append({'timestamp': timestamp, **safe})
    if not completed or not finals:
        raise RuntimeError('session incomplete; refusing partial final evidence')
    return {'public': public, 'contexts': contexts, 'session': session, 'finals': finals,
            'context_fingerprints': fingerprints, 'started_at': started, 'ended_at': ended,
            'has_final': True, 'task_complete_event': True, 'token_usage': usage}


def public_jsonl(records):
    # Escaping Unicode keeps legacy line-oriented evidence readers safe too.
    return ''.join(json.dumps(record, ensure_ascii=True) + '\n' for record in records)


def safe_component(value, label):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', value):
        raise ValueError('unsafe ' + label)
    return value


def validate_root(root):
    """Check every link; copied directory aliases must also be acyclic."""
    for path in root.rglob('*'):
        if path.is_symlink():
            try:
                target = path.resolve(strict=True)
            except (OSError, RuntimeError) as exc:
                raise ValueError('invalid task symlink') from exc
            if not target.is_relative_to(root):
                raise ValueError('out-of-task symlink')
        if not path.is_dir() and not path.is_file():
            raise ValueError('unsupported task file')

    def check_copy(path, ancestors=()):
        if path.is_dir():
            resolved = path.resolve(strict=True)
            if resolved in ancestors:
                raise ValueError('recursive copied directory symlink')
            for child in path.iterdir():
                check_copy(child, ancestors + (resolved,))

    for name in ('workspace', 'harness'):
        path = root / name
        if path.exists():
            if not path.is_dir():
                raise ValueError('expected task directory: ' + name)
            check_copy(path)


def read_receipt(batch, task, root):
    path = batch / (task['run_key'] + '-receipt.json')
    if path.is_symlink():
        raise ValueError('unsafe receipt symlink')
    receipt = json.loads(path.read_text(encoding='utf-8'))
    if receipt.get('run_key') != task['run_key'] or receipt.get('directory') != task['directory']:
        raise ValueError('dispatch/receipt identity mismatch')
    hashes = receipt.get('input_hashes')
    if not isinstance(hashes, dict):
        raise ValueError('invalid receipt input hashes')
    for rel, digest in hashes.items():
        name = PurePosixPath(rel)
        if (not rel or rel == '.' or name.is_absolute() or '..' in name.parts
                or name.as_posix() != rel or '\\' in rel or '\x00' in rel
                or not (root / rel).resolve().is_relative_to(root)):
            raise ValueError('unsafe receipt input path')
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('invalid receipt input digest')
    return receipt


def collect(batch, *, sessions_root=None):
    """Read completed local sessions; sessions_root supports isolated synthetic tests."""
    batch = Path(batch)
    if batch.is_symlink() or not batch.is_dir():
        raise ValueError('expected existing batch directory, not a symlink')
    batch = batch.resolve()
    if any(p.exists() or p.is_symlink() for p in (batch / 'evidence-index.json', batch / 'evidence')):
        raise FileExistsError('refusing to overwrite complete or partial evidence')
    sessions_root = Path(sessions_root) if sessions_root is not None else Path.home() / '.codex/sessions'
    dispatch, keys, roots, parsed = {}, set(), set(), []
    for path in sorted(batch.glob('dispatch*.json')):
        if path.is_symlink():
            raise ValueError('unsafe dispatch symlink')
        for task in json.loads(path.read_text(encoding='utf-8')):
            safe_component(task['agent_id'], 'agent_id')
            safe_component(task['run_key'], 'run_key')
            if task['agent_id'] in dispatch or task['run_key'] in keys:
                raise ValueError('duplicate dispatch identity')
            dispatch[task['agent_id']] = task
            keys.add(task['run_key'])
    if not dispatch:
        raise ValueError('no actual dispatch receipts')
    for task in dispatch.values():
        paths = [p for p in sessions_root.rglob('*' + task['agent_id'] + '.jsonl')
                 if p.stem == task['agent_id'] or p.stem.endswith('-' + task['agent_id'])]
        if len(paths) != 1:
            raise RuntimeError('expected one exact session for ' + task['run_key'])
        if paths[0].is_symlink() or not paths[0].resolve().is_relative_to(sessions_root.resolve()):
            raise ValueError('unsafe session symlink')
        root = Path(task['directory'])
        if not root.is_absolute() or root.is_symlink() or not root.is_dir():
            raise ValueError('expected absolute existing task directory, not a symlink')
        root = root.resolve()
        if root in roots or root.is_relative_to(batch) or batch.is_relative_to(root):
            raise ValueError('duplicate or overlapping task/evidence directory')
        roots.add(root)
        validate_root(root)
        receipt = read_receipt(batch, task, root)
        data = read_public_session(paths[0], task['message'])
        if data['session'].get('id') != task['agent_id']:
            raise ValueError('dispatch/session identity mismatch')
        parsed.append((task, data, receipt))
    # Reserve once, after all tasks pass preflight. A failed copy remains non-overwritable.
    (batch / 'evidence').mkdir(exist_ok=False)
    summaries = []
    for task, data, receipt in parsed:
        key = task['run_key']
        dest = batch / 'evidence' / key
        dest.mkdir(parents=True, exist_ok=False)
        public = data.pop('public')
        (dest / 'public-trace.jsonl').write_text(public_jsonl(public), encoding='utf-8')
        (dest / 'final.md').write_text('\n\n'.join(data.pop('finals')) + '\n', encoding='utf-8')
        calls = [p for p in public if p['type'] in ('function_call', 'custom_tool_call')]
        (dest / 'tool-calls.md').write_text('\n\n'.join(
            f'## Call {i}: {c["timestamp"]}\n\n```json\n{json.dumps(c, ensure_ascii=False, indent=2)}\n```'
            for i, c in enumerate(calls, 1)) + '\n', encoding='utf-8')
        root = Path(task['directory'])
        changed, missing = [], []
        for rel, before in receipt['input_hashes'].items():
            path = root / rel
            if not path.is_file():
                missing.append(rel)
            elif hashlib.sha256(path.read_bytes()).hexdigest() != before:
                changed.append(rel)
        new = sorted(str(p.relative_to(root)) for p in root.rglob('*')
                     if p.is_file() and str(p.relative_to(root)) not in receipt['input_hashes'])
        for directory in ('workspace', 'harness'):
            if (root / directory).exists():
                shutil.copytree(root / directory, dest / directory)
        summary = {**task, **data, 'public_tool_call_count': len(calls), 'changed_inputs': changed,
                   'missing_inputs': missing, 'new_files': new, 'evidence': str(dest)}
        (dest / 'metadata.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        summaries.append(summary)
    with (batch / 'evidence-index.json').open('x', encoding='utf-8') as stream:
        json.dump(summaries, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'runs': len(summaries), 'index': str(batch / 'evidence-index.json')}))
