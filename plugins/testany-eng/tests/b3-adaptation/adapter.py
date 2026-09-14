#!/usr/bin/env python3
"""Offline CLI test double, not a Testany API client or a security sandbox."""

import ast
import copy
import datetime
import fcntl
import hashlib
import json
import re
import sys
import uuid
import zipfile
from pathlib import Path, PurePosixPath


RUNTIME = "00000000-0000-4000-8000-000000000001"
MUTATIONS = {
    "testany_create_case": {"chain", "upload_failure"},
    "testany_update_case": {"chain", "upload_failure"},
    "testany_update_case_script": {"chain", "upload_failure"},
    "testany_create_pipeline": {"chain"},
    "testany_update_pipeline": {"mismatch"},
    "testany_execute_pipeline": {"chain"},
    "testany_request_workspace": {"workspace"},
}


def initial_state(profile):
    state = {"simulation": True, "profile": profile, "calls": {}, "sequence": 0,
             "cases": {}, "pipelines": {}, "executions": {}, "requests": {}}
    if profile == "query":
        state["executions"]["EX-LAB-001"] = {
            "execution_key": "EX-LAB-001", "pipeline_key": "PIPE-LAB-001",
            "workspace_key": "LAB", "status": 0, "status_name": "RUNNING",
        }
    if profile == "mismatch":
        state["pipelines"]["PIPE-LAB-001"] = {
            "pipeline_key": "PIPE-LAB-001", "workspace_key": "LAB",
            "name": "Invoice smoke", "case_keys": ["A1B2C3D4"],
            "description": "Existing billing pipeline", "environments": ["lab"],
        }
    return state


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(args, required=(), optional=()):
    require(isinstance(args, dict), "arguments must be a JSON object")
    require(set(required) <= args.keys(), "missing fields: " + ", ".join(sorted(set(required) - args.keys())))
    require(args.keys() <= set(required) | set(optional), "unsupported fields: " + ", ".join(sorted(args.keys() - set(required) - set(optional))))


def lab(args):
    require(args.get("workspace_key", "LAB") == "LAB", "workspace is not available")


def lookup(state, collection, key):
    require(key in state[collection], "unknown " + collection + " key")
    return state[collection][key]


def validate_meta(meta):
    require(isinstance(meta, dict), "case_meta must be an object")
    trigger = meta.get("trigger_method", {})
    require(isinstance(trigger, dict) and trigger.get("executor") == "pyres", "this fixture supports pyres")
    command = trigger.get("trigger_command")
    require(isinstance(command, list) and command and all(isinstance(x, str) for x in command), "trigger_command must be a nonempty string array")
    require(command[0] in {"python", "python3"}, "this fixture supports Python entry commands")
    require(meta.get("environment_variables") == [], "this fixture has no environment inputs, relay or secrets")


