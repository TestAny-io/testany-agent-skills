"""Export separately frozen coverage additions without changing the original suite."""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tarfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('b2_base', HERE / 'prepare_run.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def main():
    out = Path(sys.argv[1]).resolve()
    if out.exists() and any(out.iterdir()):
        raise SystemExit('refusing nonempty output')
    out.mkdir(parents=True, exist_ok=True)
    suite = json.loads((HERE / 'supplement.json').read_text())
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (
        HERE / 'supplement.json', HERE / 'prepare_supplement.py', HERE / 'prepare_run.py')}
    (out / 'facility-freeze.json').write_text(json.dumps({'time': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': hashes}, indent=2) + '\n')
    (out / 'expected.frozen.json').write_text(json.dumps({c['id']: c['expect'] for c in suite['cases']}, ensure_ascii=False, indent=2) + '\n')
    tasks = []
    for case in suite['cases']:
        directory = base.materialize(case, 'candidate')
        for name, contents in case['files'].items():
            (directory / 'workspace' / name).write_text(contents)
        key = case['id'] + '-1'
        bundle = out / (key + '-input.tar.gz')
        with tarfile.open(bundle, 'w:gz') as archive:
            archive.add(directory, arcname='input')
        task = dict(run_key=key, case_id=case['id'], variant='candidate', entry=str(directory / 'ENTRY.md'), directory=str(directory))
        receipt = dict(task, input_hashes={str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file()}, archive_sha256=hashlib.sha256(bundle.read_bytes()).hexdigest())
        (out / (key + '-receipt.json')).write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        tasks.append(task)
    (out / 'tasks.json').write_text(json.dumps(tasks, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(tasks, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
