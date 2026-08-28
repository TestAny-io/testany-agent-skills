import unittest

from gate import verify_resources
from provider import Resource


class GateTests(unittest.TestCase):
    def test_approved_inventory(self):
        resources = [
            Resource("V001__setup.sql", b"CREATE TABLE sample (id INTEGER);\n"),
            Resource("V002__index.sql", b"CREATE INDEX sample_id ON sample(id);\n"),
        ]
        self.assertTrue(verify_resources(resources))

    def test_changed_content(self):
        resources = [
            Resource("V001__setup.sql", b"CREATE TABLE changed (id INTEGER);\n"),
            Resource("V002__index.sql", b"CREATE INDEX sample_id ON sample(id);\n"),
        ]
        self.assertFalse(verify_resources(resources))
