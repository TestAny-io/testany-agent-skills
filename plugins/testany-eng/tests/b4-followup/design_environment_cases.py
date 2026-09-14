"""Prepare D01/E01 for pre-dispatch review; never launch or collect agents."""

import argparse
import copy
import hashlib
import json
from pathlib import Path

import fixture_support as support


HOME = Path(__file__).resolve().parent
ASSETS = HOME / "design-environment-assets"
ROOT = HOME.parents[3]
DEFAULT_OUTPUT = ROOT / "output/gpt6-b4-followup-2026-09-14/design-environment"
DEFAULT_PREPARED = DEFAULT_OUTPUT / "prepared"
DEFAULT_ARCHIVE = ROOT / "output/gpt6-b4-2026-09-14/repair-start/candidate-v2.tar.gz"
CASES = ("D01", "E01")
MODELS = (("astra", "gpt-6-astra"), ("terra", "gpt-5.6-terra"))


def case_path(case_id):
    if case_id not in CASES:
        raise ValueError("unknown design/environment case: " + repr(case_id))
    return ASSETS / case_id


def request_for(case_id):
    return (case_path(case_id) / "request.md").read_text(encoding="utf-8").strip()


def expected_for(case_id):
    return json.loads((case_path(case_id) / "expected.json").read_text(encoding="utf-8"))


def materialize(root, case_id):
    """Copy only raw business inputs and the real local-tool launcher."""
    source = case_path(case_id) / "inputs"
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("fixture assets must not contain symlinks")
        if path.is_file():
            relative = path.relative_to(source)
            if relative.parts[0] not in {"workspace", "harness"}:
                raise ValueError("non-business payload path")
            target = Path(root) / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as stream:
                stream.write(path.read_bytes())


def prepare_case(batch, case_id, *, archive=DEFAULT_ARCHIVE):
    return support.prepare(
        batch=Path(batch), case_id=case_id, request=request_for(case_id),
        expected=copy.deepcopy(expected_for(case_id)),
        materialize=lambda root: materialize(root, case_id), repeats=1,
        archive=Path(archive),
    )


def prepare_all(output=DEFAULT_PREPARED, *, archive=DEFAULT_ARCHIVE):
    """Four independent roots, one repeat/model/case; scheduling is a later action."""
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    plan = []
    for case_id in CASES:
        for label, model in MODELS:
            batch = output / case_id / label
            receipt, = prepare_case(batch, case_id, archive=archive)
            plan.append({
                "case_id": case_id, "model": model, "reasoning_effort": "high",
                "fork_context": False, "repeats": 1, "batch": str(batch.resolve()),
                "receipt": receipt, "message": support.dispatch_message(receipt),
            })
    support.save(output / "dispatch-plan.frozen.json", {
        "status": "PREPARED_NOT_DISPATCHED", "dispatched": False,
        "max_concurrent_agents": 1, "collect_and_close_before_next": True,
        "claude_host_acceptance": "skipped_by_user", "skilldock": "excluded",
        "runs": plan,
    })
    review = ["# D01/E01 主持者预派发 QA", "", "状态：输入已准备、未派发。本文件用于设施 QA，不是追加用户审批。", "",
              "每 case：gpt-6-astra/high 1 次、gpt-5.6-terra/high 1 次；独立 fork_context:false。",
              "最多一个被测 agent 并发；每个完成公开收证并 close 后才能启动下一个。", ""]
    for case_id in CASES:
        review.extend(["## " + case_id + " 精确用户任务", "", "```text", request_for(case_id), "```", "",
                       "### 预冻结 Expected", "", "```json",
                       json.dumps(expected_for(case_id), ensure_ascii=False, indent=2), "```", ""])
    review.extend(["## 冻结与限制", "",
                  "输入、request、expected 及安装资源以各批次 receipt/manifest 和 input archive 为准。",
                  "Expected/facility snapshot 仅存在证据目录，不进入任务根；每个任务根随机且含空格。",
                  "这是合成业务场景，不是外部真实组织审批或真实平台验收；Claude 宿主验收跳过，SkillDock 排除。",
                  "公开证据只使用既有 collect_evidence；不读取私有 analysis、不访问其他任务或凭据。",
                  "目录/网络约束是任务协议，不是 OS 沙箱；实际派发仍须核验宿主的隔离与模型能力。", ""])
    support.b4.write_new(output / "PREDISPATCH-REVIEW.md", "\n".join(review).encode())
    support.save(output / "review-hashes.json", {
        str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in (output / "dispatch-plan.frozen.json", output / "PREDISPATCH-REVIEW.md")
    })
    return plan


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_PREPARED)
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    args = parser.parse_args(argv)
    plans = prepare_all(args.output, archive=args.archive)
    print(json.dumps({"prepared_not_dispatched": len(plans), "output": str(args.output.resolve())}))


if __name__ == "__main__":
    main()