def inspect_package(path, meta):
    """Static inspection only: never import or execute the supplied Python."""
    validate_meta(meta)
    with zipfile.ZipFile(path) as bundle:
        names = bundle.namelist()
        require(len(names) == len(set(names)), "duplicate ZIP members")
        for info in bundle.infolist():
            parts = PurePosixPath(info.filename)
            require(not parts.is_absolute() and ".." not in parts.parts and "\\" not in info.filename,
                    "unsafe ZIP member")
            require((info.external_attr >> 16) & 0o170000 != 0o120000, "ZIP symlinks unsupported")
            require(info.file_size <= 1024 * 1024, "fixture member exceeds 1 MiB")
        require(sum(i.file_size for i in bundle.infolist()) <= 4 * 1024 * 1024, "fixture ZIP exceeds 4 MiB")
        require(bundle.testzip() is None, "ZIP CRC error")
        command = meta["trigger_method"]["trigger_command"]
        entries = [x.removeprefix("./") for x in command[1:] if x.endswith(".py") or x.endswith("/")]
        require(entries, "no supported Python entry in trigger_command")
        for entry in entries:
            require(entry in names or (entry.endswith("/") and any(n.startswith(entry) and n.endswith(".py") for n in names)),
                    "missing entry: " + entry)
        python_files = [n for n in names if n.endswith(".py")]
        require(python_files, "no Python source")
        for name in python_files:
            ast.parse(bundle.read(name), filename=name)
    return {"members": names, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def pipeline_cases(args, state):
    if "case_keys" in args:
        keys = args["case_keys"]
    else:
        value = args.get("yaml", "")
        require(isinstance(value, str), "yaml must be text")
        # This deliberately supports only the documented one-rule fixture grammar.
        match = re.fullmatch(r"\s*kind:\s*rule/v1\.3\s+spec:\s+rules:\s+-\s+run:\s*['\"]?([A-F0-9]{8})['\"]?\s*", value)
        require(match is not None, "only simple one-case YAML is supported; use case_keys")
        keys = [match.group(1)]
    require(isinstance(keys, list) and len(keys) == 1 and isinstance(keys[0], str), "exactly one case_key required")
    item = lookup(state, "cases", keys[0])
    require(item.get("script_uploaded"), "case script has not been uploaded")
    validate_meta(item.get("case_meta"))
    return keys


def dispatch(state, op, args, home):
    require(isinstance(args, dict), "arguments must be a JSON object")
    if op in MUTATIONS:
        require(state["profile"] in MUTATIONS[op], "operation unavailable in this fixture")
        require(state["calls"][op] <= 1, "one attempt available; no automatic retries")
    if op == "testany_filter_case_runtimes":
        fields(args, optional=("executor",))
        return {"runtimes": [{"runtime_uuid": RUNTIME, "name": "cloudprime", "executor": "pyres", "environment": "lab"}]}
    if op in {"testany_get_my_workspaces", "testany_get_my_workspaces_with_roles"}:
        fields(args)
        return {"workspaces": [{"workspace_key": "LAB", "name": "Internal Lab", "role": "Admin", "status": "available"}]}
    if op == "testany_get_tenant_config":
        fields(args)
        return {"deployment_type": 2, "simulation": True}
    if op == "testany_list_labels":
        fields(args, optional=("workspace_key",))
        lab(args)
        return {"labels": ["billing", "smoke"]}
    if op in {"testany_list_cases", "testany_list_my_cases", "testany_list_pipelines", "testany_list_my_pipelines"}:
        fields(args, optional=("workspace_key",))
        lab(args)
        kind = "cases" if "cases" in op else "pipelines"
        return {kind: list(state[kind].values())}
    if op in {"testany_get_case", "testany_get_case_script", "testany_get_pipeline", "testany_get_pipeline_yaml"}:
        kind = "case" if "case" in op else "pipeline"
        fields(args, (kind + "_key",), ("workspace_key",))
        lab(args)
        item = lookup(state, kind + "s", args[kind + "_key"])
        if op.endswith("_script"):
            return {"case_key": item["case_key"], "script_uploaded": item["script_uploaded"], "script": item.get("script")}
        if op.endswith("_yaml"):
            return {"pipeline_key": item["pipeline_key"], "yaml": item.get("yaml")}
        return copy.deepcopy(item)
    if op in {"testany_get_execution", "testany_refresh_execution"}:
        fields(args, ("execution_key",), ("workspace_key",))
        lab(args)
        item = lookup(state, "executions", args["execution_key"])
        if state["profile"] == "chain":
            item.update({"status": 1, "status_name": "SUCCESS"})
        return copy.deepcopy(item)
    if op == "testany_create_case":
        fields(args, ("name", "runtime_uuid", "is_private", "workspace_keys"), ("description", "case_labels", "environments", "case_meta"))
        require(isinstance(args["name"], str) and args["name"].strip(), "name required")
        require(args["is_private"] is True and args["workspace_keys"] == ["LAB"], "only private LAB case supported")
        require(args["runtime_uuid"] == RUNTIME, "unknown runtime_uuid")
        if "case_meta" in args:
            validate_meta(args["case_meta"])
        key = uuid.uuid4().hex[:8].upper()
        state["cases"][key] = {**args, "case_key": key, "script_uploaded": False}
        return copy.deepcopy(state["cases"][key])
    if op == "testany_update_case":
        fields(args, ("case_key",), ("description", "case_labels", "environments", "owned_by", "case_version", "case_meta"))
        item = lookup(state, "cases", args["case_key"])
        if "case_meta" in args:
            validate_meta(args["case_meta"])
        item.update({k: v for k, v in args.items() if k != "case_key"})
        return copy.deepcopy(item)
    if op == "testany_update_case_script":
        fields(args, ("case_key", "zip_path"))
        item = lookup(state, "cases", args["case_key"])
        path = Path(args["zip_path"])
        path = (path if path.is_absolute() else home.parent / path).resolve()
        require(path.is_relative_to((home.parent / "workspace").resolve()), "zip_path must be in workspace")
        evidence = inspect_package(path, item.get("case_meta"))
        if state["profile"] == "upload_failure":
            return {"ok": False, "error": "SIMULATED_UPLOAD_FAILURE", "case_key": item["case_key"], "script_uploaded": False}
        item.update({"script_uploaded": True, "script": {"zip_path": str(path), **evidence}})
        return {"case_key": item["case_key"], "script_uploaded": True, **evidence}
    if op in {"testany_create_pipeline", "testany_verify_pipeline"}:
        if op == "testany_verify_pipeline" and "pipeline_key" in args:
            fields(args, ("pipeline_key",), ("workspace_key",))
            lab(args)
            item = lookup(state, "pipelines", args["pipeline_key"])
            pipeline_cases(item, state)
            return {"valid": True, "executed": False, "pipeline_key": item["pipeline_key"]}
        required = ("name", "workspace_key") if op == "testany_create_pipeline" else ()
        fields(args, required, ("case_keys", "yaml", "description") + (() if required else ("workspace_key",)))
        lab(args)
        require(("case_keys" in args) != ("yaml" in args), "supply exactly one of case_keys or yaml")
        keys = pipeline_cases(args, state)
        if op == "testany_verify_pipeline":
            return {"valid": True, "executed": False, "case_keys": keys}
        require(isinstance(args["name"], str) and args["name"].strip(), "name required")
        key = "PIPE-LAB-" + uuid.uuid4().hex[:8].upper()
        state["pipelines"][key] = {**args, "pipeline_key": key, "case_keys": keys,
                                    "yaml": "kind: rule/v1.3\nspec:\n  rules:\n    - run: '" + keys[0] + "'\n"}
        return copy.deepcopy(state["pipelines"][key])
    if op == "testany_update_pipeline":
        fields(args, ("pipeline_key", "name"), ("workspace_key",))
        lab(args)
        item = lookup(state, "pipelines", args["pipeline_key"])
        require(args["name"] == "Billing smoke", "only requested name supported")
        return {"accepted": True, "pipeline_key": item["pipeline_key"], "requested_name": args["name"]}
    if op == "testany_execute_pipeline":
        fields(args, ("pipeline_key", "workspace_key"))
        lab(args)
        pipeline = lookup(state, "pipelines", args["pipeline_key"])
        pipeline_cases(pipeline, state)
        key = "EX-LAB-" + uuid.uuid4().hex[:8].upper()
        state["executions"][key] = {**args, "execution_key": key, "status": 0, "status_name": "RUNNING"}
        return copy.deepcopy(state["executions"][key])
    if op == "testany_check_workspace_key":
        fields(args, ("workspace_key",))
        return {"workspace_key": args["workspace_key"], "available": args["workspace_key"] == "QA2" and not state["requests"]}
    if op == "testany_request_workspace":
        fields(args, ("workspace_key", "description"), ("name",))
        require(args["workspace_key"] == "QA2", "only QA2 supported")
        require(isinstance(args["description"], str) and args["description"].strip(), "description required")
        key = "REQ-" + uuid.uuid4().hex[:8].upper()
        state["requests"][key] = {**args, "request_id": key, "status": "pending", "workspace_available": False}
        return {"accepted": True, **state["requests"][key]}
    if op == "testany_get_workspace_request":
        fields(args, ("request_id",))
        return copy.deepcopy(lookup(state, "requests", args["request_id"]))
    raise ValueError("unsupported offline operation: " + op)


def invoke(home, argv):
    """Serialize state changes and log every invocation, including malformed requests."""
    home = Path(home)
    op, args, state = argv[0] if argv else "", None, None
    with (home / ".adapter.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            state = json.loads((home / "state.json").read_text(encoding="utf-8"))
            state["sequence"] += 1
            state["calls"][op] = state["calls"].get(op, 0) + 1
            require(len(argv) in {1, 2}, "usage: python3 harness/testany.py OPERATION '[JSON object]'")
            args = json.loads(argv[1]) if len(argv) == 2 else {}
            candidate = copy.deepcopy(state)
            result = dispatch(candidate, op, args, home)
            state = candidate
            result = {"ok": True, "simulation": True, **result}
        except Exception as exc:
            result = {"ok": False, "simulation": True, "error": type(exc).__name__, "message": str(exc)}
        if state is not None:
            pending = home / "state.json.tmp"
            pending.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            pending.replace(home / "state.json")
        record = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "sequence": state.get("sequence") if state else None,
                  "operation": op, "arguments": args, "argv": argv, "result": result}
        with (home / "calls.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps(record, ensure_ascii=False) + "\n")
    return result


if __name__ == "__main__":
    response = invoke(Path(__file__).resolve().parent, sys.argv[1:])
    print(json.dumps(response, ensure_ascii=False))
    raise SystemExit(0 if response["ok"] else 1)
