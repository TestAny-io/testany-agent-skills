"""Small, immutable JSON artifacts and bounded tool summaries (stdlib only)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile

SUMMARY_BYTES = 4096


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()


def save_json(value: object, output: Path | None, *, forbidden_roots=(), prefix="review-") -> tuple[Path, str]:
    roots = [Path(root).resolve() for root in forbidden_roots]

    def check(path: Path) -> None:
        if any(path.is_relative_to(root) for root in roots):
            raise ValueError("artifact must be saved outside the candidate checkout and Git control directories")

    if output is None:
        directory = Path(tempfile.gettempdir()).resolve()
        check(directory)
        output = Path(tempfile.mkdtemp(prefix=prefix, dir=directory)) / "result.json"
    if output.is_symlink():
        raise ValueError("artifact output must not be a symlink")
    output = output.resolve()
    check(output)
    data = canonical(value) + b"\n"
    # Never overwrite an artifact that may already be referenced by a review.
    with output.open("xb") as handle:
        handle.write(data)
    return output, hashlib.sha256(data).hexdigest()


def print_summary(summary: dict, *, paths=(), path_key="changed_paths") -> None:
    """Emit exact path samples; the complete list stays in the referenced artifact."""
    paths = list(paths)
    summary = {**summary, path_key: [], path_key + "_count": len(paths), path_key + "_omitted": len(paths)}
    for path in paths[:20]:
        candidate = {**summary, path_key: summary[path_key] + [path],
                     path_key + "_omitted": len(paths) - len(summary[path_key]) - 1}
        if len(canonical(candidate)) + 1 > SUMMARY_BYTES:
            break
        summary = candidate
    if len(canonical(summary)) + 1 > SUMMARY_BYTES:
        # Unusually long repository/output paths must not defeat the bound.
        summary = {key: value for key, value in summary.items()
                   if key in ("result", "snapshot_sha256", "receipt_sha256", "artifact_sha256", "approval_granted")}
        summary["detail"] = "Summary metadata exceeds limit; read the saved output artifact."
    sys.stdout.buffer.write(canonical(summary) + b"\n")


def print_error(exc: Exception) -> None:
    # Bound even adversarial filenames / Git stderr; no full manifests in errors.
    message = str(exc)[:256]
    print(json.dumps({"result": "UNVERIFIED", "approval_granted": False, "error": message}, ensure_ascii=True), file=sys.stderr)
