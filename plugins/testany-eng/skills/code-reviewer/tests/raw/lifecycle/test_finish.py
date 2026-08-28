import json
import subprocess
import sys
import tempfile
import unittest


class FinishTests(unittest.TestCase):
    def test_success_paths(self):
        for mode in ("ordinary", "resume"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as state:
                result = subprocess.run(
                    [sys.executable, "runtime.py", mode, "released", state],
                    capture_output=True, text=True, check=False,
                )
                self.assertEqual(result.returncode, 0)
                output = json.loads(result.stdout)
                self.assertIn("PASS", output["events"])
                self.assertFalse(output["lock_held"])
