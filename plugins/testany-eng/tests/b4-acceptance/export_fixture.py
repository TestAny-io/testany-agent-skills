#!/usr/bin/env python3
"""Prepare paired B4 inputs only; no dispatch, collection, or grading."""

import argparse
import hashlib
import importlib.util
import io
import json
import os
import re
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
HOME = Path(__file__).resolve().parent
TESTS = HOME.parent
ROOT = HOME.parents[3]
START = ROOT / "output/gpt6-b4-2026-09-14/start"
ARCHIVES = {v: START / (v + ".tar.gz") for v in ("original", "candidate")}
PLUGINS = ("testany-eng", "testany-bot", "testany-llm", "testany-mrkt")
INSTALL = "installed skills"
ENTRY = "# 本地工作任务\n\n读取 request.md 和 SKILLS.md，选择并读取适用技能及所需资源，然后执行用户任务。\n"
ENVIRONMENT = """# 本地任务环境

产品材料与产物位于 workspace/；技能安装在 installed skills/，按 SKILLS.md 定位。
plugins/ 仅为同一安装的兼容链接，不是另一个来源仓库。
仅可读取当前任务根目录内的材料和技能；禁止读取目录外的原仓库、全局 skill、
评分、审计、其他任务或其他 agent 的材料。不联网，不访问真实平台或外部服务，
不调用其他 agent，不安装、发布或部署。只允许本地工具与无网络检查，脚本执行授权以请求为准。
业务产物仅写 workspace/；不得修改安装、治理、request、工具代码、schema 或输入状态。
离线 adapter 自身更新 harness 状态与调用记录是工具协议的一部分，不能手工改写。
需要用户输入时，在 final 集中提出具体问题并等待，不调用真实提问 UI，不代用户决定。
这些是任务约定，不是操作系统或网络沙箱；不得把离线结果称为真实平台验证。
"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def write_new(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(data)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def excluded(name):
    return any(p.lower() in {"tests", "__pycache__", ".ds_store", ".git", ".pytest_cache"}
               or "audit" in p.lower() or "grader" in p.lower() or "审计" in p
               or p.lower().endswith((".pyc", ".pyo")) for p in PurePosixPath(name).parts)


def safe_name(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts or "\\" in name or "\x00" in name:
        raise ValueError("unsafe relative path: " + repr(name))
    return path.as_posix()


def governance(name):
    return name in {"AGENTS.md", "CLAUDE.md"} or name.startswith("docs/")


def selected_runtime(name):
    parts = PurePosixPath(name).parts
    return not excluded(name) and (governance(name)
        or name in {".claude-plugin/marketplace.json", "README.md", "LICENSE"}
        or len(parts) >= 3 and parts[0] == "plugins" and parts[1] in PLUGINS)


def validate_tree(tree):
    """Validate virtual links before writing anything, including symlink parents."""
    directories = {"."}
    for name in tree:
        safe_name(name)
        directories.update(p.as_posix() for p in PurePosixPath(name).parents)
    for name in tree:
        if name in directories:
            raise ValueError("file/link used as archive parent: " + name)

    def resolve(parts, seen=()):
        current = []
        for offset, part in enumerate(parts):
            if part in {"", "."}:
                continue
            if part == "..":
                if not current:
                    raise ValueError("symlink escapes export root")
                current.pop()
                continue
            current.append(part)
            key = "/".join(current)
            node = tree.get(key)
            if node and "link" in node:
                if key in seen:
                    raise ValueError("cyclic symlink: " + key)
                target = node["link"]
                if not target or target.startswith("/") or "\\" in target or "\x00" in target:
                    raise ValueError("unsafe symlink: " + key)
                return resolve(current[:-1] + target.split("/") + parts[offset + 1:], seen + (key,))
            if key not in directories and not node:
                raise ValueError("dangling symlink: " + key)
            if node and offset != len(parts) - 1:
                raise ValueError("symlink traverses a file: " + key)
        return "/".join(current) or "."

    edges = {d: [] for d in directories}
    for directory in directories - {"."}:
        edges[PurePosixPath(directory).parent.as_posix()].append(directory)
    for name, node in tree.items():
        if "link" in node:
            resolved = resolve(name.split("/"))
            if resolved in directories:
                edges[PurePosixPath(name).parent.as_posix()].append(resolved)

    visited = set()

    def check_cycles(directory, ancestors=()):
        if directory in ancestors:
            raise ValueError("recursive directory symlink: " + directory)
        if directory not in visited:
            for child in edges[directory]:
                check_cycles(child, ancestors + (directory,))
            visited.add(directory)

    check_cycles(".")


def select_archives(variants, archives=None):
    """An explicit archive mapping replaces defaults, never augments them."""
    if not variants or len(set(variants)) != len(variants) or set(variants) - ARCHIVES.keys():
        raise ValueError("invalid or duplicate variants")
    selected = ARCHIVES if archives is None else archives
    if not isinstance(selected, dict) or set(selected) - ARCHIVES.keys():
        raise ValueError("archives must map known variants to paths")
    missing = [v for v in variants if v not in selected or not selected[v]]
    if missing:
        raise ValueError("explicit archive required for selected variant(s): " + ", ".join(missing))
    if any(not isinstance(selected[v], (str, os.PathLike)) for v in variants):
        raise ValueError("archive paths must be strings or path-like objects")
    return {v: Path(selected[v]) for v in variants}


def snapshot(variant, archives=None):
    """Both variants come exclusively from their designated frozen archive."""
    path = select_archives((variant,), archives)[variant]
    raw = path.read_bytes()
    tree, seen = {}, set()
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        for member in archive:
            name = safe_name(member.name)
            if name in seen:
                raise ValueError("duplicate archive member: " + name)
            seen.add(name)
            if not selected_runtime(name) or member.isdir():
                continue
            if member.isfile():
                tree[name] = {"data": archive.extractfile(member).read(), "mode": member.mode & 0o777}
            elif member.issym():
                tree[name] = {"link": member.linkname, "mode": 0o777}
            else:
                raise ValueError("unsupported archive member: " + name)
    for required in ("AGENTS.md", "CLAUDE.md", ".claude-plugin/marketplace.json"):
        if required not in tree:
            raise ValueError("missing frozen runtime/governance: " + required)
    for plugin in PLUGINS:
        if not any(n.startswith("plugins/" + plugin + "/") and n.endswith("/SKILL.md") for n in tree):
            raise ValueError("missing plugin: " + plugin)
    validate_tree(tree)
    return {"tree": tree, "archive": str(path.resolve()), "archive_sha256": sha(raw)}


def install_tree(tree, root):
    validate_tree(tree)
    for name, node in sorted(tree.items()):
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if "data" in node:
            write_new(target, node["data"])
            target.chmod(node["mode"])
        else:
            target.symlink_to(node["link"])
    inventory(root)


def inventory(root):
    """Hash files, modes and link text without traversing aliases."""
    root = root.resolve()
    result = {}
    for path in sorted(root.rglob("*")):
        name = path.relative_to(root).as_posix()
        if path.is_symlink():
            try:
                resolved = path.resolve(strict=True)
            except (OSError, RuntimeError) as exc:
                raise ValueError("invalid symlink: " + name) from exc
            if not resolved.is_relative_to(root):
                raise ValueError("symlink escapes task: " + name)
            result[name] = {"link": os.readlink(path)}
        elif path.is_file():
            result[name] = {"sha256": sha(path.read_bytes()), "mode": path.stat().st_mode & 0o777}
        elif path.is_dir():
            result[name] = {"directory": True}
        else:
            raise ValueError("unsupported task input: " + name)
    return result


def index_skills(root):
    entries = []

    def visit(path, ancestors=()):
        resolved = path.resolve(strict=True)
        if resolved in ancestors:
            raise ValueError("recursive skill directory: " + str(path))
        if path.is_dir():
            for child in sorted(path.iterdir()):
                visit(child, ancestors + (resolved,))
        elif path.name == "SKILL.md":
            body = path.read_text(encoding="utf-8")
            front = body.split("---", 2)[1] if body.startswith("---") else ""
            name = re.search(r"^name:[ \t]*(.+)$", front, re.M)
            desc = re.search(r"^description:[ \t]*(.+(?:\n[ \t]+.+)*)", front, re.M)
            if not name or not desc:
                raise ValueError("missing skill frontmatter: " + str(path))
            entries.append(f'- `{name[1].strip()}`: {desc[1].strip()}\n  Path: `{path.relative_to(root).as_posix()}`')

    visit(root / INSTALL / "plugins")
    return "# 可用工作流\n\n本地环境约束见 ENVIRONMENT.md。\n\n" + "\n\n".join(entries) + "\n"


def facility_files():
    files = {}
    paths = {
        "gpt6-adaptation": ["export_fixture.py", "adapter.py", "cases.json", "change-plan.json", "grader/expected.json"],
        "b2-workflows": ["prepare_run.py", "suite.json", "supplement.json"],
        "b3-adaptation": ["fixtures.py", "adapter.py", "HARNESS.md", "suite.json", "supplement.json", "prepare_supplement.py"],
        "b4-acceptance": ["export_fixture.py", "test_export_fixture.py", "command_adapter.py", "test_command_adapter.py", "README.md"],
    }
    paths["gpt6-adaptation"] += [p.relative_to(TESTS / "gpt6-adaptation").as_posix()
        for p in sorted((TESTS / "gpt6-adaptation/raw").rglob("*")) if p.is_file()]
    for folder, names in paths.items():
        for name in names:
            path = TESTS / folder / name
            if path.is_symlink() or not path.resolve().is_relative_to(TESTS.resolve()):
                raise ValueError("unsafe facility path: " + str(path))
            files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    for name in ("export_fixture.py", "adapter.py", "suite.json", "grader/expected.json"):
        path = ROOT / "plugins/testany-bot/tests/b1-safety" / name
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError("unsafe B1 facility path")
        files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    return files


class Materials:
    """Reuse fixture generators, never their old runtime/overlay exporters."""

    def __init__(self, home):
        repository = home
        home = home / "plugins/testany-eng/tests"
        self.home = home
        self.legacy = load_module(home / "gpt6-adaptation/export_fixture.py", "b4_legacy")
        # This private module keeps legacy materialize intact, but supplies no runtime.
        self.legacy.snapshot_files = lambda: []
        self.b2 = load_module(home / "b2-workflows/prepare_run.py", "b4_b2")
        self.fixtures = load_module(home / "b3-adaptation/fixtures.py", "b4_fixtures")
        self.adapter = load_module(home / "b3-adaptation/adapter.py", "b4_adapter")
        b1_home = repository / "plugins/testany-bot/tests/b1-safety"
        self.b1 = load_module(b1_home / "export_fixture.py", "b4_b1")
        self.b1.original = self.legacy
        self.suites = {s: json.loads((home / p).read_bytes()) for s, p in {
            "legacy": "gpt6-adaptation/cases.json", "b2": "b2-workflows/suite.json",
            "b2-supplement": "b2-workflows/supplement.json",
            "b3": "b3-adaptation/suite.json", "b3-supplement": "b3-adaptation/supplement.json"}.items()}
        self.suites["b1"] = json.loads((b1_home / "suite.json").read_bytes())
        self.suites["b4-repair"] = {"policy": "C10G is a separately versioned offline fixture compatibility repair, not a replacement grade for legacy:C10 or the excluded C10F pilot.",
                                    "cases": [{"id": "C10G", "reuse": "C10"}]}
        self.suites["b1"]["cases"] = [c for c in self.suites["b1"]["cases"]
                                      if c["id"] in {"R06", "R07", "R08", "R09", "R10", "R11"}]
        self.b1_expected = json.loads((b1_home / "grader/expected.json").read_bytes())
        self.cases = {(source, case["id"]): case for source, suite in self.suites.items()
                      for case in (suite["cases"] if "cases" in suite else [suite["case"]])}
        self.legacy_expected = json.loads((home / "gpt6-adaptation/grader/expected.json").read_bytes())

    def expected(self, source, case_id):
        case = self.cases[source, case_id]
        if source in {"legacy", "b4-repair"}:
            return self.legacy_expected["cases"][case_id if source == "legacy" else case["reuse"]]
        if source == "b1":
            return self.b1_expected["cases"][case_id]
        result = {"expect": case["expect"]}
        if source == "b2" and "reuse" in case and "request" not in case:
            result["legacy_expected"] = self.legacy_expected["cases"][case["reuse"]]
        return result

    def materialize(self, source, case_id, root):
        case = self.cases[source, case_id]
        environment = ENVIRONMENT
        if source in {"legacy", "b1", "b2", "b2-supplement", "b4-repair"}:
            if source == "b1":
                self.b1.materialize(case_id, "original", root)
            else:
                self.legacy.materialize(case_id if source == "legacy" else case.get("reuse", "C08"), root)
            (root / "ENTRY.md").unlink()
            (root / "SKILLS.md").unlink()
            if source == "b4-repair":
                harness = root / "harness"
                (harness / "mcp.py").rename(harness / "legacy_adapter.py")
                write_new(harness / "mcp.py", (self.home / "b4-acceptance/command_adapter.py").read_bytes())
                schema = json.loads((harness / "schema.json").read_bytes())
                schema["operations"]["testany_update_case"]["case_meta"]["trigger_method"] = {
                    "executor": "python for this isolated fixture",
                    "trigger_command": "optional: ['python', 'main.py'] array or exact 'python main.py' string; never executed by this adapter",
                    "trigger_path": "optional legacy input: main.py; at least one entry field required; if both fields are given they must agree"}
                (harness / "schema.json").write_bytes(json_bytes(schema))
            if source in {"b2", "b2-supplement"}:
                if "request" in case:
                    (root / "request.md").write_text(case["request"] + "\n", encoding="utf-8")
                if case.get("profile"):
                    self.b2.supplemental(root, case["profile"])
                for name, content in case.get("files", {}).items():
                    self.fixtures.write(root / "workspace" / safe_name(name), content)
            if (root / "harness").exists():
                environment += "\n唯一平台入口为离线 harness/mcp.py；先读 harness/schema.json。\n调用：python3 harness/mcp.py <operation> '<JSON arguments>'。未列出的操作不可用。\n"
        else:
            self.fixtures.materialize(case, root)
            self.fixtures.write(root / "request.md", case["request"] + "\n")
            if source == "b3-supplement":
                # Same neutral S01 adjustment as b3-adaptation/prepare_supplement.py.
                work = root / "workspace"
                (work / "package.zip").unlink()
                (work / "metadata.json").unlink()
                self.fixtures.write(work / "test_billing.py", self.fixtures.SCRIPT)
                self.fixtures.write(work / "materials.md", "# 本地源脚本\n单一原子金额校验，名称 Verify billing total，标签 billing/smoke。\n"
                    "无外部服务、凭证、环境输入或 relay；cloudprime/lab，pyres，LAB 私有。\n"
                    "runtime_uuid: " + self.fixtures.RUNTIME + "\n")
            if case["profile"] in self.fixtures.PLATFORM_PROFILES:
                harness = root / "harness"
                for source_name, target in (("adapter.py", "testany.py"), ("HARNESS.md", "TOOLS.md")):
                    self.fixtures.write(harness / target, (self.home / "b3-adaptation" / source_name).read_bytes())
                self.fixtures.write_json(harness / "state.json", self.adapter.initial_state(case["profile"]))
                self.fixtures.write(harness / "calls.jsonl", "")
                environment += "\n唯一平台入口为离线 harness/testany.py；接口与调用协议见 harness/TOOLS.md。\n"
        write_new(root / "ENVIRONMENT.md", environment.encode())
        write_new(root / "ENTRY.md", ENTRY.encode())


def prepare(output, scenarios=None, variants=("original", "candidate"), repeats=3, *, archives=None):
    """Return receipts; scenarios are [{source, case_id}], default all frozen cases."""
    if not isinstance(repeats, int) or isinstance(repeats, bool) or repeats < 1:
        raise ValueError("repeats must be a positive integer")
    variants = tuple(variants)
    archives = select_archives(variants, archives)
    files = facility_files()
    materials = Materials(ROOT)
    chosen = scenarios if scenarios is not None else [dict(source=s, case_id=c) for s, c in materials.cases]
    if not isinstance(chosen, list) or not chosen:
        raise ValueError("scenarios must be a nonempty list")
    keys = []
    for scenario in chosen:
        if not isinstance(scenario, dict) or set(scenario) != {"source", "case_id"}:
            raise ValueError("each scenario must contain only source and case_id")
        key = (scenario["source"], scenario["case_id"])
        if not all(isinstance(v, str) for v in key) or key not in materials.cases or key in keys:
            raise ValueError("unknown or duplicate scenario: " + repr(key))
        keys.append(key)
    snapshots = {v: snapshot(v, archives) for v in variants}
    out = Path(output).absolute()
    # Exclusive directory creation is the reservation; partial/old runs cannot be overwritten.
    out.mkdir(parents=True, exist_ok=False)
    out = out.resolve()
    for name, data in files.items():
        write_new(out / "facility-snapshot" / name, data)
    materials = Materials(out / "facility-snapshot")
    facility_hashes = {n: sha(b) for n, b in files.items()}
    facility_hash = sha(json_bytes(facility_hashes))
    expected = {"policies": {s: spec.get("policy", spec.get("reason")) for s, spec in materials.suites.items()},
                "legacy_policy": materials.legacy_expected["policy"],
                "b1_policy": materials.b1_expected["policy"],
                "cases": {s + ":" + c: materials.expected(s, c) for s, c in keys}}
    write_new(out / "expected.frozen.json", json_bytes(expected))
    tasks, roots, comparable = [], [], {}
    try:
        for source, case_id in keys:
            for variant in variants:
                for repeat in range(1, repeats + 1):
                    run_key = f"{source}-{case_id}-{variant}-{repeat}"
                    root = Path(tempfile.mkdtemp(prefix="b4 task ")).resolve()
                    roots.append(root)
                    if root.is_relative_to(out) or out.is_relative_to(root):
                        raise ValueError("task and evidence directories must be separate")
                    materials.materialize(source, case_id, root)
                    frozen = snapshots[variant]
                    install_tree(frozen["tree"], root / INSTALL)
                    for name in ("AGENTS.md", "CLAUDE.md", "docs", "plugins"):
                        if (root / INSTALL / name).exists():
                            (root / name).symlink_to(INSTALL + "/" + name)
                    write_new(root / "SKILLS.md", index_skills(root).encode())
                    inputs = inventory(root)
                    payload = {n: v for n, v in inputs.items() if n == "request.md"
                               or n.split("/")[0] in {"workspace", "harness"}}
                    neutral = {n: v for n, v in inputs.items() if n.split("/")[0]
                               not in {INSTALL, "AGENTS.md", "CLAUDE.md", "docs", "SKILLS.md"}}
                    paired_hash = sha(json_bytes(neutral))
                    if comparable.setdefault((source, case_id), paired_hash) != paired_hash:
                        raise ValueError("nonidentical paired task payload: " + run_key)
                    runtime = {n: v for n, v in inputs.items() if n.startswith(INSTALL + "/")}
                    receipt = dict(run_key=run_key, source=source, case_id=case_id, variant=variant, repeat=repeat,
                        entry=str(root / "ENTRY.md"), directory=str(root), input_manifest=inputs,
                        input_hashes={n: sha((root / n).read_bytes()) for n in inputs if (root / n).is_file()},
                        input_symlinks={n: v["link"] for n, v in inputs.items() if "link" in v},
                        payload_sha256=sha(json_bytes(payload)), comparable_sha256=paired_hash,
                        runtime_sha256=sha(json_bytes(runtime)), facility_sha256=facility_hash,
                        source_archive=frozen["archive"], source_archive_sha256=frozen["archive_sha256"])
                    archive_path = out / (run_key + "-input.tar.gz")
                    with archive_path.open("xb") as stream:
                        with tarfile.open(fileobj=stream, mode="w:gz", dereference=False) as bundle:
                            bundle.add(root, arcname="input")
                    receipt.update(archive=archive_path.name, archive_sha256=sha(archive_path.read_bytes()))
                    write_new(out / (run_key + "-receipt.json"), json_bytes(receipt))
                    tasks.append(receipt)
        if facility_files() != files:
            raise ValueError("facility changed during preparation")
        manifest = dict(schema_version=1, scenarios=chosen, variants=variants, repeats=repeats,
            facility_sha256=facility_hash, facility_files=facility_hashes,
            expected_sha256=sha((out / "expected.frozen.json").read_bytes()),
            sources={v: {k: d[k] for k in ("archive", "archive_sha256")} for v, d in snapshots.items()},
            runs=tasks)
        write_new(out / "manifest.json", json_bytes(manifest))
        write_new(out / "tasks.json", json_bytes(tasks))
    except Exception:
        for root in roots:
            shutil.rmtree(root)
        raise
    return tasks


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--scenarios", type=Path, help="JSON list of {source, case_id}; default all")
    parser.add_argument("--variants", default="original,candidate")
    parser.add_argument("--repeats", type=int, default=3)
    for variant in ARCHIVES:
        parser.add_argument("--" + variant + "-archive", type=Path,
                            help="frozen archive override; when used, supply every selected variant")
    args = parser.parse_args(argv)
    try:
        scenarios = json.loads(args.scenarios.read_bytes()) if args.scenarios else None
        archives = {v: getattr(args, v + "_archive") for v in ARCHIVES
                    if getattr(args, v + "_archive") is not None}
        tasks = prepare(args.output, scenarios, args.variants.split(","), args.repeats,
                        archives=archives or None)
    except (ValueError, OSError, tarfile.TarError) as exc:
        parser.exit(2, str(exc) + "\n")
    print(json.dumps([{k: t[k] for k in ("run_key", "entry", "directory")} for t in tasks], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
