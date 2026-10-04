#!/usr/bin/env python3
"""Compatibility entry for the reader shipped in this same testany-eng plugin."""
from pathlib import Path
import sys

_shared = Path(__file__).resolve().parents[3] / "scripts"
if not (_shared / "context_json.py").is_file():
    sys.stderr.write('{"status":"UNAVAILABLE","error":"Incomplete testany-eng package: reinstall the approved plugin; do not use an old cache path."}\n')
    raise SystemExit(2)
sys.path.insert(0, str(_shared))
try:
    from context_json import (child_pointer, describe, encoded, load_document, main,
                              read_view, reject_constant, select, unique_object)
except (ImportError, SyntaxError):
    sys.stderr.write('{"status":"UNAVAILABLE","error":"Invalid testany-eng reader resource: reinstall the approved plugin."}\n')
    raise SystemExit(2)

if __name__ == "__main__":
    raise SystemExit(main())
