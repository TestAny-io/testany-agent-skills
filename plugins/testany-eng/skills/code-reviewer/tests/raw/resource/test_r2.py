import tempfile
import unittest
from pathlib import Path

from gate import verify_resources
from provider import DirectoryProvider


class GateTests(unittest.TestCase):
    def test_directory_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "db/migration/V001__setup.sql"
            second = root / "db/migration/nested/V002__index.sql"
            second.parent.mkdir(parents=True)
            first.write_bytes(b"CREATE TABLE sample (id INTEGER);\n")
            second.write_bytes(b"CREATE INDEX sample_id ON sample(id);\n")
            self.assertTrue(verify_resources(DirectoryProvider(root).resources()))
            second.rename(root / "db/migration/V002__index.sql")
            self.assertFalse(verify_resources(DirectoryProvider(root).resources()))
