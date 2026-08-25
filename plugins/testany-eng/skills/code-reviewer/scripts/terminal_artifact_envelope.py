#!/usr/bin/env python3
"""Create, verify, or extract a canonical Code Review terminal envelope."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import sys
from pathlib import Path
from typing import Sequence


SCHEMA = "testany.code-reviewer.embedded-terminal.v1"
KEYS = {"schema", "encoding", "byte_length", "sha256", "data"}


class EnvelopeError(ValueError):
    pass


def encode(raw: bytes) -> dict[str, object]:
    return {
        "schema": SCHEMA,
        "encoding": "base64-rfc4648-padded",
        "byte_length": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "data": base64.b64encode(raw).decode("ascii"),
    }


def decode(payload: object) -> bytes:
    if not isinstance(payload, dict) or set(payload) != KEYS:
        raise EnvelopeError(f"envelope keys must be exactly {sorted(KEYS)}")
    if payload["schema"] != SCHEMA:
        raise EnvelopeError(f"schema must equal {SCHEMA}")
    if payload["encoding"] != "base64-rfc4648-padded":
        raise EnvelopeError("encoding must equal base64-rfc4648-padded")
    if not isinstance(payload["byte_length"], int) or isinstance(
        payload["byte_length"], bool
    ) or payload["byte_length"] < 0:
        raise EnvelopeError("byte_length must be a nonnegative integer")
    if not isinstance(payload["sha256"], str) or len(payload["sha256"]) != 64:
        raise EnvelopeError("sha256 must be a lowercase 64-character digest")
    try:
        int(payload["sha256"], 16)
    except ValueError as exc:
        raise EnvelopeError("sha256 must be hexadecimal") from exc
    if payload["sha256"] != payload["sha256"].lower():
        raise EnvelopeError("sha256 must be lowercase")
    if not isinstance(payload["data"], str) or any(
        char.isspace() for char in payload["data"]
    ):
        raise EnvelopeError("data must be one canonical base64 string without whitespace")
    try:
        raw = base64.b64decode(payload["data"], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise EnvelopeError("data is not strict RFC 4648 base64") from exc
    if base64.b64encode(raw).decode("ascii") != payload["data"]:
        raise EnvelopeError("data is not canonical padded RFC 4648 base64")
    if len(raw) != payload["byte_length"]:
        raise EnvelopeError("byte_length does not match decoded bytes")
    if hashlib.sha256(raw).hexdigest() != payload["sha256"]:
        raise EnvelopeError("sha256 does not match decoded bytes")
    return raw


def canonical_json(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def read_canonical_envelope(path: Path) -> tuple[dict[str, object], bytes]:
    serialized = path.read_text(encoding="utf-8")
    payload = json.loads(serialized)
    raw = decode(payload)
    if serialized.strip() != canonical_json(payload):
        raise EnvelopeError("envelope JSON itself is not canonical single-line JSON")
    return payload, raw


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    encode_parser = subparsers.add_parser("encode")
    encode_parser.add_argument("artifact", type=Path)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("envelope", type=Path)
    extract_parser = subparsers.add_parser("extract")
    extract_parser.add_argument("envelope", type=Path)
    extract_parser.add_argument(
        "--output",
        type=Path,
        help="Write verified raw bytes to this file instead of stdout",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.command == "encode":
            print(canonical_json(encode(args.artifact.read_bytes())))
        elif args.command == "verify":
            payload, raw = read_canonical_envelope(args.envelope)
            print(f"PASS {len(raw)} bytes sha256:{payload['sha256']}")
        else:
            _payload, raw = read_canonical_envelope(args.envelope)
            # Validation is complete before the first output byte. This keeps
            # invalid envelopes from producing a parseable prefix.
            if args.output is None:
                sys.stdout.buffer.write(raw)
                sys.stdout.buffer.flush()
            else:
                args.output.write_bytes(raw)
    except (OSError, UnicodeError, json.JSONDecodeError, EnvelopeError) as exc:
        print(f"terminal artifact envelope failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
