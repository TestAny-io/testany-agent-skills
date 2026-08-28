from __future__ import annotations

import json
import sys
from pathlib import Path

from finish import finish


class Runtime:
    def __init__(self, state: Path, release_state: str):
        state.mkdir(parents=True, exist_ok=True)
        self.lock = state / "operation.lock"
        self.events = []
        if release_state == "released":
            self.lock.touch()
        elif release_state == "blocked":
            self.lock.mkdir()
        else:
            raise ValueError("unsupported release state")

    def release(self):
        self.events.append("release")
        self.lock.unlink()

    def publish_pass(self):
        self.events.append("PASS")


def main() -> int:
    runtime = Runtime(Path(sys.argv[3]), sys.argv[2])
    try:
        finish(sys.argv[1], runtime)
        code = 0
    except OSError:
        code = 3
    except ValueError:
        code = 2
    print(json.dumps({"events": runtime.events, "lock_held": runtime.lock.exists()}))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
