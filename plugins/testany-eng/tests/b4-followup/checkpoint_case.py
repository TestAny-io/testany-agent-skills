"""Freeze T12/legacy C06 and collect real turns; never dispatch an agent."""

import argparse
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile

import fixture_support as support

HOME = Path(__file__).resolve().parent
ASSETS = HOME / "checkpoint-assets"
RAW = HOME.parent / "gpt6-adaptation/raw"
OUTPUT = support.ROOT / "output/gpt6-b4-followup-2026-09-14/checkpoint"
DEFAULT = support.DEFAULT_ARCHIVE
CASE_ID = "T12-legacy-C06-media-writer"
TRAJECTORIES = (("astra", "gpt-6-astra"), ("terra", "gpt-5.6-terra"))
WRITES = (
    ("workspace/brief-reviewed.md",),
    ("workspace/sources-reviewed.md",),
    (),
    ("workspace/outline.md", "workspace/draft.md", "workspace/article.md",
     "workspace/edit-notes.md"),
)
SKILL = "plugins/testany-mrkt/skills/media-writer/"
RESOURCES = (
    "SKILL.md", "references/execution-modes.md",
    "references/prompts/01-topic-scout.md", "references/prompts/02-researcher.md",
    "references/prompts/03-strategist.md", "references/prompts/04-writer-wechat.md",
    "references/prompts/06-logic-editor.md", "references/prompts/06-style-editor.md",
    "references/prompts/06-detail-editor.md", "references/platforms/wechat-guide.md",
    "references/persona/my-voice.md", "references/persona/my-values.md",
    "references/persona/my-audience.md",
)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


@contextmanager
def local_temporary_roots(directory):
    """Keep shared prepare's temporary task roots inside the authorized output."""
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    previous = tempfile.tempdir
    tempfile.tempdir = str(directory)
    try:
        yield
    finally:
        tempfile.tempdir = previous


def requests():
    turns = [(ASSETS / f"round-{n:02}.md").read_text(encoding="utf-8").strip()
             for n in range(1, 5)]
    legacy = (RAW / "requests/C06.md").read_text(encoding="utf-8").strip()
    if not turns[0].startswith(legacy + "\n"):
        raise ValueError("round 1 must preserve the exact legacy C06 request")
    return turns


def materialize(root):
    for name in ("brief.md", "sources.md"):
        support.b4.write_new(root / "workspace" / name, (RAW / "article" / name).read_bytes())


def scope_report(before, after, phase):
    if type(phase) is not int or not 1 <= phase <= 4:
        raise ValueError("phase must be 1..4")
    allowed = set(WRITES[phase - 1])
    changed = sorted(n for n in before.keys() | after.keys() if before.get(n) != after.get(n))
    violations = [n for n in changed if n not in allowed or n not in after
                  or "sha256" not in after[n]]
    missing = [n for n in sorted(allowed) if "sha256" not in after.get(n, {})]
    return dict(phase=phase, changed=changed, violations=violations, missing=missing,
                static_scope_pass=not violations and not missing,
                semantic_review_required=True)


