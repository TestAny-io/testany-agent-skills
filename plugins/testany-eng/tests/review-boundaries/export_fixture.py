#!/usr/bin/env python3
"""Export one raw review request and the installed-layout skill dependencies.

This copies fixtures into a new/empty disposable directory. It neither runs a
review nor reads the grader expectations. No network or working-repository edits.
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path


FIXTURES = Path(__file__).resolve().parent
PLUGIN = FIXTURES.parents[1]
SKILLS = ("guide", "hld-reviewer", "lld-reviewer", "code-reviewer")
IGNORED = shutil.ignore_patterns("tests", "__pycache__", "*.pyc")


def materialize(case_id: str, output: Path) -> Path:
    source = FIXTURES / "raw" / f"{case_id}.md"
    if case_id not in {path.stem for path in (FIXTURES / "raw").glob("RB-*.md")}:
        raise ValueError(f"unknown case: {case_id}")
    output = output.resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("output must be a new or empty directory")
    output.mkdir(parents=True, exist_ok=True)
    plugin = output / "plugin"
    for skill in SKILLS:
        shutil.copytree(PLUGIN / "skills" / skill, plugin / "skills" / skill, ignore=IGNORED)
        command = plugin / "commands" / f"{skill}.md"
        command.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(PLUGIN / "commands" / command.name, command)
    for directory in ("references", "scripts"):
        shutil.copytree(PLUGIN / directory, plugin / directory, ignore=IGNORED)
    manifest = json.loads((PLUGIN / "workflow-package.json").read_text())
    for relative in ["workflow-package.json", *manifest["files"]]:
        target = plugin / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PLUGIN / relative, target)
    shutil.copy2(source, output / "request.md")
    (output / "entry.md").write_text(
        "# 独立评审任务\n\n"
        "请阅读同目录 `request.md` 中的原始用户请求及所附材料，"
        "按实际问题选择并读取 `plugin/skills/` 下适用的 skill 与所需 references。"
        "这里只有隔离评估材料；不要回到来源仓库或读取任何 grader/evaluation 文件。"
        "给出路由理由、结论、必要的最小下一步与执行权限边界。"
        "材料未提供的事实与未运行的验证要如实说明，不假装已检查真实系统。"
        "不要改产品代码、发布策略或操作外部环境。\n",
        encoding="utf-8",
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case_id")
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    output = arguments.output or Path(tempfile.mkdtemp(prefix="review-boundary-case-"))
    result = materialize(arguments.case_id, output)
    print(json.dumps({"entry": str(result / "entry.md"), "request": str(result / "request.md")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
