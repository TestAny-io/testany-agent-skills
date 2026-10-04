#!/usr/bin/env python3
"""Read selected JSON fields with bounded output; navigation, never evidence approval."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys


def encoded(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def unique_object(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key; select an unambiguous source")
        result[key] = value
    return result


def reject_constant(value: str) -> None:
    raise ValueError("non-finite JSON value")


def child_pointer(parent: str, key: str) -> str:
    return parent + "/" + key.replace("~", "~0").replace("/", "~1")


def select(document: object, pointer: str) -> object:
    if pointer == "":
        return document
    if not pointer.startswith("/") or re.search(r"~(?![01])", pointer):
        raise ValueError("use JSON Pointer: /field/child, with ~0 for ~ and ~1 for /")
    value = document
    for part in pointer[1:].split("/"):
        key = part.replace("~1", "/").replace("~0", "~")
        if isinstance(value, dict):
            if key not in value:
                raise KeyError(pointer)
            value = value[key]
        elif isinstance(value, list) and re.fullmatch(r"0|[1-9][0-9]*", key):
            index = int(key)
            if index >= len(value):
                raise KeyError(pointer)
            value = value[index]
        else:
            raise KeyError(pointer)
    return value


def describe(value: object, pointer: str) -> dict:
    kind = "object" if isinstance(value, dict) else "array" if isinstance(value, list) else "string" if isinstance(value, str) else "scalar"
    row = {"pointer": pointer, "type": kind, "value_omitted": True}
    if isinstance(value, (dict, list, str)):
        row["count"] = len(value)
    if isinstance(value, dict):
        keys = list(value)[:8]
        row["children"] = [child_pointer(pointer, key) for key in keys]
        row["children_omitted"] = len(value) - len(keys)
    elif isinstance(value, list):
        row["children"] = [child_pointer(pointer, str(i)) for i in range(min(8, len(value)))]
        row["children_omitted"] = max(0, len(value) - 8)
    return row


def load_document(path: Path, expected_sha: str | None = None) -> tuple[object, dict]:
    with path.open("rb") as handle:
        before = os.fstat(handle.fileno())
        data = handle.read()
        after = os.fstat(handle.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("source changed during read; no stable view returned")
    sha = hashlib.sha256(data).hexdigest()
    if expected_sha is not None and (not re.fullmatch(r"[0-9a-f]{64}", expected_sha) or expected_sha != sha):
        raise ValueError("source does not match the supplied prior SHA-256")
    document = json.loads(data, object_pairs_hook=unique_object, parse_constant=reject_constant)
    return document, {"path": str(path.resolve()), "bytes": len(data), "observed_sha256": sha,
                      "prior_pin_checked": expected_sha is not None}


def read_view(path: Path, pointers: list[str], *, max_bytes: int = 6144,
              value_bytes: int = 1200, expected_sha: str | None = None,
              chunk_offset: int | None = None) -> dict:
    if not 512 <= max_bytes <= 65536 or not 1 <= value_bytes <= max_bytes:
        raise ValueError("max-bytes must be 512..65536; value-bytes must be 1..max-bytes")
    if len(pointers) > 32 or len(set(pointers)) != len(pointers):
        raise ValueError("select at most 32 distinct pointers per read")
    if chunk_offset is not None and (len(pointers) != 1 or chunk_offset < 0 or
                                     (chunk_offset > 0 and expected_sha is None)):
        raise ValueError("chunks require one pointer, nonnegative offset, and prior SHA after offset 0")
    document, source = load_document(path, expected_sha)
    result = {"purpose": "navigation_only", "status": "PARTIAL", "complete": False,
              "source": source, "selections": []}
    if chunk_offset is not None:
        value = select(document, pointers[0])
        content = value if isinstance(value, str) else encoded(value).decode("utf-8")
        if chunk_offset > len(content) or (chunk_offset == len(content) and chunk_offset != 0):
            raise ValueError("offset is outside selected value")
        row = {"pointer": pointers[0], "value_omitted": True,
               "chunk_encoding": "text" if isinstance(value, str) else "json_text",
               "start": chunk_offset, "end": chunk_offset, "total_chars": len(content),
               "field_end": False, "chunk": "", "next_args": None}
        result["selections"].append(row)

        def chunk(end: int) -> None:
            row.update(end=end, chunk=content[chunk_offset:end], field_end=end == len(content),
                       next_args=([str(path.resolve()), "--pointer", pointers[0], "--chunk-offset", str(end),
                                   "--sha256", source["observed_sha256"], "--max-bytes", str(max_bytes),
                                   "--value-bytes", str(min(value_bytes, max_bytes))]
                                  if end < len(content) else None))
        low, high = chunk_offset, len(content)
        while low < high:
            mid = (low + high + 1) // 2
            chunk(mid)
            if len(encoded(result)) + 1 <= max_bytes:
                low = mid
            else:
                high = mid - 1
        chunk(low)
        if len(encoded(result)) + 1 > max_bytes or (low == chunk_offset and content):
            raise ValueError("chunk metadata exceeds output budget")
        result["complete"] = chunk_offset == 0 and low == len(content)
        result["status"] = "SELECTED" if result["complete"] else "PARTIAL"
        return result
    candidates = []
    omitted = object()
    for pointer in pointers or [""]:
        try:
            value = select(document, pointer)
        except KeyError:
            result["selections"].append({"pointer": pointer, "missing": True, "value_omitted": True})
            candidates.append(omitted)
            continue
        row = describe(value, pointer)
        result["selections"].append(row)
        # No selector means an inventory, even for a small root document.
        candidates.append(value if pointers and len(encoded(value)) <= value_bytes else omitted)
    # Very long keys must not overflow the budget before selected values are considered.
    if len(encoded(result)) + 1 > max_bytes:
        for row in result["selections"]:
            if "children" in row:
                row["children_omitted"] = row["count"]
                row.pop("children")
    if len(encoded(result)) + 1 > max_bytes:
        raise ValueError("selection metadata exceeds output budget; select fewer/shorter pointers")
    for i, candidate in enumerate(candidates):
        if candidate is omitted:
            continue
        previous = result["selections"][i]
        row = {k: v for k, v in previous.items() if k not in ("children", "children_omitted")}
        row.update(value=candidate, value_omitted=False)
        result["selections"][i] = row
        if len(encoded(result)) + 1 > max_bytes:
            result["selections"][i] = previous
    result["complete"] = all(not row["value_omitted"] for row in result["selections"])
    result["status"] = "SELECTED" if result["complete"] else "PARTIAL"
    # complete refers only to explicitly selected values, never to a whole review.
    if len(encoded(result)) + 1 > max_bytes:
        raise ValueError("output budget exceeded")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--pointer", action="append", default=[], help="exact JSON Pointer; repeat for needed fields")
    parser.add_argument("--max-bytes", type=int, default=6144)
    parser.add_argument("--value-bytes", type=int, default=1200, help="larger values become location/count summaries")
    parser.add_argument("--sha256", help="optional previously fixed file digest; observed digest alone is not proof")
    parser.add_argument("--chunk-offset", type=int, help="lossless continuation for one oversized field")
    args = parser.parse_args()
    try:
        result = read_view(args.file, args.pointer, max_bytes=args.max_bytes,
                           value_bytes=args.value_bytes, expected_sha=args.sha256, chunk_offset=args.chunk_offset)
        sys.stdout.buffer.write(encoded(result) + b"\n")
        return 1 if any(row.get("missing") for row in result["selections"]) else 0
    except (OSError, ValueError, KeyError, RecursionError) as exc:
        sys.stderr.buffer.write(encoded({"status": "UNAVAILABLE", "purpose": "navigation_only", "error": str(exc)[:160]}) + b"\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
