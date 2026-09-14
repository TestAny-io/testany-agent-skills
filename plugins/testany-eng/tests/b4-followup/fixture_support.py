"""Freeze small follow-up tasks; never dispatch models or change old evidence."""

import importlib.util
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile

HOME = Path(__file__).resolve().parent
ROOT = HOME.parents[3]
DEFAULT_ARCHIVE = ROOT / "output/gpt6-b4-2026-09-14/repair-start/candidate-v2.tar.gz"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


b4 = load(HOME.parent / "b4-acceptance/export_fixture.py", "followup_b4_export")
collector = load(HOME.parent / "b4-acceptance/collect_evidence.py", "followup_b4_collect")


def save(path, value):
    b4.write_new(Path(path), b4.json_bytes(value))


def prepare(batch, case_id, request, expected, materialize, repeats=1, archive=DEFAULT_ARCHIVE):
    """Materialize inputs before freezing; expected stays outside every task root."""
    collector.safe_component(case_id, "case_id")
    if isinstance(repeats, bool) or not isinstance(repeats, int) or repeats < 1:
        raise ValueError("repeats must be a positive integer")
    frozen = b4.snapshot("candidate", {"candidate": Path(archive)})
    if any("skill-manager" in name.split("/") for name in frozen["tree"]):
        raise ValueError("SkillDock is outside this follow-up candidate")
    batch = Path(batch).absolute()
    batch.mkdir(parents=True, exist_ok=False)
    save(batch / "expected.frozen.json", expected)
    facility = {}
    facility_bytes = b4.facility_files()
    for directory in (HOME, HOME.parent / "b4-acceptance"):
        for path in sorted(directory.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                name = path.relative_to(ROOT).as_posix()
                raw = path.read_bytes()
                facility_bytes[name] = raw
    for name, raw in sorted(facility_bytes.items()):
        facility[name] = b4.sha(raw)
        b4.write_new(batch / "facility-snapshot" / name, raw)
    facility_hash = b4.sha(b4.json_bytes(facility))
    tasks = []
    for repeat in range(1, repeats + 1):
        root = Path(tempfile.mkdtemp(prefix="skill followup task ")).resolve()
        (root / "workspace").mkdir()
        materialize(root)
        b4.install_tree(frozen["tree"], root / b4.INSTALL)
        for name in ("AGENTS.md", "CLAUDE.md", "docs", "plugins"):
            if (root / b4.INSTALL / name).exists():
                (root / name).symlink_to(b4.INSTALL + "/" + name)
        b4.write_new(root / "request.md", (request + "\n").encode())
        b4.write_new(root / "ENVIRONMENT.md", b4.ENVIRONMENT.encode())
        b4.write_new(root / "ENTRY.md", b4.ENTRY.encode())
        b4.write_new(root / "SKILLS.md", b4.index_skills(root).encode())
        inputs = b4.inventory(root)
        key = f"followup-{case_id}-candidate-{repeat}"
        receipt = dict(run_key=key, source="followup", case_id=case_id, variant="candidate", repeat=repeat,
            entry=str(root / "ENTRY.md"), directory=str(root), input_manifest=inputs,
            input_hashes={n: b4.sha((root / n).read_bytes()) for n in inputs if (root / n).is_file()},
            input_symlinks={n: v["link"] for n, v in inputs.items() if "link" in v},
            source_archive=frozen["archive"], source_archive_sha256=frozen["archive_sha256"],
            runtime_sha256=b4.sha(b4.json_bytes({n: v for n, v in inputs.items() if n.startswith(b4.INSTALL + "/")})),
            payload_sha256=b4.sha(b4.json_bytes({n: v for n, v in inputs.items() if n == "request.md" or n.startswith(("workspace/", "harness/"))})),
            facility_sha256=facility_hash)
        archive_path = batch / (key + "-input.tar.gz")
        with archive_path.open("xb") as stream:
            with tarfile.open(fileobj=stream, mode="w:gz", dereference=False) as bundle:
                bundle.add(root, arcname="input")
        receipt.update(archive=archive_path.name, archive_sha256=b4.sha(archive_path.read_bytes()))
        save(batch / (key + "-receipt.json"), receipt)
        tasks.append(receipt)
    save(batch / "manifest.json", dict(runs=tasks, facility_files=facility,
        expected_sha256=b4.sha((batch / "expected.frozen.json").read_bytes()),
        source_archive_sha256=frozen["archive_sha256"], facility_sha256=facility_hash))
    save(batch / "tasks.json", tasks)
    return tasks


def dispatch_message(receipt):
    root = receipt["directory"]
    return (f"工作目录为 {root}。这是独立本地任务；首个文件读取必须使用该绝对路径，"
        "不要先查看默认cwd或全局技能。仅允许读取/操作此任务根内材料，不访问原仓库、"
        "其他任务、审计、评分、外网、真实平台或凭据。不调用其他agent。"
        f"先读取 {root}/ENVIRONMENT.md、{root}/ENTRY.md，再按其中要求完成用户任务。"
        "所有命令明确指定任务根或workspace为workdir。业务输出仅写workspace；"
        "不改安装资源、治理、工具和输入契约。需要用户回答时在final提问等待。")


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(Path(path).read_bytes(), object_pairs_hook=unique)


def checked_directory(path):
    path = Path(path)
    if not path.is_absolute() or not path.is_dir():
        raise ValueError("expected absolute existing directory")
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError("directory symlink is not allowed")
    return path.resolve(strict=True)


def contained_path(root, relative, *, must_exist=True):
    """Reject aliases even when their targets stay inside the allowed directory."""
    if not isinstance(relative, str) or relative in ("", "."):
        raise ValueError("unsafe relative evidence path")
    name = PurePosixPath(relative)
    if (name.is_absolute()
            or name.as_posix() != relative or any(p in (".", "..") for p in name.parts)
            or "\\" in relative or "\x00" in relative):
        raise ValueError("unsafe relative evidence path")
    root = Path(root)
    path = root / relative
    for parent in (path, *path.parents):
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError("evidence path symlink is not allowed")
    if not path.resolve(strict=must_exist).is_relative_to(root):
        raise ValueError("evidence path escapes root")
    return path


def preflight_receipt(batch, receipt):
    """Bind host arguments to the persisted receipt and manifest without writing."""
    if not isinstance(receipt, dict):
        raise ValueError("expected receipt object")
    collector.safe_component(receipt.get("run_key"), "run_key")
    batch = checked_directory(Path(batch).absolute())
    directory = receipt.get("directory")
    if not isinstance(directory, str):
        raise ValueError("expected receipt directory")
    root = checked_directory(directory)
    if root.is_relative_to(batch) or batch.is_relative_to(root):
        raise ValueError("overlapping task/evidence directories")
    path = contained_path(batch, receipt["run_key"] + "-receipt.json")
    stored = read_json(path)
    if b4.json_bytes(stored) != b4.json_bytes(receipt):
        raise ValueError("supplied/persisted receipt identity mismatch")
    manifest = read_json(contained_path(batch, "manifest.json"))
    runs = manifest.get("runs") if isinstance(manifest, dict) else None
    if not isinstance(runs, list) or any(not isinstance(r, dict) for r in runs):
        raise ValueError("invalid manifest runs")
    matches = [r for r in runs if r.get("run_key") == receipt["run_key"]]
    if len(matches) != 1 or b4.json_bytes(matches[0]) != b4.json_bytes(stored):
        raise ValueError("manifest/receipt identity mismatch")
    collector.validate_root(root)
    collector.read_receipt(batch, receipt, root)
    return batch, root


def capture_phase(batch, receipt, agent_id, message, label, *, sessions_root=None,
                  validate_session=None):
    """Preflight all identities/paths before any output; sessions_root is for tests."""
    collector.safe_component(agent_id, "agent_id")
    collector.safe_component(label, "phase")
    batch, root = preflight_receipt(batch, receipt)
    dest = contained_path(batch, "phases/" + receipt["run_key"] + "/" + label, must_exist=False)
    if dest.exists():
        raise FileExistsError("refusing to overwrite complete or partial phase")
    sessions = checked_directory(sessions_root if sessions_root is not None else Path.home() / ".codex/sessions")
    paths = [p for p in sessions.rglob("*" + agent_id + ".jsonl")
             if p.stem == agent_id or p.stem.endswith("-" + agent_id)]
    if len(paths) != 1:
        raise ValueError("expected one exact session")
    session = contained_path(sessions, paths[0].relative_to(sessions).as_posix())
    if not session.is_file():
        raise ValueError("expected session file")
    data = collector.read_public_session(session, message)
    if data["session"].get("id") != agent_id:
        raise ValueError("wrong session")
    if validate_session is not None:
        validate_session(data)
    dest.mkdir(parents=True, exist_ok=False)
    public = data.pop("public")
    b4.write_new(dest / "public-trace.jsonl", collector.public_jsonl(public).encode())
    b4.write_new(dest / "final.md", ("\n\n".join(data.pop("finals")) + "\n").encode())
    for name in ("workspace", "harness"):
        if (root / name).exists():
            shutil.copytree(root / name, dest / name)
    save(dest / "metadata.json", dict(agent_id=agent_id, message=message, **data))
    save(dest / "hashes.json", b4.inventory(dest))
    return dest
