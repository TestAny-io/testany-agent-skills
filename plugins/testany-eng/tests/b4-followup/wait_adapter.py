"""Offline observation-only fixture. Uses real local timestamps, never a network."""
import datetime
import json
from pathlib import Path
import sys
import time


def invoke(home, argv):
    home = Path(home)
    state = json.loads((home / "state.json").read_bytes())
    operation = argv[0] if argv else ""
    args = None
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    observed = time.monotonic()
    try:
        if len(argv) != 2:
            raise ValueError("usage: python3 harness/testany.py OPERATION 'JSON'")
        args = json.loads(argv[1])
        if operation not in {"testany_get_execution", "testany_refresh_execution"}:
            raise ValueError("only execution observation is available")
        if not isinstance(args, dict) or args.get("execution_key") != "EX-LAB-WAIT":
            raise ValueError("unknown execution")
        if set(args) - {"execution_key", "workspace_key"} or args.get("workspace_key", "LAB") != "LAB":
            raise ValueError("unsupported arguments")
        state["calls"] += 1
        if operation == "testany_refresh_execution" and state["profile"] == "refresh_success":
            state["status"] = 1
        result = {"ok": True, "simulation": True, "data": {
            "execution_key": "EX-LAB-WAIT", "workspace_key": "LAB",
            "status": state["status"], "status_name": "SUCCESS" if state["status"] == 1 else "RUNNING"}}
    except (ValueError, TypeError) as exc:
        result = {"ok": False, "simulation": True, "error": str(exc)}
    (home / "state.json").write_text(json.dumps(state) + "\n")
    with (home / "calls.jsonl").open("a") as stream:
        stream.write(json.dumps(dict(timestamp=timestamp, monotonic=observed,
            operation=operation, arguments=args, result=result)) + "\n")
    return result


if __name__ == "__main__":
    result = invoke(Path(__file__).resolve().parent, sys.argv[1:])
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 2)
