"""C10G offline compatibility shim; never executes a trigger command."""
import copy
from pathlib import Path

import legacy_adapter as legacy

legacy_dispatch = legacy.dispatch


def dispatch(operation, arguments, state):
    if operation != "testany_dry_run_case":
        return legacy_dispatch(operation, arguments, state)
    trigger = state.get("case", {}).get("case_meta", {}).get("trigger_method", {})
    if not isinstance(trigger, dict):
        raise ValueError("trigger_method must be an object")
    if "trigger_command" not in trigger:
        return legacy_dispatch(operation, arguments, state)
    if trigger["trigger_command"] not in (["python", "main.py"], "python main.py"):
        raise ValueError("unsupported command for this isolated main.py fixture")
    if "trigger_path" in trigger and trigger["trigger_path"] != "main.py":
        raise ValueError("trigger_path conflicts with trigger_command")
    # Normalize only a private simulation copy; do not change stored case metadata.
    simulated = copy.deepcopy(state)
    simulated["case"]["case_meta"]["trigger_method"]["trigger_path"] = "main.py"
    result = legacy_dispatch(operation, arguments, simulated)
    for name in ("dry_runs", "dry_run_id"):
        state[name] = simulated[name]
    return result


if __name__ == "__main__":
    legacy.HERE = Path(__file__).resolve().parent
    legacy.dispatch = dispatch
    legacy.main()
