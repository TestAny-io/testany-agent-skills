#!/usr/bin/env python3
"""Export one isolated raw review input; never load or copy the grader."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
SKILL = HERE.parent
SHARED_REFERENCES = SKILL.parents[1] / "references"
SHARED_REFERENCE_NAMES = ("language-policy.md", "subagent-result-contract.md")
CASES = {
    "CRB-001": ("resource", "r1", None),
    "CRB-002": ("resource", "r2", None),
    "CRB-003": ("permission", "r1", None),
    "CRB-004": ("permission", "r2", None),
    "CRB-005": ("lifecycle", "r1", None),
    "CRB-006": ("lifecycle", "r2", None),
    "CRB-007": ("lifecycle", "r2", "diagnostics"),
    "CRB-008": ("resource", "r2", "author_notes"),
    "CRB-009": ("resource", "r2", "evidence_inventory"),
}


def stage_sources(destination: Path, family: str, revision: str, control=None) -> None:
    """Copy executable source artifacts, without deriving expected behavior."""
    destination.mkdir(parents=True, exist_ok=True)
    selected = {"approval.md": "approval.md"}
    if family == "resource":
        selected.update({"provider.py": "provider.py", "gate.py": f"gate_{revision}.py"})
        if revision != "r0":
            selected["test_gate.py"] = f"test_{revision}.py"
    elif family == "permission":
        selected.update({
            "probe.sh": f"probe_{revision}.sh", "run_probe.sh": "run_probe.sh",
            "bin/kubectl": "kubectl",
        })
        if revision != "r0":
            selected["test_probe.py"] = "test_probe.py"
    elif family == "lifecycle":
        selected.update({"runtime.py": "runtime.py", "finish.py": f"finish_{revision}.py"})
        if revision != "r0":
            selected["test_finish.py"] = "test_finish.py"
    else:
        raise ValueError(f"unknown source family: {family}")
    for relative, source in selected.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(RAW / family / source, target)
        if relative == "bin/kubectl":
            target.chmod(0o755)
    if control:
        shutil.copyfile(RAW / "controls" / f"{control}.md", destination / f"{control}.md")
    if control == "evidence_inventory":
        shutil.copyfile(RAW / "controls" / "provider_external.py", destination / "provider.py")


def git(root: Path, *arguments: str) -> str:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    environment.update({
        "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_AUTHOR_DATE": "2026-01-01T00:00:00+0000",
        "GIT_COMMITTER_DATE": "2026-01-01T00:00:00+0000",
    })
    result = subprocess.run(
        ["git", "-c", "core.hooksPath=" + os.devnull, "-c", "commit.gpgsign=false",
         "-c", "user.name=Review Fixture", "-c", "user.email=fixture@example.invalid",
         *arguments], cwd=root, env=environment, text=True, capture_output=True, check=True,
    )
    return result.stdout.strip()


def materialize(case_id: str, bundle: Path, *, include_skill: bool = True) -> dict:
    family, revision, control = CASES[case_id]
    bundle = bundle.resolve()
    if bundle.exists() and any(bundle.iterdir()):
        raise ValueError("output must be a new or empty directory")
    bundle.mkdir(parents=True, exist_ok=True)
    repository = bundle / "repository"
    stage_sources(repository, family, "r0", control)
    (repository / ".gitignore").write_text("__pycache__/\n*.pyc\n", encoding="utf-8")
    git(repository, "init", "--quiet", "--initial-branch=review-input")
    git(repository, "add", "--all")
    git(repository, "commit", "--quiet", "-m", "Review base")
    base = git(repository, "rev-parse", "HEAD")
    stage_sources(repository, family, "r1", control)
    git(repository, "add", "--all")
    git(repository, "commit", "--quiet", "-m", "Candidate revision 1")
    if revision == "r2":
        stage_sources(repository, family, "r2", control)
        git(repository, "add", "--all")
        git(repository, "commit", "--quiet", "-m", "Candidate revision 2")
    binding = {
        "repository_identity": "local/review-sample",
        "repository_root": str(repository),
        "review_root_base": base,
        "candidate": git(repository, "rev-parse", "HEAD"),
        "candidate_tree": git(repository, "rev-parse", "HEAD^{tree}"),
    }
    (bundle / "binding.json").write_text(json.dumps(binding, indent=2) + "\n", encoding="utf-8")
    if include_skill:
        skill_snapshot = bundle / "plugin" / "skills" / "code-reviewer"
        shutil.copytree(
            SKILL, skill_snapshot,
            ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc"),
        )
        shared_snapshot = bundle / "plugin" / "references"
        shared_snapshot.mkdir(parents=True)
        for name in SHARED_REFERENCE_NAMES:
            shutil.copyfile(SHARED_REFERENCES / name, shared_snapshot / name)
    skill_path = bundle / "plugin" / "skills" / "code-reviewer" / "SKILL.md" if include_skill else SKILL / "SKILL.md"
    request = f"""请使用 {skill_path} 对此本地 Candidate 做首次完整 Code Review。

Repository identity: {binding['repository_identity']}
Repository root: {repository}
Review Root Base: {binding['review_root_base']}
Candidate SHA: {binding['candidate']}
Candidate tree: {binding['candidate_tree']}

批准需求和预算在 repository/approval.md，其他材料清单与作者说明在仓库内。
审查精确 base..Candidate；可执行本地只读诊断与临时测试，报告写在 {bundle / 'review-report.md'}。
仅评审，不修改 Candidate 或提交，不调用网络、真实集群、数据库或产品服务。
本次材料是缩小的本地案例；报告如实说明证据的实际边界。
"""
    (bundle / "request.md").write_text(request, encoding="utf-8")
    return binding


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case_id", choices=sorted(CASES))
    parser.add_argument("--output", type=Path, help="new or empty output directory; defaults to a temp directory")
    arguments = parser.parse_args()
    output = arguments.output or Path(tempfile.mkdtemp(prefix="code-review-input-"))
    binding = materialize(arguments.case_id, output)
    print(json.dumps({"input_directory": str(output.resolve()), **binding}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
