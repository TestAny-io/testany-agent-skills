#!/usr/bin/env python3
"""Read-only raw-content comparison. A SAME_CONTENT receipt is never an approval.

The caller must pin the snapshot digest from the accepted review and separately
verify scope, approval validity and non-file evidence dependencies. Git blobs are
read in one batch without filters; no checkout, index mutation or product tests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

# This companion is also the authoritative closed Git environment implementation.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import snapshot_worktree as snapshot


class BindingError(ValueError):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def exact_commit(repo: Path, value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", value):
        raise BindingError("commit must be a full lowercase object ID")
    resolved = snapshot._resolve_commit(repo, value)
    if resolved != value:
        raise BindingError("object must be a commit, not a tag or abbreviation")
    return resolved


def path_key(value: str) -> str:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts or '.' in path.parts or str(path) != value:
        raise BindingError("invalid candidate path")
    return value


def commit_files(repo: Path, commit: str) -> dict:
    records = {}
    blobs = {}
    for row in snapshot._git(repo, 'ls-tree', '-r', '-z', '--full-tree', commit).split(b'\0'):
        if not row:
            continue
        header, raw_path = row.split(b'\t', 1)
        mode, kind, oid = (part.decode('ascii') for part in header.split())
        path = path_key(os.fsdecode(raw_path))
        if mode == '160000' and kind == 'commit':
            records[path] = {'mode': mode, 'gitlink': oid}
        elif mode in ('100644', '100755', '120000') and kind == 'blob':
            records[path] = {'mode': mode, 'object_id': oid}
            blobs[oid] = None
        else:
            raise BindingError(f'unsupported tree entry: {path}')
    if blobs:
        process = subprocess.Popen(
            ['git', '-C', str(repo), 'cat-file', '--batch'], env=snapshot._closed_git_env(),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        try:
            for oid in blobs:
                process.stdin.write((oid + '\n').encode('ascii'))
                process.stdin.flush()
                header = process.stdout.readline().split()
                if len(header) != 3 or header[:2] != [oid.encode(), b'blob']:
                    raise BindingError('missing or invalid raw Git blob')
                remaining = size = int(header[2])
                hasher = hashlib.sha256()
                while remaining:
                    chunk = process.stdout.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise BindingError('truncated raw Git blob')
                    hasher.update(chunk)
                    remaining -= len(chunk)
                if process.stdout.read(1) != b'\n':
                    raise BindingError('invalid cat-file framing')
                blobs[oid] = {'size': size, 'sha256': hasher.hexdigest()}
            process.stdin.close()
            if process.wait(timeout=30):
                raise BindingError('git cat-file failed')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            for pipe in (process.stdin, process.stdout, process.stderr):
                if pipe and not pipe.closed:
                    pipe.close()
        for item in records.values():
            if 'object_id' in item:
                item.update(blobs[item.pop('object_id')])
    return records


def snapshot_files(payload: dict, expected_digest: str) -> tuple[dict, dict]:
    if not re.fullmatch(r'[0-9a-f]{64}', expected_digest):
        raise BindingError('snapshot digest must come from the accepted review')
    manifest = payload['manifest']
    if digest(manifest) != expected_digest or payload['snapshot_sha256'] != expected_digest:
        raise BindingError('snapshot digest does not match accepted review')
    if manifest['schema'] != snapshot.SCHEMA:
        raise BindingError('unsupported snapshot schema')
    records = {}

    def add(path: str, item: dict) -> None:
        path = path_key(path)
        if path in records:
            raise BindingError(f'duplicate candidate path: {path}')
        records[path] = item

    state = manifest['index_state']
    for item in state['tracked_worktree'] + manifest['candidate_untracked'] + manifest['candidate_ignored']:
        if item['kind'] == 'missing':
            continue
        if item['kind'] not in ('file', 'symlink') or not re.fullmatch(r'[0-9a-f]{64}', item['sha256']):
            raise BindingError('invalid snapshot file record')
        mode = '120000' if item['kind'] == 'symlink' else ('100755' if int(item['mode'], 8) & 0o111 else '100644')
        add(item['path'], {'mode': mode, 'size': item['size'], 'sha256': item['sha256']})
    for item in state['submodules']:
        if item['state'] == 'CLEAN':
            oid = item['worktree_commit']
        elif item['state'] == 'UNINITIALIZED':
            oid = item['index_commit']
        else:
            raise BindingError('unbound submodule state')
        if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', oid):
            raise BindingError('invalid gitlink object ID')
        add(item['path'], {'mode': '160000', 'gitlink': oid})
    return records, manifest


def verify_baselines(manifest: dict) -> None:
    for previous in manifest['mutable_baselines']:
        path = Path(previous['path'])
        if not path.is_absolute():
            raise BindingError('mutable baseline requires an absolute path')
        current = snapshot._file_record(path, str(path), allow_symlink=False)
        if current != previous:
            raise BindingError(f'mutable baseline changed: {path}')


def compare(repo: Path, commit: str, *, snapshot_path: Path | None = None,
            snapshot_sha256: str | None = None, prior_commit: str | None = None) -> dict:
    if (snapshot_path is None) == (prior_commit is None):
        raise BindingError('provide exactly one prior snapshot or prior commit')
    root = Path(snapshot._git(repo, 'rev-parse', '--show-toplevel').decode().strip()).resolve()
    snapshot._assert_no_object_rewrite_state(root)
    commit = exact_commit(root, commit)
    manifest = None
    if snapshot_path is not None:
        if snapshot_sha256 is None:
            raise BindingError('a separately pinned snapshot digest is required')
        payload = json.loads(snapshot_path.read_bytes())
        previous, manifest = snapshot_files(payload, snapshot_sha256)
        base = exact_commit(root, manifest['base_commit'])
        if snapshot._git_returncode(root, 'merge-base', '--is-ancestor', base, commit):
            raise BindingError('target commit does not retain the review root base')
        verify_baselines(manifest)
        exclusions = [path_key(path) for path in manifest['excluded_paths']]
        if exclusions:
            head = exact_commit(root, manifest['head_commit'])
            snapshot._assert_exclusions_do_not_hide_committed_candidate(root, base, head, exclusions)
            # Excluded WIP was never reviewed. Its committed baseline must remain
            # unchanged; a target commit that includes any WIP fails comparison.
            for path, record in commit_files(root, head).items():
                if any(path == excluded or path.startswith(excluded + '/') for excluded in exclusions):
                    if path in previous:
                        raise BindingError('excluded path also appears in reviewed content')
                    previous[path] = record
        old_binding = {'kind': 'worktree_snapshot', 'snapshot_sha256': snapshot_sha256, 'base_commit': base,
                       'excluded_wip_held_at_head': manifest['head_commit'] if exclusions else None, 'excluded_paths': exclusions}
    else:
        prior_commit = exact_commit(root, prior_commit)
        previous = commit_files(root, prior_commit)
        old_binding = {'kind': 'commit', 'commit': prior_commit, 'tree': snapshot._git(root, 'rev-parse', prior_commit + '^{tree}').decode().strip(),
                       'parents': snapshot._git(root, 'show', '-s', '--format=%P', prior_commit).decode().split()}
    current = commit_files(root, commit)
    if manifest is not None:
        verify_baselines(manifest)
    snapshot._assert_no_object_rewrite_state(root)
    changes = []
    for path in sorted(set(previous) | set(current)):
        before, after = previous.get(path), current.get(path)
        if before != after:
            changes.append({'path': path, 'before': before, 'after': after})
    return {
        'schema': 'testany.code-reviewer.binding-receipt.v1',
        'result': 'CONTENT_CHANGED' if changes else 'SAME_CONTENT',
        'approval_granted': False,
        'repository_root': str(root),
        'prior_binding': old_binding,
        'current_binding': {'commit': commit, 'tree': snapshot._git(root, 'rev-parse', commit + '^{tree}').decode().strip(),
                            'parents': snapshot._git(root, 'show', '-s', '--format=%P', commit).decode().split()},
        'prior_content_sha256': digest(previous), 'current_content_sha256': digest(current),
        'files_compared': len(set(previous) | set(current)), 'changes': changes,
        'unverified_by_tool': ['approval_validity_and_newer_blockers', 'repository_identity_and_scope_lock',
                               'non_file_dependencies_and_commit_sensitive_evidence', 'ci_and_environment_readiness'],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--snapshot', type=Path)
    group.add_argument('--prior-commit')
    parser.add_argument('--snapshot-sha256')
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', type=Path, help='optional full receipt, outside candidate checkout')
    args = parser.parse_args()
    try:
        receipt = compare(args.repo, args.commit, snapshot_path=args.snapshot,
                          snapshot_sha256=args.snapshot_sha256, prior_commit=args.prior_commit)
        summary = {key: receipt[key] for key in ('result', 'approval_granted', 'files_compared', 'current_binding')}
        summary['changed_paths'] = [item['path'] for item in receipt['changes']]
        receipt_bytes = canonical(receipt) + b'\n'
        summary['receipt_sha256'] = hashlib.sha256(receipt_bytes).hexdigest()
        if args.output:
            output = args.output.resolve()
            if output.is_relative_to(Path(receipt['repository_root'])):
                raise BindingError('receipt must be saved outside the candidate checkout')
            # Immutable references must not be silently overwritten.
            with output.open('xb') as handle:
                handle.write(receipt_bytes)
            summary['receipt_path'] = str(output)
        print(json.dumps(summary, ensure_ascii=True))
        return 0 if receipt['result'] == 'SAME_CONTENT' else 1
    except (BindingError, snapshot.SnapshotError, OSError, KeyError, TypeError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({'result': 'UNVERIFIED', 'error': str(exc), 'approval_granted': False}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