def prepare_case(base=OUTPUT, archive=DEFAULT):
    base = Path(base).resolve()
    base.mkdir(parents=True, exist_ok=True)
    turns = requests()
    frozen = support.b4.snapshot("candidate", {"candidate": Path(archive)})
    runtime = {}
    for relative in RESOURCES:
        name = SKILL + relative
        node = frozen["tree"].get(name, {})
        if "data" not in node:
            raise ValueError("missing archived media-writer resource: " + name)
        runtime[name] = support.b4.sha(node["data"])
    expected = dict(case_id=CASE_ID, historical_scenario="T12", legacy_case="C06",
        skill="media-writer", archive_sha256=frozen["archive_sha256"],
        rounds=[dict(phase=n, only_writes=list(paths), wait=n < 4)
                for n, paths in enumerate(WRITES, 1)],
        rubric=(ASSETS / "rubric.md").read_text(encoding="utf-8"),
        semantic_review_required=True, claude_host="skipped", skilldock="excluded")
    support.save(base / "expected.frozen.json", expected)
    support.b4.write_new(base / "rubric.frozen.md", expected["rubric"].encode())
    for name in ("article/brief.md", "article/sources.md", "requests/C06.md"):
        support.b4.write_new(base / "provenance" / name, (RAW / name).read_bytes())
    plans = []
    for key, model in TRAJECTORIES:
        batch = base / key
        with local_temporary_roots(base / "task-roots"):
            receipt, = support.prepare(batch, CASE_ID, turns[0], expected, materialize,
                                       repeats=1, archive=archive)
        messages = [support.dispatch_message(receipt)]
        for text in turns[1:]:
            messages.append(f"继续同一任务，任务根仍为 {receipt['directory']}。"
                            "所有命令明确指定该任务根或其 workspace 为 workdir。\n\n" + text)
        plans.append(dict(key=key, model=model, effort="high", fork_context=False,
                          repeats=1, batch=key, run_key=receipt["run_key"],
                          messages=messages, request_sha256=support.b4.sha(turns[0].encode())))
    support.save(base / "requests.frozen.json", dict(requests=turns, trajectories=plans))
    support.save(base / "plan.frozen.json", dict(status="dispatch_authorized",
        max_live_agents=1, actual_turns_per_trajectory=4, trajectories=plans,
        runtime_resources=runtime, source_archive=str(Path(archive).resolve()),
        source_archive_sha256=frozen["archive_sha256"], dispatch_implemented=False))
    sections = ["# 派发前审阅：T12 / legacy C06 media-writer\n",
                "状态：dispatch_authorized。用户已完成主持者预审，tests 通过并冻结后可派发；尚无模型行为结果。\n",
                f"B4v2 archive SHA-256：`{frozen['archive_sha256']}`\n",
                "Astra/high 主测一次、Terra/high 交叉一次，均 fork_context:false；串行运行。\n"]
    for n, text in enumerate(turns, 1):
        sections.append(f"## 第 {n} 轮业务请求（原文）\n\n{text}\n")
    sections.append("## 精确派发消息\n\nrequests.frozen.json 保存每条轨迹的四条完整 message，"
                    "第一条为共享 dispatch_message 入口；request.md 仅含第一轮业务请求。\n")
    sections.append(expected["rubric"])
    support.b4.write_new(base / "review.md", "\n".join(sections).encode())
    protected = ["expected.frozen.json", "rubric.frozen.md", "requests.frozen.json",
                 "plan.frozen.json", "review.md"]
    for plan in plans:
        protected.extend(f"{plan['key']}/{name}" for name in
                         ("tasks.json", "manifest.json", "expected.frozen.json",
                          plan["run_key"] + "-receipt.json", plan["run_key"] + "-input.tar.gz"))
    support.save(base / "freeze-lock.json", {name: support.b4.sha((base / name).read_bytes())
                                             for name in protected})
    return plans


def verify_freeze(base):
    base = Path(base)
    for name, digest in read_json(base / "freeze-lock.json").items():
        if support.b4.sha((base / name).read_bytes()) != digest:
            raise ValueError("frozen review input changed: " + name)


def plan_and_receipt(base, key):
    base = Path(base)
    verify_freeze(base)
    plans = read_json(base / "plan.frozen.json")["trajectories"]
    plan = next((p for p in plans if p["key"] == key), None)
    if plan is None:
        raise ValueError("unknown trajectory")
    receipt, = read_json(base / key / "tasks.json")
    return plan, receipt


def bind_agent(base, key, agent_id, approval_message):
    """Call only after user approval and a real fork_context:false spawn."""
    base = Path(base)
    plan_and_receipt(base, key)
    support.collector.safe_component(agent_id, "agent_id")
    if not isinstance(approval_message, str) or not approval_message.strip():
        raise ValueError("actual user approval message required")
    for prior_key, _ in TRAJECTORIES:
        binding = base / prior_key / "agent.json"
        if binding.exists():
            if read_json(binding)["agent_id"] == agent_id:
                raise ValueError("independent trajectories cannot share an agent")
            if not (base / prior_key / "closed.json").exists():
                raise ValueError("close the active agent before binding another")
    if key == "terra" and not (base / "astra/closed.json").exists():
        raise ValueError("Astra main trajectory must run and close first")
    support.save(base / key / "agent.json", dict(agent_id=agent_id,
        approval_message=approval_message, declared_fork_context=False))


def message_for(base, key, phase):
    if type(phase) is not int or not 1 <= phase <= 4:
        raise ValueError("phase must be 1..4")
    base = Path(base)
    plan, receipt = plan_and_receipt(base, key)
    if not (base / key / "agent.json").exists() or (base / key / "closed.json").exists():
        raise ValueError("an approved active agent binding is required")
    for earlier in range(1, phase):
        if not (phase_path(base, key, receipt, earlier) / "turn-evidence.json").exists():
            raise ValueError("capture each prior completed turn before continuing")
    if phase_path(base, key, receipt, phase).exists():
        raise ValueError("phase already captured; do not replay")
    return plan["messages"][phase - 1]


