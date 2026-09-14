#!/usr/bin/env python3
"""Freeze receipts and grader before dispatch; never overwrite an existing run."""
import argparse
import datetime
import hashlib
import json
import tempfile
import tarfile
from pathlib import Path

from export_fixture import BASE, HOME, materialize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit('refusing nonempty output')
    output.mkdir(parents=True, exist_ok=True)
    receipts = []
    for case in json.loads((HOME / 'cases.json').read_text())['cases']:
        root = Path(tempfile.mkdtemp(prefix='skill-task-'))
        receipt = materialize(case['id'], root)
        archive = output / f'{case["id"]}-input.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            bundle.add(root, arcname='input')
        receipt['input_archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        receipts.append(receipt)
        (output / f'{case["id"]}-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    frozen = {}
    for path in sorted(HOME.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            frozen[str(path.relative_to(HOME))] = hashlib.sha256(path.read_bytes()).hexdigest()
    freeze = {'frozen_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'baseline_commit': BASE, 'source_hashes': frozen, 'cases': [{'case_id': r['case_id'], 'entry': r['entry'], 'directory': r['directory']} for r in receipts], 'model_runs_started': False}
    (output / 'freeze.json').write_text(json.dumps(freeze, ensure_ascii=False, indent=2) + '\n')
    (output / 'expected.frozen.json').write_bytes((HOME / 'grader/expected.json').read_bytes())
    print(json.dumps(freeze['cases'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
