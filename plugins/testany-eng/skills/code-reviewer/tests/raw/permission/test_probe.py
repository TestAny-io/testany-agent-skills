import os
import subprocess
import unittest
from pathlib import Path


class ProbeTests(unittest.TestCase):
    def test_allow(self):
        root = Path(__file__).resolve().parent
        environment = dict(os.environ, PROBE_SCENARIO="allow")
        environment["PATH"] = str(root / "bin") + os.pathsep + environment["PATH"]
        result = subprocess.run(
            ["sh", "run_probe.sh"], cwd=root, env=environment,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "ALLOW\n")
