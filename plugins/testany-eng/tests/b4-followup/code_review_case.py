"""Prepare a genuine two-turn Git review case; this module never dispatches agents."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

sys.dont_write_bytecode = True
import fixture_support as support

HOME = Path(__file__).resolve().parent
ASSETS = HOME / "code-review-assets"
OUTPUT = support.ROOT / "output/gpt6-b4-followup-2026-09-14/code-review"
ARCHIVE_SHA256 = "3f9938ddb883393bc152f79c25709ebd4e4b3e93d63187f359fc8c95bc307431"
MODELS = ("gpt-6-astra", "gpt-5.6-terra")
CASE_ID = "code-review"
SOURCE = "job_queue.py"
TEST = "tests/test_job_queue.py"
BAD_LINES = "            job = self._pending.pop(0)\n            results.append(handler(job))\n"
GOOD_LINES = "            results.append(self.run_next(handler))\n"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def asset(name):
    return (ASSETS / name).read_text(encoding="utf-8")


def save(path, value):
    support.save(path, value)


def git(repo, *args):
    # Do not consult user/global Git configuration, credentials, hooks or replace refs.
    env = {"PATH": os.environ["PATH"], "GIT_CONFIG_NOSYSTEM": "1",
           "GIT_CONFIG_GLOBAL": os.devnull, "GIT_NO_REPLACE_OBJECTS": "1",
           "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C", "TZ": "UTC",
           "GIT_AUTHOR_DATE": "2026-09-14T00:00:00+0000",
           "GIT_COMMITTER_DATE": "2026-09-14T00:00:00+0000"}
    return subprocess.run(["git", "-c", "user.name=Local Fixture Owner", "-c",
                           "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false",
                           "-c", "core.hooksPath=" + str(Path(repo).resolve() / ".git/hooks"),
                           "-c", "tag.gpgSign=false", "-c", "core.autocrlf=false",
                           *args], cwd=repo, env=env, check=True, capture_output=True).stdout


def commit(repo, message):
    git(repo, "add", "--all")
    git(repo, "commit", "--no-gpg-sign", "-m", message)
    return git(repo, "rev-parse", "HEAD").decode().strip()


def binding(repo, previous, current):
    raw = git(repo, "diff", "--name-status", "--no-renames", "-z", "--no-ext-diff",
              "--no-textconv", "--ignore-submodules=none", previous, current, "--")
    return {"repository_identity": "local/batch-queue", "reviewed_from": previous,
            "candidate": current, "tree": git(repo, "rev-parse", current + "^{tree}").decode().strip(),
            "manifest_raw_hex": raw.hex(), "manifest_sha256": sha(raw)}


def materialize(root):
    repo = Path(root) / "workspace"
    repo.mkdir(parents=True, exist_ok=True)
    if any(repo.iterdir()):
        raise ValueError("workspace must be empty")
    shutil.copytree(ASSETS / "workspace", repo, dirs_exist_ok=True)
    git(repo, "init", "--initial-branch=main", "--object-format=sha1", "--template=")
    (repo / ".git/hooks").mkdir(exist_ok=True)
    base = commit(repo, "Record approved local queue baseline")
    git(repo, "tag", "review-base", base)
    for path, suffix in ((SOURCE, "candidate-method.txt"), (TEST, "candidate-tests.txt")):
        (repo / path).write_text((repo / path).read_text() + asset(suffix), encoding="utf-8")
    candidate = commit(repo, "Add bounded batch execution")
    git(repo, "tag", "review-initial", candidate)
    save(repo / ".review/input.json", {**binding(repo, base, candidate),
        "review_root_base": base, "approval_evidence": "request.md#DEC-BATCH-1",
        "approved_baselines": {name: {"commit": base, "sha256": sha((repo / name).read_bytes())}
                               for name in ("requirements.md", "AGENTS.md", "README.md")}})
    if git(repo, "status", "--porcelain"):
        raise ValueError("unexpected tracked/untracked fixture changes")


def recipe():
    source = asset("workspace/" + SOURCE) + asset("candidate-method.txt")
    tests = asset("workspace/" + TEST) + asset("candidate-tests.txt")
    fixed = source.replace(BAD_LINES, GOOD_LINES)
    assert source.count(BAD_LINES) == 1
    return {"schema": "code-review-repair.v1", "operations": [
        {"path": SOURCE, "before_sha256": sha(source.encode()),
         "after_sha256": sha(fixed.encode()), "after": fixed},
        {"path": TEST, "before_sha256": sha(tests.encode()),
         "after_sha256": sha((tests + asset("repair-regression.txt")).encode()),
         "after": tests + asset("repair-regression.txt")}],
        "commit_message": "Preserve pending work when batch handler fails",
        "preconditions": ["real initial terminal and phase capture exist",
                          "host checks genuine complete coverage and empty SD/EB gaps",
                          "same agent stays open until delta completion"],
        "prohibition": "Never deliver this recipe or expected to the tested agent."}


def expected():
    return {"schema": "code-review-expectation.v1", "status": "NOT_RUN",
        "initial": {"mode": "initial_full_review", "verdict": "CHANGES_REQUIRED",
            "required_defect": {"severity": "P1", "invariant": "INV-2 and INV-3",
                "path": "job_queue.py:JobQueue.run_batch",
                "failure": "pop(0) precedes handler success, so a failed task vanishes from pending",
                "oracle": "requirements.md v1, directly approved in the genuine initial user request",
                "probe": {"initial": ["a", "b", "c"], "fail_on": "b", "limit": 3,
                          "actual_pending": ["c"], "required_pending": ["b", "c"]}},
            "coverage": [SOURCE, TEST, "unchanged run_next as direct behavioral dependency"],
            "source_tests": "Author tests pass but do not prove batch failure/retry behavior",
            "eligibility": "Actual complete coverage; both SD and EB gap arrays empty; read and verified full Record"},
        "delta": {"mode": "remediation_delta_review", "verdict": "APPROVED",
            "required": ["same main identity and Scope Lock ID/digest", "new Review ID and exact commit/tree",
                         "genuine initial terminal reference and digest", "preserve original blocking IDs and acceptance",
                         "rerun affected behavior including failure then retry", "no inherited CI or environment result",
                         "full coverage reuse explicitly justified, no fabricated initial coverage",
                         "close actual P0/P1; do not turn optional P2 into blocker"]},
        "both": {"ci": "NOT_RUN", "environment": "NOT_RUN", "network": False,
                 "no_source_edits_by_model": True, "no_expanded_scope": True},
        "grading": "Semantic preliminary assessment from public evidence; no exact phrase/finding-count shortcut. Independent final verification belongs to another reviewer.",
        "failure_policy": "If genuine first full review is incomplete or misses the defect, preserve that result and stop ordinary-delta success claims; never fabricate a prior report, rewrite answers, or bypass skill prerequisites."}


def phase_plan():
    return {"status": "COORDINATOR_PREDISPATCH_REVIEW", "max_active_agents": 1,
        "trajectories": [{"model": m, "reasoning_effort": "high", "fork_context": False,
                          "repeat": n, "turns": ["initial_full_review", "remediation_delta_review"]}
                         for n, m in enumerate(MODELS, 1)],
        "excluded": ["Claude host acceptance", "SkillDock", "skill-manager", "network", "real platforms"],
        "phases": [
            "Freeze initial inputs, expected, source recipe, exact delta-request template and facility before dispatch.",
            "After coordinator review, dispatch only support.dispatch_message(receipt) into a fresh isolated agent; user authorization already exists.",
            "Wait for genuine initial terminal. capture_turn(initial-complete) BEFORE any host repair; do not close agent.",
            "Read complete genuine initial Record and record explicitly bound structured delta eligibility. Missing prerequisites: preserve failure; do not forge or rubric-waive them.",
            "apply_repair from frozen recipe only. Save old/new binding, mutation log, actual delta user message outside task; no expected or recipe is injected.",
            "Send the saved exact user message to the SAME agent. Wait for completed delta terminal.",
            "capture_turn(delta-complete), close agent, then repeat whole trajectory for second model.",
            "Run existing B4 collector at final state with genuine dispatch records; phases remain authoritative for earlier states. Independent reviewer assesses separately."],
        "user_message_evidence": "Each capture verifies and separately archives its actual exact user message; phase 2's standard trace alone does not preserve phase 1 user input.",
        "snapshot_evidence": "Shared capture_phase preserves initial and delta workspace including .git, plus hashes and public contexts. Final collector snapshot is never labeled initial."}


def prepare_case(batch, archive=support.DEFAULT_ARCHIVE):
    archive = Path(archive)
    if sha(archive.read_bytes()) != ARCHIVE_SHA256:
        raise ValueError("only the frozen B4 repaired v2 archive is allowed")
    with tarfile.open(archive) as bundle:
        if len(bundle.getmembers()) != 503:
            raise ValueError("unexpected archive member count")
    receipts = support.prepare(Path(batch), CASE_ID, asset("request-initial.md"), expected(),
                               materialize, repeats=2, archive=archive)
    batch = Path(batch)
    save(batch / "repair.recipe.json", recipe())
    support.b4.write_new(batch / "request-delta.template.md", asset("request-delta.md").encode())
    save(batch / "phase-plan.json", phase_plan())
    save(batch / "trajectory-plan.json", [
        {"run_key": receipt["run_key"], "model": model, "reasoning_effort": "high",
         "fork_context": False, "dispatch_message": support.dispatch_message(receipt)}
        for receipt, model in zip(receipts, MODELS)])
    save(batch / "host-freeze.json", {name: sha((batch / name).read_bytes()) for name in (
        "repair.recipe.json", "request-delta.template.md", "phase-plan.json",
        "trajectory-plan.json", "expected.frozen.json", "manifest.json")})
    return receipts


def verify_frozen(batch):
    batch = support.checked_directory(Path(batch).absolute())
    hashes = support.read_json(support.contained_path(batch, "host-freeze.json"))
    for name, digest in hashes.items():
        if sha(support.contained_path(batch, name).read_bytes()) != digest:
            raise ValueError("frozen host material drift: " + name)


def checked_session(data, receipt, message):
    users = [row for row in data["public"] if row.get("role") == "user"
             and support.collector.content_text(row.get("content", [])) == message]
    if len(users) != 1:
        raise ValueError("phase needs one observed exact user message, not a host assertion")
    repeat = receipt.get("repeat")
    if type(repeat) is not int or not 1 <= repeat <= len(MODELS):
        raise ValueError("invalid trajectory repeat")
    model = MODELS[repeat - 1]
    if not data["contexts"] or any(row["model"] != model or row["effort"] != "high"
                                   for row in data["contexts"]):
        raise ValueError("actual session model/effort differs from frozen trajectory")
    return users[0]


def capture_turn(batch, receipt, agent_id, message, label, *, sessions_root=None):
    if label not in ("initial-complete", "delta-complete"):
        raise ValueError("unknown phase")
    batch, _ = support.preflight_receipt(batch, receipt)
    verify_frozen(batch)
    if label == "initial-complete" and message != support.dispatch_message(receipt):
        raise ValueError("initial message differs from planned real dispatch")
    if label == "delta-complete":
        prior = support.contained_path(batch, "phases/" + receipt["run_key"] + "/initial-complete")
        verify_phase(prior)
        if support.read_json(prior / "metadata.json")["agent_id"] != agent_id:
            raise ValueError("delta must use the original agent")
        actual = support.contained_path(batch, "mutations/" + receipt["run_key"] + "/delta-request.md")
        if actual.read_text() != message:
            raise ValueError("delta message differs from frozen-template instantiation")
    user_path = support.contained_path(batch, "user-messages/" + receipt["run_key"] + "/" + label + ".json",
                                       must_exist=False)
    if user_path.exists():
        raise FileExistsError("refusing to overwrite observed user evidence")
    users = []
    phase = support.capture_phase(batch, receipt, agent_id, message, label, sessions_root=sessions_root,
        validate_session=lambda data: users.append(checked_session(data, receipt, message)))
    save(user_path,
         {"agent_id": agent_id, "message_sha256": sha(message.encode()), "observed_user": users[0],
          "phase": str(phase), "phase_hashes_sha256": sha((phase / "hashes.json").read_bytes())})
    return phase


def verify_phase(phase):
    phase = support.checked_directory(phase)
    frozen = support.read_json(support.contained_path(phase, "hashes.json"))
    actual = support.b4.inventory(phase)
    actual.pop("hashes.json", None)
    if actual != frozen:
        raise ValueError("phase snapshot has drifted")


ELIGIBILITY_SCHEMA = "code-review-delta-eligibility.v1"
ELIGIBILITY_BINDINGS = {"schema", "run_key", "agent_id", "initial_phase", "terminal", "record"}
ELIGIBILITY_FLAGS = {"initial_full_coverage_complete", "scope_lock_verified",
                     "previous_candidate_reconstructable", "original_defect_reported"}
ELIGIBILITY_GAPS = {"unclassified", "scope_decision_blocked_ranges", "evidence_or_assignment_gaps"}


def initial_evidence_binding(batch, receipt, terminal_relative, record_relative):
    """Bind a host assessment to actual captured bytes, not a new reviewer verdict."""
    batch, root = support.preflight_receipt(batch, receipt)
    verify_frozen(batch)
    repo = support.checked_directory(root / "workspace")
    phase_name = "phases/" + receipt["run_key"] + "/initial-complete"
    phase = support.contained_path(batch, phase_name)
    verify_phase(phase)
    metadata = support.read_json(support.contained_path(phase, "metadata.json"))
    if metadata["has_final"] is not True or metadata["task_complete_event"] is not True:
        raise ValueError("initial agent turn is not complete")
    agent_id = metadata["agent_id"]
    support.collector.safe_component(agent_id, "agent_id")
    if metadata["session"].get("id") != agent_id:
        raise ValueError("initial session identity mismatch")
    message = support.dispatch_message(receipt)
    with support.contained_path(phase, "public-trace.jsonl").open(encoding="utf-8") as stream:
        public = [json.loads(line) for line in stream if line.strip()]
    observed = checked_session({**metadata, "public": public}, receipt, message)
    phase_hash = sha((phase / "hashes.json").read_bytes())
    user = support.read_json(support.contained_path(batch,
        "user-messages/" + receipt["run_key"] + "/initial-complete.json"))
    if (user.get("agent_id") != agent_id or user.get("observed_user") != observed
            or user.get("message_sha256") != sha(message.encode()) or metadata.get("message") != message
            or user.get("phase_hashes_sha256") != phase_hash or user.get("phase") != str(phase)):
        raise ValueError("initial public message provenance mismatch")
    artifacts = {}
    if terminal_relative == record_relative:
        raise ValueError("terminal and Record must be distinct artifacts")
    for kind, relative in (("terminal", terminal_relative), ("record", record_relative)):
        if not isinstance(relative, str) or not relative.startswith(".review/initial/"):
            raise ValueError("initial artifact must be under .review/initial")
        original = support.contained_path(phase / "workspace", relative)
        current = support.contained_path(repo, relative)
        if not original.is_file() or not current.is_file():
            raise ValueError("expected initial artifact file")
        raw = original.read_bytes()
        if not raw.strip() or current.read_bytes() != raw:
            raise ValueError("genuine initial artifact is empty or has drifted")
        artifacts[kind] = {"path": relative, "sha256": sha(raw)}
    prior_reports = phase / "workspace/.review/initial"
    if support.b4.inventory(prior_reports) != support.b4.inventory(repo / ".review/initial"):
        raise ValueError("genuine initial record/evidence has drifted")
    input_raw = support.contained_path(repo, ".review/input.json").read_bytes()
    if (input_raw != support.contained_path(phase / "workspace", ".review/input.json").read_bytes()
            or sha(input_raw) != receipt["input_hashes"].get("workspace/.review/input.json")):
        raise ValueError("initial candidate input binding has drifted")
    return {"schema": ELIGIBILITY_SCHEMA, "run_key": receipt["run_key"], "agent_id": agent_id,
            "initial_phase": {"path": phase_name, "hashes_sha256": phase_hash}, **artifacts}


def validate_eligibility(document):
    if not isinstance(document, dict) or set(document) != ELIGIBILITY_BINDINGS | {
            "decision", "checks", "assessed_by", "rationale"}:
        raise ValueError("invalid structured eligibility fields")
    if document["schema"] != ELIGIBILITY_SCHEMA or document["decision"] not in ("ELIGIBLE", "INELIGIBLE"):
        raise ValueError("explicit structured eligibility decision required")
    for field in ("assessed_by", "rationale"):
        if not isinstance(document[field], str) or not document[field].strip():
            raise ValueError("eligibility assessment identity and rationale required")
    checks = document["checks"]
    if not isinstance(checks, dict) or set(checks) != ELIGIBILITY_FLAGS | ELIGIBILITY_GAPS:
        raise ValueError("invalid eligibility checks")
    if any(type(checks[k]) is not bool for k in ELIGIBILITY_FLAGS) or any(
            not isinstance(checks[k], list) for k in ELIGIBILITY_GAPS):
        raise ValueError("eligibility checks require booleans and gap arrays")
    if document["decision"] == "ELIGIBLE" and (
            not all(checks[k] for k in ELIGIBILITY_FLAGS) or any(checks[k] for k in ELIGIBILITY_GAPS)):
        raise ValueError("ELIGIBLE contradicts failed checks or open gaps")


def record_eligibility(batch, receipt, *, decision, terminal_relative, record_relative,
                       checks, assessed_by, rationale):
    """Persist an explicit human assessment; never infer ELIGIBLE from hashes."""
    binding = initial_evidence_binding(batch, receipt, terminal_relative, record_relative)
    document = {**binding, "decision": decision, "checks": checks,
                "assessed_by": assessed_by, "rationale": rationale}
    validate_eligibility(document)
    batch, _ = support.preflight_receipt(batch, receipt)
    path = support.contained_path(batch, "preflight/" + receipt["run_key"] + "/delta-eligibility.json",
                                  must_exist=False)
    save(path, document)
    return path


def apply_repair(batch, receipt, terminal_relative):
    """Host-only mutation after a bound, explicitly ELIGIBLE initial assessment."""
    batch, root = support.preflight_receipt(batch, receipt)
    verify_frozen(batch)
    repo = support.checked_directory(root / "workspace")
    eligibility = support.contained_path(batch, "preflight/" + receipt["run_key"] + "/delta-eligibility.json")
    assessment = support.read_json(eligibility)
    validate_eligibility(assessment)
    if assessment["decision"] != "ELIGIBLE":
        raise ValueError("initial review is not ELIGIBLE for repair")
    record = assessment["record"]
    if not isinstance(record, dict) or not isinstance(record.get("path"), str):
        raise ValueError("invalid initial Record binding")
    actual = initial_evidence_binding(batch, receipt, terminal_relative, record["path"])
    if any(assessment[k] != actual[k] for k in ELIGIBILITY_BINDINGS):
        raise ValueError("structured eligibility binding mismatch")
    phase = batch / actual["initial_phase"]["path"]
    relative = Path(terminal_relative)
    prior_raw = (phase / "workspace" / relative).read_bytes()
    initial = json.loads((repo / ".review/input.json").read_bytes())
    previous = initial["candidate"]
    if git(repo, "rev-parse", "HEAD").decode().strip() != previous or git(repo, "status", "--porcelain"):
        raise ValueError("candidate must still be exact clean initial commit")
    frozen = json.loads((batch / "repair.recipe.json").read_bytes())
    for item in frozen["operations"]:
        path = support.contained_path(repo, item["path"])
        if sha(path.read_bytes()) != item["before_sha256"]:
            raise ValueError("repair preimage mismatch")
        if sha(item["after"].encode()) != item["after_sha256"]:
            raise ValueError("repair postimage mismatch")
    dest = support.contained_path(batch, "mutations/" + receipt["run_key"], must_exist=False)
    delta_input = support.contained_path(repo, ".review/delta-input.json", must_exist=False)
    if dest.exists() or delta_input.exists():
        raise FileExistsError("refusing to overwrite repair outputs")
    dest.mkdir(parents=True, exist_ok=False)
    for item in frozen["operations"]:
        (repo / item["path"]).write_text(item["after"], encoding="utf-8")
    current = commit(repo, frozen["commit_message"])
    git(repo, "tag", "review-delta", current)
    values = {"previous_candidate": previous, "current_candidate": current,
              "current_tree": git(repo, "rev-parse", current + "^{tree}").decode().strip(),
              "prior_terminal": "workspace/" + relative.as_posix(),
              "prior_terminal_sha256": sha(prior_raw)}
    delta = {**binding(repo, previous, current), **values, "review_root_base": initial["review_root_base"]}
    save(delta_input, delta)
    message = (batch / "request-delta.template.md").read_text().format(**values)
    support.b4.write_new(dest / "delta-request.md", message.encode())
    support.b4.write_new(dest / "delta.patch", git(repo, "diff", "--no-ext-diff", "--no-textconv", previous, current, "--"))
    save(dest / "repair-receipt.json", {**delta, "agent_id": actual["agent_id"],
        "host_eligibility_sha256": sha(eligibility.read_bytes()),
        "recipe_sha256": sha((batch / "repair.recipe.json").read_bytes()),
        "initial_phase_hashes_sha256": sha((phase / "hashes.json").read_bytes()),
        "user_message_sha256": sha(message.encode()), "operations": [
            {k: v for k, v in item.items() if k != "after"} for item in frozen["operations"]]})
    return message


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    args = parser.parse_args()
    receipts = prepare_case(args.batch)
    print(json.dumps({"status": "PREPARED_NOT_DISPATCHED", "batch": str(args.batch),
                      "runs": [{k: r[k] for k in ("run_key", "directory")} for r in receipts]}, indent=2))