def phase_path(base, key, receipt, phase):
    return Path(base) / key / "phases" / receipt["run_key"] / f"round-{phase:02}"


def turn_delta(current, previous, message):
    """Shared capture is cumulative except user messages; keep its raw files intact."""
    nonuser = lambda rows: [row for row in rows if row.get("role") != "user"]
    old, new = nonuser(previous), nonuser(current)
    if new[:len(old)] != old:
        raise ValueError("public evidence is not a same-session cumulative prefix")
    users = [r for r in current if r.get("role") == "user"]
    if len(users) != 1 or support.collector.content_text(users[0]["content"]) != message:
        raise ValueError("exact current user message missing from public evidence")
    remaining = len(old)
    result = []
    for row in current:
        if row.get("role") == "user":
            result.append(row)
        elif remaining:
            remaining -= 1
        else:
            result.append(row)
    return result


def read_trace(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def capture_turn(base, key, phase, agent_id):
    base = Path(base)
    message = message_for(base, key, phase)
    plan, receipt = plan_and_receipt(base, key)
    if read_json(base / key / "agent.json")["agent_id"] != agent_id:
        raise ValueError("all four turns must use the same bound agent")
    # Only the shared public collector accesses the exact authorized agent session.
    dest = support.capture_phase(base / key, receipt, agent_id, message, f"round-{phase:02}")
    previous = phase_path(base, key, receipt, phase - 1) if phase > 1 else None
    prior_trace = read_trace(previous / "public-trace.jsonl") if previous else []
    delta = turn_delta(read_trace(dest / "public-trace.jsonl"), prior_trace, message)
    finals = [support.collector.content_text(r["content"]) for r in delta
              if r.get("role") == "assistant" and r.get("channel") in ("final", "final_answer")]
    metadata = read_json(dest / "metadata.json")
    contexts = metadata["contexts"]
    issues = []
    if len(finals) != 1 or not finals[0].strip() or len(contexts) != phase:
        issues.append("cannot establish exactly one new real completed turn")
    if any(c.get("model") != plan["model"] or c.get("effort") != plan["effort"] for c in contexts):
        issues.append("actual model/effort mismatch")
    before = read_json(previous / "task-inventory.json") if previous else receipt["input_manifest"]
    after = support.b4.inventory(Path(receipt["directory"]))
    support.b4.write_new(dest / "turn-public-trace.jsonl", support.collector.public_jsonl(delta).encode())
    support.b4.write_new(dest / "turn-final.md", ("\n\n".join(finals) + "\n").encode())
    support.save(dest / "task-inventory.json", after)
    support.save(dest / "scope-report.json", scope_report(before, after, phase))
    support.save(dest / "turn-evidence.json", dict(phase=phase, agent_id=agent_id,
        message=message, message_sha256=support.b4.sha(message.encode()), issues=issues,
        status="evidence_incomplete" if issues else "semantic_review_pending",
        semantic_review_required=True))
    support.save(dest / "extended-hashes.json", support.b4.inventory(dest))
    return dest


def mark_closed(base, key, agent_id, close_tool_result):
    """Record successful actual close after collection; this function does not close."""
    base = Path(base)
    _, receipt = plan_and_receipt(base, key)
    if read_json(base / key / "agent.json")["agent_id"] != agent_id:
        raise ValueError("wrong agent")
    if any(not (phase_path(base, key, receipt, phase) / "turn-evidence.json").exists()
           for phase in range(1, 5)):
        raise ValueError("four real captured turns required before normal close record")
    # Normal close follows four completed turns; no other status is sufficient.
    previous = close_tool_result.get("previous_status") if isinstance(close_tool_result, dict) else None
    if (not isinstance(close_tool_result, dict) or set(close_tool_result) != {"previous_status"}
            or not isinstance(previous, dict) or set(previous) != {"completed"}
            or not isinstance(previous["completed"], str) or not previous["completed"].strip()):
        raise ValueError("successful actual close tool result required")
    support.save(base / key / "closed.json", dict(agent_id=agent_id, tool_result=close_tool_result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare",))
    parser.parse_args()
    plans = prepare_case()
    print(json.dumps(dict(status="dispatch_authorized", review=str(OUTPUT / "review.md"),
                          trajectories=[p["key"] for p in plans]), ensure_ascii=False))


if __name__ == "__main__":
    main()
