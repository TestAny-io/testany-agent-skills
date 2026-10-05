#!/usr/bin/env python3
"""Check the shipped runtime; bind and read a small pointer to existing work records."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

try:
    from context_json import child_pointer, encoded, load_document, read_view, select
except (ImportError, SyntaxError):
    sys.stderr.write('{"status":"UNAVAILABLE","error":"Incomplete testany-eng package: reinstall the approved plugin."}\n')
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("question", "binding", "completed", "open", "next_action", "evidence")
LIMIT = 8192


def package_check() -> dict:
    manifest, source = load_document(ROOT / "workflow-package.json")
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError("unsupported workflow package manifest")
    required = {"scripts/context_json.py", "scripts/workflow_context.py", "scripts/browser_context.js",
                "skills/code-writer/SKILL.md", "skills/code-reviewer/SKILL.md"}
    files = manifest.get("files")
    if not isinstance(files, dict) or not required.issubset(files):
        raise ValueError("incomplete workflow package manifest")
    for relative, expected in files.items():
        path = ROOT / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts or not path.resolve().is_relative_to(ROOT):
            raise ValueError("invalid package resource path")
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("missing or changed package resource: " + relative[:160])
    plugin, _ = load_document(ROOT / ".claude-plugin/plugin.json")
    return {"status": "PACKAGE_OK", "plugin_version": plugin["version"],
            "package_sha256": source["observed_sha256"], "root": str(ROOT),
            "scope": "packaged_resources_only; not host activation or engineering approval"}


def short_id(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 128:
        raise ValueError("task IDs must be nonempty strings of at most 128 characters")
    return value


def load_entry(path: Path, expected_sha: str | None = None) -> tuple[dict, dict]:
    entry, source = load_document(path, expected_sha)
    if source["bytes"] > 16384 or not isinstance(entry, dict) or entry.get("schema_version") != 1:
        raise ValueError("invalid workflow entry; expected a small schema_version 1 locator")
    if set(entry) != {"schema_version", "roles"} or not isinstance(entry["roles"], dict):
        raise ValueError("workflow entry is a locator, not a progress ledger")
    for role, target in entry["roles"].items():
        if role not in ("writer", "reviewer") or not isinstance(target, dict) or set(target) != {"task_id", "state", "pointer"}:
            raise ValueError("invalid role locator")
        short_id(target["task_id"])
        if not isinstance(target["state"], str) or not target["state"] or not isinstance(target["pointer"], str):
            raise ValueError("state and pointer must be explicit paths")
    return entry, source


def task_record(state: Path, pointer: str, task: str, expected_sha: str | None = None) -> tuple[dict, dict]:
    document, source = load_document(state, expected_sha)
    record = select(document, pointer)
    if not isinstance(record, dict) or record.get("task_id") != short_id(task):
        raise ValueError("TARGET_MISMATCH: selected record does not identify the requested task")
    return record, source


def resume_args(entry: Path, role: str, task: str, entry_sha: str) -> list[str]:
    return ["resume", "--entry", str(entry.resolve()), "--role", role, "--task", task,
            "--expected-entry-sha256", entry_sha]


def bind(args) -> dict:
    entry_path = args.entry.resolve()
    state = args.state.resolve()
    if entry_path == state:
        raise ValueError("entry must not replace an engineering record")
    record, source = task_record(state, args.pointer, args.task)
    if any(field not in record for field in FIELDS):
        raise ValueError("resume record is missing core fields; recover known facts before binding")
    entry_path.parent.mkdir(parents=True, exist_ok=True)
    lock = entry_path.with_name(entry_path.name + ".lock")
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise ValueError("entry is being updated; retry after its writer finishes (inspect stale lock before removal)")
    temporary = None
    try:
        os.close(descriptor)
        if entry_path.exists():
            entry, previous = load_entry(entry_path)
            if args.expected_entry_sha256 != previous["observed_sha256"]:
                raise ValueError("ENTRY_CHANGED: supply the last observed entry SHA before changing its binding")
        else:
            if args.expected_entry_sha256:
                raise ValueError("ENTRY_CHANGED: previously observed entry is missing")
            entry = {"schema_version": 1, "roles": {}}
        try:
            state_location = os.path.relpath(state, entry_path.parent)
        except ValueError:  # Different drives on Windows.
            state_location = str(state)
        entry["roles"][args.role] = {"task_id": args.task, "state": state_location, "pointer": args.pointer}
        data = encoded(entry) + b"\n"
        if len(data) > 16384:
            raise ValueError("entry exceeds locator budget")
        load_document(state, source["observed_sha256"])
        with tempfile.NamedTemporaryFile(dir=entry_path.parent, prefix=".workflow-", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, entry_path)
        entry_sha = hashlib.sha256(data).hexdigest()
        return {"status": "BOUND", "purpose": "navigation_only", "entry": str(entry_path),
                "role": args.role, "task_id": args.task,
                "entry_sha256": entry_sha,
                "resume_args": resume_args(entry_path, args.role, args.task, entry_sha),
                "engineering_record_modified": False}
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
        lock.unlink()


def resume(args, package: dict) -> dict:
    if args.chunk_offset is not None and args.chunk_offset > 0 and not args.expected_entry_sha256:
        raise ValueError("continuation requires the prior entry SHA; use the returned next_args")
    entry, source = load_entry(args.entry, args.expected_entry_sha256)
    target = entry["roles"].get(args.role)
    if not target or target["task_id"] != short_id(args.task):
        raise ValueError("TARGET_MISMATCH: bind the task requested by the current work; do not use another task's state")
    state = (args.entry.resolve().parent / target["state"]).resolve()
    record, state_source = task_record(state, target["pointer"], args.task, args.state_sha256)
    fields = args.field or list(FIELDS)
    if len(fields) > 16 or len(set(fields)) != len(fields) or any(not f or len(f) > 128 for f in fields):
        raise ValueError("select at most 16 distinct field names")
    pointers = [child_pointer(target["pointer"], field) for field in fields]
    if args.chunk_offset is not None and (len(fields) != 1 or
                                         (args.chunk_offset > 0 and not args.state_sha256)):
        raise ValueError("chunks require one field and the prior state SHA; use the returned next_args")
    extras = [key for key in record if key not in (*FIELDS, "task_id")]
    metadata = dict(task_id=args.task, role=args.role, entry_sha256=source["observed_sha256"],
                    additional_fields=[key[:128] for key in extras[:8]],
                    additional_fields_omitted=max(0, len(extras) - 8), package=package)

    def continuation(pointer: str, offset: int) -> list[str]:
        return [*resume_args(args.entry, args.role, args.task, source["observed_sha256"]),
                "--state-sha256", state_source["observed_sha256"],
                "--field", fields[pointers.index(pointer)], "--chunk-offset", str(offset)]

    result = read_view(state, pointers, max_bytes=LIMIT, expected_sha=state_source["observed_sha256"],
                       chunk_offset=args.chunk_offset, metadata=metadata, continuation=continuation)
    # Ensure the binding was not replaced while its state was being read.
    load_document(args.entry, source["observed_sha256"])
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="check resources at this actual installed plugin root")
    locate = commands.add_parser("locate", help="list only role/task locators, never engineering history")
    locate.add_argument("--entry", type=Path, required=True)
    for name in ("bind", "resume"):
        p = commands.add_parser(name)
        p.add_argument("--entry", type=Path, required=True)
        p.add_argument("--role", choices=("writer", "reviewer"), required=True)
        p.add_argument("--task", required=True, help="task identified from the current request, not guessed from old state")
        p.add_argument("--expected-entry-sha256")
        if name == "bind":
            p.add_argument("--state", type=Path, required=True)
            p.add_argument("--pointer", required=True)
        else:
            p.add_argument("--field", action="append", help="repeat for multiple fields; no last-argument-wins")
            p.add_argument("--state-sha256", help="pin a continuation to the previously observed state")
            p.add_argument("--chunk-offset", type=int, help="lossless continuation; copy the returned next_args")
    args = parser.parse_args()
    try:
        package = package_check()
        if args.command == "check":
            result = package
        elif args.command == "bind":
            result = bind(args)
        elif args.command == "locate":
            entry, source = load_entry(args.entry)
            result = {"status": "LOCATORS", "purpose": "navigation_only", "entry": source,
                      "roles": entry["roles"],
                      "resume_args": {role: resume_args(args.entry, role, target["task_id"], source["observed_sha256"])
                                      for role, target in entry["roles"].items()}}
        else:
            result = resume(args, package)
        if args.command != "check":
            result["package"] = package
        if len(encoded(result)) + 1 > LIMIT:
            raise ValueError("selection metadata exceeds output budget; shorten locator paths/field names")
        sys.stdout.buffer.write(encoded(result) + b"\n")
        return 1 if any(row.get("missing") for row in result.get("selections", [])) else 0
    except (OSError, ValueError, KeyError, TypeError, RecursionError) as exc:
        sys.stderr.buffer.write(encoded({"status": "UNAVAILABLE", "purpose": "navigation_only",
                                        "error": str(exc)[:240]}) + b"\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
