#!/usr/bin/env python3
"""Export an isolated secretary exercise; no grading criteria are included."""
import argparse
import json
from pathlib import Path
import shutil


def task(key, title, status="todo", parent=None, deps=(), done_when="既定结果通过", source="sources/owner.md"):
    return {"id": key, "title": title, "parent_id": parent, "depends_on": list(deps),
            "scope": "accepted", "status": status, "owner": "writer", "done_when": done_when,
            "source": source, "evidence": ["sources/initial-results.md"] if status == "done" else [],
            "updated_at": "2026-09-28T09:30:00+08:00"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=False)
    here = Path(__file__).resolve().parent
    skill = here.parents[1] / "skills/delivery-secretary"
    shutil.copytree(skill, args.destination / "skill", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    project = args.destination / "project"
    sources = project / "sources"
    sources.mkdir(parents=True)
    for path in (here / "raw").glob("*.md"):
        if path.name != "followup.md":
            shutil.copy2(path, sources / path.name)
    data = json.loads((skill / "assets/ledger.json").read_text())
    data.update(project="CRI exercise", revision=6, as_of="2026-09-28T09:30:00+08:00",
                roles={role: {"thread_id": "fixture-" + role, "authorization_ref": "sources/owner.md",
                              "allowed_actions": ["status_questions", "existing_task_reminders"]}
                       for role in ("writer", "reviewer")})
    tasks = [task("CRI", "交付 CRI service", "doing", done_when="现有 CRI 交付条件全部满足"),
             task("SERVICE", "CRI 实现", "blocked", "CRI", ["WS"]),
             task("WS", "Workspace delete ready", "doing", deps=["CAP"]),
             task("CAP", "功能 A", "doing", done_when="F1-F4 按已批准范围闭环"),
             task("F1", "功能 A 的第 1 项", "doing", "CAP"),
             task("F2", "功能 A 的第 2 项", "done", "CAP"),
             task("F3", "功能 A 的第 3 项", parent="CAP"),
             task("F4", "功能 A 的第 4 项", parent="CAP"),
             *[task(f"L{i}", f"第 1 项的子任务 {i}", "done" if i == 3 else "todo", "F1") for i in range(1, 6)]]
    states = ["done"] * 18 + ["failed"] * 3 + ["todo"] * 4 + ["blocked"] * 2
    tasks += [task(f"T{i:03}", f"既定测试 {i}", state, "WS", ["CAP"] if i >= 26 else (),
                   done_when=f"既定测试 {i} 的适用执行结果通过") for i, state in enumerate(states, 1)]
    review = task("REVIEW", "Workspace delete 源码评审", "done", "WS", done_when="当前提交对象获得 Reviewer 放行")
    review.update(owner="reviewer", evidence=["sources/initial-results.md#review"])
    tasks.append(review)
    data.update(tasks=tasks, collections=[{"id": "ORIGINAL-27", "title": "原始 27 项测试",
                                          "task_ids": [f"T{i:03}" for i in range(1, 28)],
                                          "source": "sources/owner.md"}],
                focus=["CRI", "SERVICE", "WS", "CAP", "F1", "L1"],
                questions=[{"id": "Q-001", "task_ids": ["T019"], "to": "writer", "status": "pending",
                            "question": "T019 修复对应的既定复测是否通过？请给结果引用。",
                            "basis": ["sources/updates.md#writer"], "sent_ref": "fixture://message-001",
                            "answer_ref": None, "follow_up_when": "Writer 回复或提供新结果"}])
    (project / "ledger.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(args.destination)


if __name__ == "__main__":
    main()
