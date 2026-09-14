import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys
import struct
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/validate_package.py"
SPEC = importlib.util.spec_from_file_location("package_inspector", SCRIPT)
INSPECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSPECTOR)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="package check ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / "case.zip"
        self.metadata = self.root / "metadata.json"
        self.doc = {"name": "Smoke", "description": "Offline fixture",
                    "case_meta": {"trigger_method": {"executor": "pyres", "trigger_command": ["python", "-m", "pytest", "tests/", "-v"]},
                                  "environment_variables": []}}
        self.files = {"tests/test_ok.py": b"def test_ok():\n    assert True\n"}

    def run_check(self, **limits):
        self.metadata.write_text(json.dumps(self.doc))
        with zipfile.ZipFile(self.archive, "w") as bundle:
            for name, content in self.files.items():
                bundle.writestr(name, content)
        return INSPECTOR.inspect_package(self.archive, self.metadata, **limits)

    def test_valid_pytest_directory_and_hashes(self):
        result = self.run_check()
        self.assertEqual(result["status"], "pass", result)
        self.assertEqual(len(result["archive_sha256"]), 64)
        self.assertTrue(result["not_verified"])

    def test_checks_never_execute_archive_code(self):
        marker = self.root / "executed"
        self.files["tests/test_ok.py"] = f"from pathlib import Path\nPath({str(marker)!r}).touch()\n".encode()
        self.assertEqual(self.run_check()["status"], "pass")
        self.assertFalse(marker.exists())

    def test_missing_entry_and_bad_python_are_both_reported(self):
        self.files = {"other.py": b"def broken(:\n"}
        result = self.run_check()
        self.assertEqual(result["status"], "fail")
        self.assertTrue(any("missing" in e for e in result["errors"]))
        self.assertTrue(any("syntax" in e for e in result["errors"]))

    def test_absolute_traversal_windows_and_nul_paths(self):
        for name in ("/etc/file", "../escape", "a/../../escape", "C:/file", "a\\b", "a\x00b"):
            with self.subTest(name=name):
                self.assertIsNone(INSPECTOR.safe_path(name))

    def test_zip_traversal_rejected_without_extraction(self):
        self.files["../escape.py"] = b"pass\n"
        self.assertEqual(self.run_check()["status"], "fail")
        self.assertFalse((self.root.parent / "escape.py").exists())

    def test_symlink_rejected(self):
        self.run_check()
        with zipfile.ZipFile(self.archive, "a") as bundle:
            info = zipfile.ZipInfo("linked.py")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(info, "../../outside")
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_duplicate_normalized_name_rejected(self):
        self.files["./tests/test_ok.py"] = b"pass\n"
        self.assertEqual(self.run_check()["status"], "fail")

    def test_corrupt_zip_rejected(self):
        self.run_check()
        self.archive.write_bytes(b"not zip")
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_limits_and_empty_package(self):
        self.assertEqual(self.run_check(max_files=0)["status"], "fail")
        self.assertEqual(self.run_check(max_bytes=10)["status"], "fail")
        self.files = {}
        self.assertEqual(self.run_check()["status"], "fail")

    def test_unknown_command_is_gap_not_pass_or_executed(self):
        self.doc["case_meta"]["trigger_method"]["trigger_command"] = ["sh", "-c", "echo forbidden"]
        result = self.run_check()
        self.assertEqual(result["status"], "incomplete")
        self.assertFalse(result["errors"])

    def test_ambiguous_pytest_option_is_gap(self):
        self.doc["case_meta"]["trigger_method"]["trigger_command"] += ["-k", "login"]
        self.assertEqual(self.run_check()["status"], "incomplete")

    def test_invalid_command_shape_and_missing_command(self):
        trigger = self.doc["case_meta"]["trigger_method"]
        for command in ("python tests/test_ok.py", [], ["python", 42]):
            trigger["trigger_command"] = command
            self.assertEqual(self.run_check()["status"], "fail")
        del trigger["trigger_command"]
        self.assertEqual(self.run_check()["status"], "fail")

    def test_variable_validation_and_no_secret_value_echo(self):
        self.doc["case_meta"]["environment_variables"] = [
            {"name": "TOKEN", "description": "Token", "type": "secrets", "value": "DO-NOT-ECHO",
             "status": "valid", "secret_ref": {"workspace_key": "LAB"}},
            {"name": "TOKEN", "description": "Duplicate", "type": "env", "value": ""}]
        result = self.run_check()
        self.assertEqual(result["status"], "fail")
        self.assertNotIn("DO-NOT-ECHO", json.dumps(result))

    def test_valid_secret_reference_and_env_output(self):
        self.doc["case_meta"]["environment_variables"] = [
            {"name": "TOKEN", "description": "Token", "type": "secrets", "secret_ref": {
                "workspace_key": "LAB", "credential_safe_key": "SAFE", "credential_key": "KEY"}},
            {"name": "RESULT", "description": "Relay", "type": "output", "value": "-"},
            {"name": "URL", "description": "Input", "value": "https://example.invalid"}]
        self.assertEqual(self.run_check()["status"], "pass")

    def test_valid_postman_and_invalid_collection(self):
        self.doc["case_meta"]["trigger_method"] = {"executor": "postman", "trigger_path": "collection.json"}
        self.files = {"collection.json": b'{"info": {}, "item": []}'}
        self.assertEqual(self.run_check()["status"], "pass")
        self.files["collection.json"] = b"{}"
        self.assertEqual(self.run_check()["status"], "fail")

    def test_executor_without_static_compiler_is_incomplete(self):
        self.doc["case_meta"]["trigger_method"] = {"executor": "playwright", "trigger_path": "test.ts"}
        self.files = {"test.ts": b"const x = 1;"}
        self.assertEqual(self.run_check()["status"], "incomplete")

    def test_non_object_metadata_and_bad_json(self):
        self.run_check()
        for data in ("[]", "null", "{broken"):
            self.metadata.write_text(data)
            self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_postman_directory_is_not_a_collection(self):
        self.doc["case_meta"]["trigger_method"] = {"executor": "postman", "trigger_path": "tests/"}
        self.assertEqual(self.run_check()["status"], "fail")

    def test_dual_entry_needs_contract_review(self):
        self.doc["case_meta"]["trigger_method"]["trigger_path"] = "tests/test_ok.py"
        self.assertEqual(self.run_check()["status"], "incomplete")

    def test_metadata_size_limit(self):
        self.run_check()
        self.metadata.write_bytes(b" " * 1048577)
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_file_cannot_be_parent_directory(self):
        self.files["tests"] = b"not a directory"
        result = self.run_check()
        self.assertEqual(result["status"], "fail")
        self.assertTrue(any("collision" in e for e in result["errors"]))

    def test_explicit_directory_is_allowed(self):
        self.files["tests/"] = b""
        self.assertEqual(self.run_check()["status"], "pass")

    def test_missing_executor_is_not_merely_unsupported(self):
        del self.doc["case_meta"]["trigger_method"]["executor"]
        self.assertEqual(self.run_check()["status"], "fail")

    def test_duplicate_json_keys_rejected(self):
        self.run_check()
        self.metadata.write_text('{"name":"one","name":"two"}')
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_nonstandard_json_constants_rejected(self):
        self.files["config.json"] = b'{"amount": NaN}'
        self.assertEqual(self.run_check()["status"], "fail")

    def test_special_archive_file_rejected(self):
        self.run_check()
        with zipfile.ZipFile(self.archive, "a") as bundle:
            info = zipfile.ZipInfo("pipe")
            info.create_system = 3
            info.external_attr = (stat.S_IFIFO | 0o644) << 16
            bundle.writestr(info, b"")
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_invalid_deflate_stream_returns_structured_failure(self):
        self.run_check()
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("tests/test_ok.py", b"assert True\n" * 20)
        raw = bytearray(self.archive.read_bytes())
        name_len, extra_len = struct.unpack_from("<HH", raw, 26)
        offset = 30 + name_len + extra_len
        raw[offset] = (raw[offset] & ~6) | 6  # Invalid DEFLATE block type.
        self.archive.write_bytes(raw)
        self.assertEqual(INSPECTOR.inspect_package(self.archive, self.metadata)["status"], "fail")

    def test_cli_from_unrelated_cwd_with_spaces(self):
        self.run_check()
        proc = subprocess.run([sys.executable, str(SCRIPT), str(self.archive), "--metadata", str(self.metadata)],
                              cwd=self.root, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["status"], "pass")


if __name__ == "__main__":
    unittest.main()
