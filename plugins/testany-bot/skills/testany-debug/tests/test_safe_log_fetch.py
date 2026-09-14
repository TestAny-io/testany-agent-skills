"""Frozen safety expectations; HTTP is always mocked, never contacted."""
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/safe_log_fetch.py'
HOST = '00000000-0000-4000-8000-000000000001.tr.testany.io'
URL = f'https://{HOST}/api/v2/logproxy/internal/view?sign=FAKE_SIGNATURE&a=1'


class Response(io.BytesIO):
    status = 200
    headers = {}


class SafeLogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('safe_log', SCRIPT)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def parse(self, payload):
        return self.module.parse_payload(payload, HOST)

    def test_structured_request_preserves_signature(self):
        req = self.parse({'url':URL,'headers':{'Authorization':'Bearer FAKE_TOKEN'}})
        self.assertEqual(req['url'], URL)
        self.assertEqual(req['headers']['Authorization'], 'Bearer FAKE_TOKEN')

    def test_quoted_curl_and_flags(self):
        req = self.parse({'curlCommand':f"curl -sSf --request GET --url '{URL}' -H 'sign: FAKE_TOKEN'"})
        self.assertEqual(req['url'], URL)
        self.assertEqual(req['headers']['sign'], 'FAKE_TOKEN')

    def test_china_runtime_domain(self):
        host = HOST.replace('testany.io', 'testany.com.cn')
        req = self.module.parse_payload({'logUrl':URL.replace(HOST, host)}, host)
        self.assertIn(host, req['url'])

    def test_line_continuations(self):
        req = self.parse({'curlCommand':f"curl \\\n --url '{URL}' \\\n -H 'sign: FAKE_TOKEN'"})
        self.assertEqual(req['url'], URL)

    def test_rejects_shell_operators_and_expansion(self):
        for suffix in ('; touch marker',' | sh',' && echo x',' > marker',' $(touch marker)',' `touch marker`','\necho x'):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                self.parse({'curlCommand':f"curl '{URL}'" + suffix})

    def test_rejects_unsafe_or_unknown_options(self):
        for option in ('-o marker','--output marker','--config file','--insecure','--proxy https://proxy.testany.io','--netrc','-L','--location','--data x','-X POST','--next','--resolve x','--upload-file x','--header @file'):
            with self.subTest(option=option), self.assertRaises(ValueError):
                self.parse({'curlCommand':f"curl '{URL}' {option}"})

    def test_rejects_multiple_urls(self):
        with self.assertRaises(ValueError):
            self.parse({'curlCommand':f"curl '{URL}' '{URL}'"})

    def test_rejects_untrusted_or_mismatched_targets(self):
        urls = [URL.replace('https:', 'http:'), URL.replace(HOST, HOST+'.evil.example'), URL.replace(HOST, 'other.tr.testany.io'), URL.replace(HOST, '127.0.0.1'), URL.replace(HOST, 'user@'+HOST), URL.replace(HOST, HOST+':444'), URL+'#fragment', URL.replace('/api/v2/logproxy/internal/view','/admin'), URL.replace(HOST, HOST+'.'), URL.replace(HOST, HOST+'\\@evil.example')]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.parse({'url':url})

    def test_rejects_invalid_expected_host(self):
        for host in ('evil.example','testany.io','127.0.0.1','x.testany.io','user@'+HOST):
            with self.subTest(host=host), self.assertRaises(ValueError):
                self.module.parse_payload({'url':URL},host)

    def test_rejects_header_injection_and_transport_headers(self):
        for headers in ({'Authorization':'x\r\nHost: evil'},{'Host':HOST},{'Proxy-Authorization':'x'},{'Content-Length':'4'},{'Connection':'close'},{'Bad Name':'x'},{'Authorization':'x','authorization':'y'}):
            with self.subTest(headers=headers), self.assertRaises(ValueError):
                self.parse({'url':URL,'headers':headers})

    def test_rejects_conflicting_payload_sources(self):
        with self.assertRaises(ValueError):
            self.parse({'url':URL,'curlCommand':f"curl '{URL}&changed=1'"})
        with self.assertRaises(ValueError):
            self.parse({'url':URL,'headers':{'sign':'A'},'curlCommand':f"curl '{URL}' -H 'sign: B'"})

    def test_rejects_malformed_payload(self):
        for payload in (None, [], {}, {'url':URL,'method':'POST'}, {'url':URL,'headers':['x']}, {'url':URL,'headers':{'sign':None}}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.parse(payload)

    def test_fetch_uses_https_without_proxies_or_redirects(self):
        req = self.parse({'url':URL})
        with patch.object(self.module.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = Response(b'example log')
            self.assertEqual(self.module.fetch_bytes(req), b'example log')
        handlers = build.call_args.args
        self.assertTrue(any(isinstance(h, self.module.urllib.request.ProxyHandler) and h.proxies == {} for h in handlers))
        redirect = next(h for h in handlers if isinstance(h, self.module.urllib.request.HTTPRedirectHandler))
        self.assertIsNone(redirect.redirect_request(None, None, 302, '', {}, 'https://evil.example'))

    def test_fetch_rejects_redirect_without_second_request(self):
        for status in (301,302,307,308):
            with self.subTest(status=status), patch.object(self.module.urllib.request,'build_opener') as build:
                response = Response(b'')
                response.status = status
                response.headers = {'Location':'https://evil.example/?sign=FAKE_SIGNATURE'}
                build.return_value.open.return_value = response
                with self.assertRaises(ValueError):
                    self.module.fetch_bytes(self.parse({'url':URL}))
                self.assertEqual(build.return_value.open.call_count, 1)

    def test_fetch_rejects_oversized_body(self):
        with patch.object(self.module.urllib.request,'build_opener') as build:
            build.return_value.open.return_value = Response(b'12345')
            with self.assertRaises(ValueError):
                self.module.fetch_bytes(self.parse({'url':URL}), max_bytes=4)

    def test_fetch_errors_do_not_leak_signed_url(self):
        with patch.object(self.module.urllib.request,'build_opener') as build:
            build.return_value.open.side_effect = OSError(URL)
            with self.assertRaises(ValueError) as error:
                self.module.fetch_bytes(self.parse({'url':URL}))
            self.assertNotIn('FAKE_SIGNATURE', str(error.exception))

    def test_cli_defaults_to_no_network_and_redacts(self):
        result = subprocess.run([sys.executable,str(SCRIPT),'--expected-host',HOST], input=json.dumps({'url':URL,'headers':{'Authorization':'Bearer FAKE_TOKEN'}}), text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(json.loads(result.stdout)['validated'])
        self.assertFalse(json.loads(result.stdout)['fetched'])
        self.assertNotIn('FAKE_SIGNATURE', result.stdout+result.stderr)
        self.assertNotIn('FAKE_TOKEN', result.stdout+result.stderr)

    def test_cli_rejects_without_echoing_payload(self):
        result = subprocess.run([sys.executable,str(SCRIPT),'--expected-host',HOST],input=json.dumps({'curlCommand':f"curl '{URL}'; echo FAKE_TOKEN"}),text=True,capture_output=True)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('FAKE_SIGNATURE',result.stdout+result.stderr)
        self.assertNotIn('FAKE_TOKEN',result.stdout+result.stderr)

    def test_output_is_exclusive_and_private(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / 'log.txt'
            self.module.save_private(dest,b'log')
            self.assertEqual(dest.stat().st_mode & 0o777,0o600)
            with self.assertRaises(FileExistsError):
                self.module.save_private(dest,b'new')
            self.assertEqual(dest.read_bytes(),b'log')


if __name__ == '__main__':
    unittest.main()
