"""Additional regression cases discovered during B1 implementation review."""
import http.client
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/safe_log_fetch.py'
HOST = 'review.tr.testany.io'
URL = f'https://{HOST}/api/v2/logproxy/internal/view?sign=FAKE_SIGNATURE'


class Response(io.BytesIO):
    status = 200
    headers = {}


class EdgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('safe_log_edges',SCRIPT)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_protocol_error_is_sanitized(self):
        for exc in (http.client.BadStatusLine('FAKE_SIGNATURE'),http.client.IncompleteRead(b'FAKE_SIGNATURE',20),http.client.LineTooLong('FAKE_SIGNATURE')):
            with self.subTest(error=type(exc).__name__), patch.object(self.module.urllib.request,'build_opener') as build:
                build.return_value.open.side_effect = exc
                with self.assertRaises(ValueError) as error:
                    self.module.fetch_bytes(self.module.parse_payload({'url':URL},HOST))
                self.assertNotIn('FAKE_SIGNATURE',str(error.exception))

    def test_observation_budget_expires_after_read(self):
        with patch.object(self.module.urllib.request,'build_opener') as build, patch.object(self.module.time,'monotonic',side_effect=[0,0,31]):
            build.return_value.open.return_value = Response(b'log')
            with self.assertRaises(ValueError):
                self.module.fetch_bytes(self.module.parse_payload({'url':URL},HOST))

    def test_compressed_response_refused(self):
        with patch.object(self.module.urllib.request,'build_opener') as build:
            response = Response(b'compressed')
            response.headers = {'Content-Encoding':'gzip'}
            build.return_value.open.return_value = response
            with self.assertRaises(ValueError):
                self.module.fetch_bytes(self.module.parse_payload({'url':URL},HOST))

    def test_symlink_output_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            self.module.save_private(path/'existing',b'original')
            (path/'link').symlink_to(path/'existing')
            with self.assertRaises(FileExistsError):
                self.module.save_private(path/'link',b'changed')
            self.assertEqual((path/'existing').read_bytes(),b'original')


if __name__ == '__main__':
    unittest.main()
