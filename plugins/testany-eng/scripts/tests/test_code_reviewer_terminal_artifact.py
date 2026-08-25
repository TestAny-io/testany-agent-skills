from __future__ import annotations

import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "skills"
    / "code-reviewer"
    / "scripts"
    / "terminal_artifact_envelope.py"
)
SPEC = importlib.util.spec_from_file_location("terminal_artifact_envelope", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
ENVELOPE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ENVELOPE
SPEC.loader.exec_module(ENVELOPE)


class TerminalArtifactEnvelopeTests(unittest.TestCase):
    def test_round_trip_binds_exact_bytes(self) -> None:
        raw = b"line one\r\n| table | bytes |\n"
        payload = ENVELOPE.encode(raw)
        self.assertEqual(ENVELOPE.decode(payload), raw)
        self.assertNotIn(" ", ENVELOPE.canonical_json(payload))

    def test_noncanonical_or_mutated_base64_fails_closed(self) -> None:
        payload = ENVELOPE.encode(b"terminal")
        payload["data"] = base64.b64encode(b"different").decode("ascii")
        with self.assertRaisesRegex(ENVELOPE.EnvelopeError, "byte_length|sha256"):
            ENVELOPE.decode(payload)

        payload = ENVELOPE.encode(b"terminal")
        payload["data"] += "\n"
        with self.assertRaisesRegex(ENVELOPE.EnvelopeError, "without whitespace"):
            ENVELOPE.decode(payload)

    def test_unknown_fields_fail_closed(self) -> None:
        payload = ENVELOPE.encode(b"terminal")
        payload["summary"] = "not authoritative"
        with self.assertRaisesRegex(ENVELOPE.EnvelopeError, "keys must be exactly"):
            ENVELOPE.decode(payload)

    def test_extract_cli_returns_verified_exact_bytes(self) -> None:
        raw = b"terminal\x00bytes\r\n"
        with tempfile.TemporaryDirectory() as tmpdir:
            envelope_path = Path(tmpdir) / "terminal.json"
            envelope_path.write_text(
                ENVELOPE.canonical_json(ENVELOPE.encode(raw)), encoding="utf-8"
            )
            result = subprocess.run(
                [sys.executable, str(SCRIPT_PATH), "extract", str(envelope_path)],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, raw)
        self.assertEqual(result.stderr, b"")

    def test_invalid_extract_emits_no_partial_output_and_preserves_output_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            envelope_path = Path(tmpdir) / "invalid.json"
            output_path = Path(tmpdir) / "decoded.bin"
            payload = ENVELOPE.encode(b"terminal")
            payload["sha256"] = "0" * 64
            envelope_path.write_text(
                json.dumps(payload, sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            output_path.write_bytes(b"keep")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "extract",
                    str(envelope_path),
                    "--output",
                    str(output_path),
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            preserved = output_path.read_bytes()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(preserved, b"keep")


if __name__ == "__main__":
    unittest.main()
