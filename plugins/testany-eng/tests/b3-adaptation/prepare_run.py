#!/usr/bin/env python3
"""Freeze B3 facilities and export independent, neutral offline task inputs."""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
import adapter
import fixtures


HOME = Path(__file__).resolve().parent
ROOT = HOME.parents[3]
START = ROOT / "output/gpt6-b3-2026-09-14/start/tree.tar.gz"
PLUGINS = ("testany-eng", "testany-bot", "testany-llm", "testany-mrkt")
INSTALL = Path("installed skills")
FROZEN = {
    "suite.json": "4690d4f1b89e9f1ae2c88a7dc6735bd16e492530d2cbb36ad23ca8d003ab164b",
    "evaluation.md": "2e5bdf7d59d71ff5171f00286abc3e02b0587ce44fab439776231236f1608be9",
}
ENTRY = "# 本地工作任务\n\n读取 request.md 和 SKILLS.md，选择并读取适用技能及所需资源，然后执行用户任务。\n"
ENVIRONMENT = """# 本地练习环境

产品材料与产物位于 workspace/；可用插件安装在 installed skills/，按 SKILLS.md 定位。
本次只使用当前任务目录的技能与材料，不读取来源仓库、全局 skills、其他任务或评分资料。
所有材料均为隔离样例。可使用本地文件与静态检查，不访问网络，不调用真实平台、安装、
发布或部署，不委派其他 agent。脚本执行权限以 request.md 为准。
不要修改插件安装和工具设施；业务产物写入 workspace/。
需要用户回答时，在本轮最终答复中集中提出问题并等待，不代替用户决定。
这些限制只是测试约定，不是操作系统、进程、文件系统或网络沙箱。
"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def excluded(relative):
    for part in PurePosixPath(str(relative)).parts:
        lower = part.lower()
        if lower in {"tests", "__pycache__", ".ds_store", ".pytest_cache", ".git"}:
            return True
        if "audit" in lower or "grader" in lower or "审计" in part:
            return True
        if lower.endswith((".pyc", ".pyo")):
            return True
    return False


def runtime_path(relative):
    parts = PurePosixPath(relative).parts
    if not parts or excluded(relative):
        return False
    return ((len(parts) >= 3 and parts[0] == "plugins" and parts[1] in PLUGINS)
            or relative in {".claude-plugin/marketplace.json", "README.md", "LICENSE"})


def read_tree(source, paths):
    result = {}
    for base in paths:
        path = source / base
        if not path.exists() and not path.is_symlink():
            continue
        candidates = [path] + (sorted(path.rglob("*")) if path.is_dir() and not path.is_symlink() else [])
        for item in candidates:
            rel = item.relative_to(source).as_posix()
            if excluded(rel):
                continue
            if item.is_symlink():
                result[rel] = {"link": os.readlink(item), "mode": item.lstat().st_mode & 0o777}
            elif item.is_file():
                result[rel] = {"data": item.read_bytes(), "mode": item.stat().st_mode & 0o777}
    return result


def snapshot(variant, source_root=ROOT, original_archive=START):
    source_root = Path(source_root)
    if variant == "candidate":
        resources = read_tree(source_root, ["plugins/" + p for p in PLUGINS] +
                              [".claude-plugin/marketplace.json", "README.md", "LICENSE"])
    elif variant == "original":
        resources = {}
        with tarfile.open(original_archive, "r:gz") as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts:
                    raise ValueError("unsafe start archive member: " + member.name)
                relative = path.as_posix()
                if not runtime_path(relative):
                    continue
                if relative in resources:
                    raise ValueError("duplicate start archive member: " + relative)
                if member.isfile():
                    resources[relative] = {"data": archive.extractfile(member).read(), "mode": member.mode & 0o777}
                elif member.issym():
                    resources[relative] = {"link": member.linkname, "mode": member.mode & 0o777}
                elif not member.isdir():
                    raise ValueError("unsupported start archive member: " + relative)
    else:
        raise ValueError("unknown variant: " + variant)
    for plugin in PLUGINS:
        if not any(p.startswith("plugins/" + plugin + "/") and p.endswith("SKILL.md") for p in resources):
            raise ValueError("missing plugin runtime: " + plugin)
    # Both variants intentionally use current governance routes; plugin bytes never overlay original.
    governance = read_tree(source_root, ["AGENTS.md", "CLAUDE.md", "docs"])
    for name in ("AGENTS.md", "CLAUDE.md"):
        if name not in governance:
            raise ValueError("missing current governance file: " + name)
    return {"resources": resources, "governance": governance}


def install_tree(tree, root):
    for relative, value in sorted(tree.items()):
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if "data" in value:
            target.write_bytes(value["data"])
            target.chmod(value["mode"])
    for relative, value in sorted(tree.items()):
        if "link" in value:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(value["link"])
    for relative, value in tree.items():
        if "link" in value:
            target = root / relative
            if not target.resolve().is_relative_to(root.resolve()) or not target.exists():
                raise ValueError("runtime symlink escapes or dangles: " + relative)


def index_skills(root):
    entries = []
    for path in sorted((root / INSTALL / "plugins").rglob("SKILL.md")):
        body = path.read_text(encoding="utf-8")
        front = body.split("---", 2)[1] if body.startswith("---") else ""
        name = re.search(r"^name:\s*(.+)$", front, re.M)
        desc = re.search(r"^description:\s*(.+)$", front, re.M)
        if not name or not desc:
            raise ValueError("missing skill frontmatter: " + str(path))
        label = name[1].strip().strip("\"'")
        description = desc[1].strip().strip("\"'")
        entries.append(f"- `{label}`: {description}\n  Path: `{path.relative_to(root).as_posix()}`")
    return "# 可用工作流\n\n本地环境说明见 ENVIRONMENT.md。\n\n" + "\n\n".join(entries) + "\n"


def input_hashes(root):
    return {p.relative_to(root).as_posix(): sha(p.read_bytes())
            for p in sorted(root.rglob("*")) if p.is_file()}


def symlinks(root):
    return {p.relative_to(root).as_posix(): os.readlink(p)
            for p in sorted(root.rglob("*")) if p.is_symlink()}


def materialize(case, variant="candidate", destination=None, frozen_source=None,
                source_root=ROOT, original_archive=START, facility=None):
    root = Path(destination).resolve() if destination is not None else Path(tempfile.mkdtemp(prefix="b3-task-"))
    if root.exists() and (not root.is_dir() or any(root.iterdir())):
        raise ValueError("refusing nonempty workspace: " + str(root))
    root.mkdir(parents=True, exist_ok=True)
    source = frozen_source if frozen_source is not None else snapshot(variant, source_root, original_archive)
    # Install routes before checking links: a plugin resource may refer to root docs.
    install_tree({**source["resources"], **source["governance"]}, root / INSTALL)
    install_tree(source["governance"], root)
    fixtures.materialize(case, root)
    fixtures.write(root / "request.md", case["request"] + "\n")
    fixtures.write(root / "ENTRY.md", ENTRY)
    fixtures.write(root / "SKILLS.md", index_skills(root))
    environment = ENVIRONMENT
    if case["profile"] in fixtures.PLATFORM_PROFILES:
        harness = root / "harness"
        files = facility if facility is not None else {n: (HOME / n).read_bytes() for n in ("adapter.py", "HARNESS.md")}
        fixtures.write(harness / "testany.py", files["adapter.py"])
        fixtures.write(harness / "TOOLS.md", files["HARNESS.md"])
        fixtures.write_json(harness / "state.json", adapter.initial_state(case["profile"]))
        fixtures.write(harness / "calls.jsonl", "")
        environment += "\n平台操作仅通过本地 harness/testany.py 离线工具；接口和调用方式见 harness/TOOLS.md。\n"
    else:
        environment += "\n本任务没有平台工具入口。\n"
    fixtures.write(root / "ENVIRONMENT.md", environment)
    return {"case_id": case["id"], "variant": variant, "entry": str(root / "ENTRY.md"),
            "directory": str(root), "input_hashes": input_hashes(root), "input_symlinks": symlinks(root)}


def facility_files():
    files = {p.relative_to(HOME).as_posix(): p.read_bytes()
             for p in sorted(HOME.rglob("*")) if p.is_file() and not excluded(p.relative_to(HOME))}
    for name, digest in FROZEN.items():
        if sha(files[name]) != digest:
            raise ValueError("frozen file hash mismatch: " + name)
    return files


def tree_manifest(tree):
    return {rel: ({"sha256": sha(value["data"]), "mode": value["mode"]} if "data" in value else value)
            for rel, value in sorted(tree.items())}


def prepare(output, variant="candidate", cases=None, batch="all", freeze_only=False,
            source_root=ROOT, original_archive=START):
    facility = facility_files()
    suite = json.loads(facility["suite.json"])
    ids = {case["id"] for case in suite["cases"]}
    requested = set(cases) if cases is not None else ids
    if requested - ids or not requested:
        raise ValueError("unknown or empty case selection: " + ",".join(sorted(requested - ids)))
    selected = [case for case in suite["cases"] if case["id"] in requested and (batch == "all" or case["batch"] == batch)]
    if not selected:
        raise ValueError("no cases match selection")
    out = Path(output).resolve()
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        raise ValueError("refusing nonempty output: " + str(out))
    source = snapshot(variant, source_root, original_archive)
    out.mkdir(parents=True, exist_ok=True)
    for rel, data in facility.items():
        fixtures.write(out / "facility-snapshot" / rel, data)
    manifest = {
        "time": datetime.datetime.now(datetime.timezone.utc).isoformat(), "variant": variant,
        "case_ids": [c["id"] for c in selected], "freeze_only": freeze_only,
        "files": {"plugins/testany-eng/tests/b3-adaptation/" + rel: sha(data) for rel, data in facility.items()},
        "facility_snapshot": "facility-snapshot", "frozen": FROZEN,
        "runtime_source": "working-tree" if variant == "candidate" else str(Path(original_archive).resolve()),
        "runtime_files": tree_manifest(source["resources"]),
        "governance_source": "current working-tree for both variants",
        "governance_files": tree_manifest(source["governance"]),
    }
    if variant == "original":
        manifest["start_archive_sha256"] = sha(Path(original_archive).read_bytes())
    fixtures.write_json(out / "expected.frozen.json", {
        "policy": suite["policy"], "cases": {c["id"]: c["expect"] for c in suite["cases"]},
    })
    tasks, roots = [], []
    try:
        if not freeze_only:
            for case in selected:
                key = case["id"] + "-1"
                root = Path(tempfile.mkdtemp(prefix="b3-task-"))
                roots.append(root)
                receipt = materialize(case, variant, root, source, facility=facility)
                archive_path = out / (key + "-input.tar.gz")
                with tarfile.open(archive_path, "w:gz", dereference=False) as bundle:
                    bundle.add(root, arcname="input", recursive=True)
                receipt.update({"run_key": key, "archive": archive_path.name,
                                "archive_sha256": sha(archive_path.read_bytes())})
                fixtures.write_json(out / (key + "-receipt.json"), receipt)
                tasks.append({k: receipt[k] for k in ("run_key", "case_id", "variant", "entry", "directory", "input_hashes")})
    except Exception:
        for root in roots:
            shutil.rmtree(root)
        raise
    manifest["runs"] = [{"run_key": t["run_key"], "receipt": t["run_key"] + "-receipt.json",
                         "archive": t["run_key"] + "-input.tar.gz"} for t in tasks]
    fixtures.write_json(out / "manifest.json", manifest)
    fixtures.write_json(out / "facility-freeze.json", manifest)
    fixtures.write_json(out / "tasks.json", tasks)
    return tasks


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("positional_output", nargs="?", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cases", help="comma-separated case IDs; default all 18")
    parser.add_argument("--batch", choices=("a", "b", "c", "d", "e", "f", "all"), default="all")
    parser.add_argument("--variant", choices=("candidate", "original"), default="candidate")
    parser.add_argument("--freeze-only", action="store_true")
    args = parser.parse_args(argv)
    if (args.output is None) == (args.positional_output is None):
        parser.error("supply exactly one output path, positional or --output")
    cases = [x.strip() for x in args.cases.split(",") if x.strip()] if args.cases is not None else None
    try:
        tasks = prepare(args.output or args.positional_output, args.variant, cases, args.batch, args.freeze_only)
    except (ValueError, OSError, tarfile.TarError) as exc:
        parser.exit(2, str(exc) + "\n")
    print(json.dumps([{k: t[k] for k in ("run_key", "case_id", "variant", "entry", "directory")} for t in tasks], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
