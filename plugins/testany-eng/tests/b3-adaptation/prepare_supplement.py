"""Add one neutral full-chain-from-source case; never rewrite the frozen suite."""
import argparse
import json
from pathlib import Path
import tarfile

import prepare_run as base


def prepare(output):
    spec = json.loads((base.HOME / "supplement.json").read_text())
    out = Path(output).resolve()
    base.prepare(out, freeze_only=True)
    case = spec["case"]
    receipt = base.materialize(case)
    root = Path(receipt["directory"])
    work = root / "workspace"
    # These two files belong to the newly generated fixture, never to user inputs.
    (work / "package.zip").unlink()
    (work / "metadata.json").unlink()
    base.fixtures.write(work / "test_billing.py", base.fixtures.SCRIPT)
    base.fixtures.write(work / "materials.md", "# 本地源脚本\n单一原子金额校验，名称 Verify billing total，标签 billing/smoke。\n"
                        "无外部服务、凭证、环境输入或 relay；cloudprime/lab，pyres，LAB 私有。\n"
                        "runtime_uuid: " + base.fixtures.RUNTIME + "\n")
    receipt["input_hashes"] = base.input_hashes(root)
    receipt["input_symlinks"] = base.symlinks(root)
    key = case["id"] + "-1"
    archive = out / (key + "-input.tar.gz")
    with tarfile.open(archive, "w:gz", dereference=False) as bundle:
        bundle.add(root, arcname="input")
    receipt.update(run_key=key, archive=archive.name, archive_sha256=base.sha(archive.read_bytes()))
    base.fixtures.write_json(out / (key + "-receipt.json"), receipt)
    tasks = [{k: receipt[k] for k in ("run_key", "case_id", "variant", "entry", "directory")}]
    base.fixtures.write_json(out / "tasks.json", tasks)
    base.fixtures.write_json(out / "expected.frozen.json", {"policy": spec["reason"], "cases": {case["id"]: case["expect"]}})
    manifest = json.loads((out / "manifest.json").read_text())
    manifest.update(case_ids=[case["id"]], freeze_only=False, runs=[{"run_key": key, "receipt": key + "-receipt.json", "archive": archive.name}],
                    supplement_sha256=base.sha((base.HOME / "supplement.json").read_bytes()))
    base.fixtures.write_json(out / "manifest.json", manifest)
    return tasks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(json.dumps(prepare(parser.parse_args().output), ensure_ascii=False, indent=2))
