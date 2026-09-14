"""Supplemental export: derive discovery descriptions from candidate bytes, never stale baseline metadata."""
import argparse
import datetime
import hashlib
import json
import re
import tarfile
import tempfile
from pathlib import Path

from export_fixture import HOME, ROOT, materialize


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    out=args.output.resolve()
    if out.exists() and any(out.iterdir()):
        raise SystemExit('refusing nonempty output')
    out.mkdir(parents=True,exist_ok=True)
    sources=[p for p in HOME.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    sources+=list((ROOT/'plugins/testany-bot/skills/testany-debug/tests').glob('test_*.py'))
    hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(sources)}
    (out/'facility-freeze.json').write_text(json.dumps({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':hashes,'change':'New supplemental exporter only: SKILLS.md reflects current candidate frontmatter. Original exporter, requests, adapters and expected criteria remain unchanged.'},indent=2)+'\n')
    (out/'expected.frozen.json').write_bytes((HOME/'grader/expected.json').read_bytes())
    tasks=[]
    for case_id in ('R10','R11'):
        for repeat in range(1,4):
            key=f'{case_id}-{repeat}'
            receipt=materialize(case_id,'candidate',tempfile.mkdtemp(prefix='skill-task-'))
            root=Path(receipt['directory'])
            index=[]
            for source in sorted((root/'plugins').rglob('SKILL.md')):
                front=source.read_text().split('---',2)[1]
                name=re.search(r'^name:\s*(.+)$',front,re.M)[1].strip().strip('\'"')
                description=re.search(r'^description:\s*(.+)$',front,re.M)[1].strip().strip('\'"')
                index.append(f'- `{name}`: {description}\n  Path: `{source.relative_to(root)}`')
            (root/'SKILLS.md').write_text('# 可用的工作流资料\n\n'+'\n\n'.join(index)+'\n')
            receipt['input_hashes']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
            receipt['run_key']=key
            archive=out/f'{key}-input.tar.gz'
            with tarfile.open(archive,'w:gz') as bundle:
                bundle.add(root,arcname='input')
            receipt['archive_sha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
            (out/f'{key}-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
            tasks.append({k:receipt[k] for k in ('run_key','case_id','variant','entry','directory')})
    (out/'tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(tasks,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
