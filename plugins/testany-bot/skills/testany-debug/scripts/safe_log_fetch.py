#!/usr/bin/env python3
"""Validate signed Testany log GETs; fetching is explicit and never uses a shell."""
import argparse
import http.client
import json
import os
import re
import shlex
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LOG_PATH = '/api/v2/logproxy/internal/view'
HOST_RE = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tr\.testany\.(?:io|com\.cn)\Z')
HEADER_RE = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+\Z")
TRANSPORT_HEADERS = {'host','connection','proxy-authorization','proxy-connection','content-length','transfer-encoding','upgrade','te','trailer','expect','range','accept-encoding'}


def validate_url(url, expected_host):
    if not isinstance(expected_host, str) or not HOST_RE.fullmatch(expected_host):
        raise ValueError('expected host must be a verified Testany runtime log host')
    if not isinstance(url, str) or len(url) > 32768 or re.search(r'[\x00-\x20\x7f\\]', url):
        raise ValueError('invalid log URL')
    try:
        parts = urllib.parse.urlsplit(url)
        valid = (parts.scheme == 'https' and parts.hostname == expected_host
                 and parts.netloc in (expected_host, expected_host + ':443')
                 and parts.port in (None,443) and not parts.username and not parts.password
                 and parts.path == LOG_PATH and not parts.fragment and '#' not in url)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('log URL does not match the authorized HTTPS host and path')
    return url


def validate_headers(headers):
    if not isinstance(headers, dict) or len(headers) > 32:
        raise ValueError('headers must be a small object')
    seen = set()
    for key,value in headers.items():
        if not isinstance(key,str) or not HEADER_RE.fullmatch(key) or key.lower() in TRANSPORT_HEADERS or key.lower() in seen:
            raise ValueError('unsupported or duplicate header')
        if not isinstance(value,str) or len(value) > 16384 or re.search(r'[\x00-\x1f\x7f]',value):
            raise ValueError('invalid header value')
        try:
            value.encode('latin-1')
        except UnicodeEncodeError:
            raise ValueError('header value must be HTTP encodable') from None
        seen.add(key.lower())
    return dict(headers)


def parse_curl(command):
    if not isinstance(command,str) or len(command) > 65536:
        raise ValueError('invalid curl data')
    command = command.replace('\\\r\n',' ').replace('\\\n',' ')
    if re.search(r'[\x00-\x08\x0a-\x1f\x7f$`]',command):
        raise ValueError('shell expansion or control characters are not allowed')
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|<>()')
        lexer.whitespace_split = True
        lexer.commenters = ''
        tokens = list(lexer)
    except ValueError:
        raise ValueError('invalid curl quoting') from None
    if not tokens or tokens.pop(0) not in ('curl','/usr/bin/curl'):
        raise ValueError('only curl GET data is supported')
    urls, headers = [], {}
    method_seen = False
    i = 0
    while i < len(tokens):
        token = tokens[i]
        i += 1
        if token in ('--silent','--show-error','--fail') or re.fullmatch(r'-[sSf]+',token):
            continue
        option, separator, attached = token.partition('=')
        if option in ('--url','--header','--request','-H','-X'):
            if separator:
                if not option.startswith('--'):
                    raise ValueError('unsupported curl option')
                value = attached
            else:
                if i == len(tokens):
                    raise ValueError('missing curl option value')
                value = tokens[i]
                i += 1
            if option in ('--url',):
                urls.append(value)
            elif option in ('--request','-X'):
                if value != 'GET' or method_seen:
                    raise ValueError('only one GET method is allowed')
                method_seen = True
            else:
                name, colon, value = value.partition(':')
                if not colon or any(k.lower() == name.lower() for k in headers):
                    raise ValueError('invalid or duplicate curl header')
                headers[name] = value.lstrip(' ')
        elif token.startswith('https://'):
            urls.append(token)
        else:
            raise ValueError('unsupported curl option or extra command')
    if len(urls) != 1:
        raise ValueError('exactly one log URL is required')
    return {'url':urls[0],'headers':validate_headers(headers)}


