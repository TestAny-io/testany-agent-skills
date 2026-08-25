#!/usr/bin/env python3
"""Validate, canonicalize, and hash a Code Reviewer Scope Lock payload."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Callable, Sequence


SCHEMA = "testany.code-reviewer.scope-lock.v1"
COMMIT_PATTERN = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
TOP_LEVEL_KEYS = {
    "schema",
    "repositories",
    "approved_baselines",
    "in_scope",
    "out_of_scope",
    "must_not_change_or_regress",
    "architecture_budget",
    "verification_boundary",
}


class ScopeLockError(ValueError):
    pass


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ScopeLockError(f"{label} must be a non-empty string")
    return unicodedata.normalize("NFC", value.strip())


def _closed_row(
    value: object,
    label: str,
    fields: dict[str, Callable[[object, str], object]],
) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ScopeLockError(f"{label} must be an object")
    actual = set(value)
    expected = set(fields)
    if actual != expected:
        raise ScopeLockError(
            f"{label} keys must be exactly {sorted(expected)}; "
            f"missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
        )
    return {key: fields[key](value[key], f"{label}.{key}") for key in fields}


def _sorted_unique(values: list[object], label: str) -> list[object]:
    encoded = [
        json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
        for value in values
    ]
    if len(encoded) != len(set(encoded)):
        raise ScopeLockError(f"{label} contains duplicate canonical entries")
    return [value for _, value in sorted(zip(encoded, values), key=lambda item: item[0])]


def _array(
    value: object,
    label: str,
    normalizer: Callable[[object, str], object],
    *,
    allow_empty: bool,
) -> list[object]:
    if not isinstance(value, list) or (not allow_empty and not value):
        suffix = "" if allow_empty else " and non-empty"
        raise ScopeLockError(f"{label} must be an array{suffix}")
    normalized = [normalizer(item, f"{label}[{index}]") for index, item in enumerate(value)]
    return _sorted_unique(normalized, label)


def _commit(value: object, label: str) -> str:
    result = _text(value, label)
    if COMMIT_PATTERN.fullmatch(result) is None:
        raise ScopeLockError(f"{label} must be a full lowercase Git commit SHA")
    return result


def _action(value: object, label: str) -> str:
    result = _text(value, label)
    allowed = {"KEEP", "MODIFY", "ADD", "DELETE", "NONE"}
    if result not in allowed:
        raise ScopeLockError(f"{label} must be one of {sorted(allowed)}")
    return result


def _layer(value: object, label: str) -> str:
    result = _text(value, label)
    allowed = {"source", "ci", "environment"}
    if result not in allowed:
        raise ScopeLockError(f"{label} must be one of {sorted(allowed)}")
    return result


def _boolean(value: object, label: str) -> bool:
    if not isinstance(value, bool):
        raise ScopeLockError(f"{label} must be a boolean")
    return value


def _text_array(value: object, label: str) -> list[object]:
    return _array(value, label, _text, allow_empty=True)


def canonicalize(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise ScopeLockError("Scope Lock payload must be an object")
    actual = set(payload)
    if actual != TOP_LEVEL_KEYS:
        raise ScopeLockError(
            f"Scope Lock keys must be exactly {sorted(TOP_LEVEL_KEYS)}; "
            f"missing={sorted(TOP_LEVEL_KEYS - actual)}, "
            f"extra={sorted(actual - TOP_LEVEL_KEYS)}"
        )
    if payload["schema"] != SCHEMA:
        raise ScopeLockError(f"schema must equal {SCHEMA}")

    repository = lambda value, label: _closed_row(
        value,
        label,
        {"repository_identity": _text, "review_root_base": _commit},
    )
    baseline = lambda value, label: _closed_row(
        value,
        label,
        {
            "baseline_type": _text,
            "exact_reference": _text,
            "approval_evidence": _text,
            "governs": _text,
        },
    )
    budget = lambda value, label: _closed_row(
        value,
        label,
        {
            "surface": _text,
            "allowed_action": _action,
            "approved_source": _text,
            "exact_boundary": _text,
        },
    )
    verification = lambda value, label: _closed_row(
        value,
        label,
        {
            "layer": _layer,
            "required_in_code_review": _boolean,
            "required_gates": _text_array,
            "evidence_boundary": _text,
            "effect_on_code_verdict": _text,
        },
    )
    repositories = _array(
        payload["repositories"], "repositories", repository, allow_empty=False
    )
    repository_ids = [item["repository_identity"] for item in repositories]
    if len(repository_ids) != len(set(repository_ids)):
        raise ScopeLockError("repositories must contain one review_root_base per repository_identity")
    approved_baselines = _array(
        payload["approved_baselines"],
        "approved_baselines",
        baseline,
        allow_empty=False,
    )
    baseline_keys = [
        (item["baseline_type"], item["exact_reference"])
        for item in approved_baselines
    ]
    if len(baseline_keys) != len(set(baseline_keys)):
        raise ScopeLockError(
            "approved_baselines must contain one approval/governance row per type/reference"
        )

    in_scope = _array(payload["in_scope"], "in_scope", _text, allow_empty=False)
    out_of_scope = _array(
        payload["out_of_scope"], "out_of_scope", _text, allow_empty=True
    )
    overlap = sorted(set(in_scope) & set(out_of_scope))
    if overlap:
        raise ScopeLockError("in_scope and out_of_scope overlap: " + ", ".join(overlap))

    architecture_budget = _array(
        payload["architecture_budget"],
        "architecture_budget",
        budget,
        allow_empty=True,
    )
    budget_keys = [
        (item["surface"], item["exact_boundary"]) for item in architecture_budget
    ]
    if len(budget_keys) != len(set(budget_keys)):
        raise ScopeLockError(
            "architecture_budget must contain one action/source per surface boundary"
        )

    verification_boundary = _array(
        payload["verification_boundary"],
        "verification_boundary",
        verification,
        allow_empty=False,
    )
    verification_layers = [item["layer"] for item in verification_boundary]
    if set(verification_layers) != {"source", "ci", "environment"} or len(
        verification_layers
    ) != 3:
        raise ScopeLockError(
            "verification_boundary must contain exactly one source, ci, and environment row"
        )
    verification_by_layer = {item["layer"]: item for item in verification_boundary}
    expected_verification_semantics = {
        "source": (True, "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT"),
        "ci": (False, "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"),
        "environment": (False, "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"),
    }
    for layer, (required, effect) in expected_verification_semantics.items():
        row = verification_by_layer[layer]
        if row["required_in_code_review"] is not required:
            raise ScopeLockError(
                f"verification_boundary {layer}.required_in_code_review must be {required}"
            )
        if row["effect_on_code_verdict"] != effect:
            raise ScopeLockError(
                f"verification_boundary {layer}.effect_on_code_verdict must equal {effect}"
            )

    return {
        "schema": SCHEMA,
        "repositories": repositories,
        "approved_baselines": approved_baselines,
        "in_scope": in_scope,
        "out_of_scope": out_of_scope,
        "must_not_change_or_regress": _array(
            payload["must_not_change_or_regress"],
            "must_not_change_or_regress",
            _text,
            allow_empty=True,
        ),
        "architecture_budget": architecture_budget,
        "verification_boundary": verification_boundary,
    }


def digest_payload(payload: object) -> tuple[str, dict[str, object]]:
    canonical_payload = canonicalize(payload)
    canonical_bytes = json.dumps(
        canonical_payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest(), canonical_payload


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("payload", type=Path, help="Scope Lock payload JSON file")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        payload = json.loads(args.payload.read_text(encoding="utf-8"))
        digest, canonical_payload = digest_payload(payload)
    except (OSError, json.JSONDecodeError, ScopeLockError) as exc:
        print(f"scope lock digest failed: {exc}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "scope_lock_sha256": digest,
                "canonical_payload": canonical_payload,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
