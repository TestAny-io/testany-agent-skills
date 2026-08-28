import json
import sys
from pathlib import Path

from vendor_inventory import DirectoryProvider, Resource


def main() -> int:
    from gate import verify_resources

    accepted = verify_resources(DirectoryProvider(Path(sys.argv[1])).resources())
    print(json.dumps({"accepted": accepted}))
    return 0 if accepted else 3


if __name__ == "__main__":
    raise SystemExit(main())