def parse_payload(payload, expected_host):
    if not isinstance(payload,dict) or payload.get('method','GET') != 'GET':
        raise ValueError('expected a signed GET payload object')
    urls = [payload[k] for k in ('url','logUrl') if k in payload]
    if urls and any(url != urls[0] for url in urls):
        raise ValueError('conflicting URL fields')
    if 'curlCommand' in payload:
        request = parse_curl(payload['curlCommand'])
        if urls and request['url'] != urls[0]:
            raise ValueError('conflicting URL sources')
        if 'headers' in payload:
            supplied = validate_headers(payload['headers'])
            if {k.lower():v for k,v in supplied.items()} != {k.lower():v for k,v in request['headers'].items()}:
                raise ValueError('conflicting header sources')
    elif urls:
        request = {'url':urls[0],'headers':validate_headers(payload.get('headers',{}))}
    else:
        raise ValueError('no structured URL or supported curl data')
    validate_url(request['url'],expected_host)
    return request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_bytes(request, max_bytes=10*1024*1024, timeout=10, budget=30):
    if not 0 < max_bytes <= 10*1024*1024 or not 0 < timeout <= 30 or not 0 < budget <= 60:
        raise ValueError('invalid download limits')
    # No environment proxies, custom CA policy, automatic redirects or curl config.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    started = time.monotonic()
    try:
        req = urllib.request.Request(request['url'],headers=request['headers'],method='GET')
        with opener.open(req,timeout=min(timeout,budget)) as response:
            if response.status != 200:
                raise ValueError('log server did not return HTTP 200; redirects are refused')
            encoding = response.headers.get('Content-Encoding','identity')
            if encoding.lower() not in ('','identity'):
                raise ValueError('compressed responses are not supported')
            chunks, size = [], 0
            while True:
                if time.monotonic() - started >= budget:
                    raise ValueError('log download observation budget expired')
                chunk = response.read1(min(65536,max_bytes-size+1))
                if time.monotonic() - started >= budget:
                    raise ValueError('log download observation budget expired')
                if not chunk:
                    return b''.join(chunks)
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError('log exceeds download size limit')
                chunks.append(chunk)
    except (OSError, urllib.error.URLError, http.client.HTTPException, ValueError):
        # Network exceptions may contain signed URLs; never interpolate them.
        raise ValueError('log download unavailable, refused or exceeded limits; no redirect followed') from None


def save_private(path, data):
    descriptor = os.open(path,os.O_WRONLY | os.O_CREAT | os.O_EXCL,0o600)
    with os.fdopen(descriptor,'wb') as output:
        output.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload',default='-',help='trusted local response file, or stdin')
    parser.add_argument('--expected-host',required=True,help='derive from the authorized runtime, never from curl data alone')
    parser.add_argument('--fetch',action='store_true',help='perform the authorized GET; default is validation only')
    parser.add_argument('--output',help='new local log file, required with --fetch')
    args = parser.parse_args()
    try:
        if bool(args.output) != args.fetch:
            raise ValueError('--fetch and --output must be used together')
        if args.payload == '-':
            raw = sys.stdin.read(65537)
        else:
            with open(args.payload,encoding='utf-8') as source:
                raw = source.read(65537)
        if len(raw) > 65536:
            raise ValueError('payload too large')
        request = parse_payload(json.loads(raw),args.expected_host)
        result = {'validated':True,'fetched':False,'host':args.expected_host,'path':LOG_PATH,'header_names':list(request['headers'])}
        if args.fetch:
            body = fetch_bytes(request)
            save_private(args.output,body)
            result.update(fetched=True,bytes=len(body))
        print(json.dumps(result))
    except (ValueError,OSError,UnicodeError):
        print(json.dumps({'validated':False,'fetched':False,'error':'request refused or log unavailable; do not execute the original command'}),file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
