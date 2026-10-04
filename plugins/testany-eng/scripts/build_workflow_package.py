#!/usr/bin/env python3
"""Refresh/check workflow resource hashes before packaging; never edits installed caches."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def resources() -> list[str]:
    paths = [".claude-plugin/plugin.json", "scripts/context_json.py", "scripts/workflow_context.py",
             "scripts/browser_context.js", "references/workflow-runtime.md", "references/browser-context.md",
             "skills/code-writer/SKILL.md", "skills/code-reviewer/SKILL.md", "skills/delivery-secretary/SKILL.md",
             "skills/code-reviewer/references/artifact-tools.md",
             "skills/code-reviewer/references/evidence-reuse.md"]
    paths.extend(str(p.relative_to(ROOT)).replace("\\", "/")
                 for p in (ROOT / "skills/code-reviewer/scripts").glob("*.py"))
    return sorted(paths)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift without changing files")
    args = parser.parse_args()
    value = {"schema_version": 1, "files": {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                                             for p in resources()}}
    data = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    target = ROOT / "workflow-package.json"
    if args.check:
        matches = target.is_file() and target.read_bytes() == data
        print("MATCH" if matches else "DRIFT: regenerate workflow-package.json from the source package")
        return 0 if matches else 1
    target.write_bytes(data)
    print("Updated workflow-package.json from source resources")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
