from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Resource:
    logical_path: str
    content: bytes


class DirectoryProvider:
    def __init__(self, root: Path) -> None:
        self.root = root

    def resources(self):
        for path in sorted(self.root.rglob("*.sql")):
            if path.is_file():
                yield Resource(path.relative_to(self.root).as_posix(), path.read_bytes())


def main() -> int:
    from gate import verify_resources

    accepted = verify_resources(DirectoryProvider(Path(sys.argv[1])).resources())
    print(json.dumps({"accepted": accepted}))
    return 0 if accepted else 3


if __name__ == "__main__":
    raise SystemExit(main())
