"""Freeze a suite or materialize a non-overwriting batch before dispatch."""
import argparse
import datetime
import hashlib
import json
import tarfile
import tempfile
from pathlib import Path

from export_fixture import HOME, ROOT, materialize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--freeze-only',action='store_true')
    parser.add_argument('--variant',choices=('original','candidate'))
    parser.add_argument('--run-spec',help='R02:2,R03:2; defaults to suite repetitions')
    args = parser.parse_args()
    out = args.output.resolve()
    if out.exists() and any(out.iterdir()):
        raise SystemExit('refusing nonempty output')
    out.mkdir(parents=True,exist_ok=True)
    sources = [p for p in HOME.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    sources += list((ROOT / 'plugins/testany-bot/skills/testany-debug/tests').glob('test_*.py'))
    hashes = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(sources)}
    (out / 'facility-freeze.json').write_text(json.dumps({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':hashes},ensure_ascii=False,indent=2)+'\n')
    (out / 'expected.frozen.json').write_bytes((HOME / 'grader/expected.json').read_bytes())
    if args.freeze_only:
        print(json.dumps({'frozen_files':len(hashes),'output':str(out)}))
        return
    if not args.variant:
        raise SystemExit('--variant is required')
    suite = json.loads((HOME / 'suite.json').read_text())['cases']
    specs = [(c['id'],c['repeats']) for c in suite] if not args.run_spec else [(pair.split(':')[0],int(pair.split(':')[1])) for pair in args.run_spec.split(',')]
    tasks = []
    for case_id,repeats in specs:
        for repeat in range(1,repeats+1):
            key = f'{case_id}-{repeat}'
            receipt = materialize(case_id,args.variant,tempfile.mkdtemp(prefix='skill-task-'))
            receipt['run_key'] = key
            archive = out / f'{key}-input.tar.gz'
            with tarfile.open(archive,'w:gz') as bundle:
                bundle.add(receipt['directory'],arcname='input')
            receipt['archive_sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
            (out / f'{key}-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
            tasks.append({k:receipt[k] for k in ('run_key','case_id','variant','entry','directory')})
    (out / 'tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(tasks,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
