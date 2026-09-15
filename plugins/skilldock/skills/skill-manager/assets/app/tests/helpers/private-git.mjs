import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { runProcess } from '../../server/cli.mjs';

export const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
export async function privateGit(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-private-git-')));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  const working = path.join(root, 'working'); const repositories = path.join(root, 'repositories'); const bare = path.join(repositories, 'private.git');
  await fs.mkdir(working); await fs.mkdir(repositories);
  const git = args => runProcess('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', working, ...args], { env });
  await git(['init', '--template=', '-b', 'main']);
  const skill = path.join(working, 'skills/private-notes/SKILL.md');
  const plugin = path.join(working, 'plugins/private-tools');
  const manifest = path.join(plugin, '.codex-plugin/plugin.json');
  for (const dir of [path.dirname(skill), path.dirname(manifest), path.join(plugin, 'skills/private-review'), path.join(working, '.agents/plugins')]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(working, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'private-fixture', plugins: [{ name: 'private-tools', source: './plugins/private-tools' }] }));
  await fs.writeFile(path.join(working, '.gitattributes'), '*.md filter=fixture\n');
  let revision = 0;
  async function commit() {
    revision++;
    const content = `---\nname: private-notes\ndescription: Private Git fixture.\n---\nRevision ${revision}\n`;
    await fs.writeFile(skill, content);
    await fs.writeFile(path.join(plugin, 'skills/private-review/SKILL.md'), content.replace('private-notes', 'private-review'));
    await fs.writeFile(manifest, JSON.stringify({ name: 'private-tools', version: `${revision}.0.0` }));
    await git(['add', '.']); await git(['commit', '-m', `revision ${revision}`]);
    if (revision > 1) await git(['push', bare, 'main']);
    return (await git(['rev-parse', 'HEAD'])).stdout.trim();
  }
  const first = await commit(); await git(['clone', '--bare', '--no-hardlinks', '--template=', working, bare]);
  const cert = path.join(root, 'server.crt'); const key = path.join(root, 'server.key'); const openssl = path.join(root, 'openssl.cnf');
  await fs.writeFile(openssl, '[req]\ndistinguished_name=dn\nx509_extensions=extensions\nprompt=no\n[dn]\nCN=127.0.0.1\n[extensions]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n');
  await runProcess('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-config', openssl]);
  const password = crypto.randomBytes(24).toString('hex'); const authorization = `Basic ${Buffer.from(`fixture:${password}`).toString('base64')}`;
  const access = { enabled: true, challenged: 0, authenticated: 0 };
  const children = new Set();
  const server = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, (req, res) => {
    if (!access.enabled || req.headers.authorization !== authorization) {
      access.challenged++; res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SkillDock test repository"' }); res.end('Authentication required'); req.resume(); return;
    }
    access.authenticated++;
    const url = new URL(req.url, 'https://127.0.0.1');
    const child = spawn('git', ['http-backend'], { env: { ...env, GIT_PROJECT_ROOT: repositories, GIT_HTTP_EXPORT_ALL: '1', REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: req.headers['content-length'] || '', REMOTE_USER: 'fixture', SERVER_PROTOCOL: 'HTTP/1.1', GATEWAY_INTERFACE: 'CGI/1.1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child); const chunks = [];
    child.stderr.on('data', () => {}); child.stdout.on('data', bytes => chunks.push(bytes)); req.pipe(child.stdin); child.stdin.on('error', () => {});
    child.once('close', code => {
      children.delete(child); const data = Buffer.concat(chunks); const offset = data.indexOf('\r\n\r\n');
      if (code || offset < 0) { res.writeHead(500); res.end('Fixture backend failed'); return; }
      let status = 200; const headers = {};
      for (const line of data.subarray(0, offset).toString().split('\r\n')) {
        const colon = line.indexOf(':'); const name = line.slice(0, colon); const value = line.slice(colon + 1).trim();
        if (name.toLowerCase() === 'status') status = Number(value.slice(0, 3)); else headers[name] = value;
      }
      res.writeHead(status, headers); res.end(data.subarray(offset + 4));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const child of children) child.kill('SIGKILL'); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const endpoint = `https://127.0.0.1:${server.address().port}`; const source = 'https://skilldock-private.invalid/private.git';
  const helper = path.join(root, 'credential-helper.mjs'); const helperLog = path.join(root, 'helper-operations.jsonl');
  await fs.writeFile(helper, `import fs from 'node:fs';
let input=''; for await (const part of process.stdin) input+=part;
const action=process.argv[2]; fs.appendFileSync(${JSON.stringify(helperLog)},JSON.stringify({action,prompt:process.env.GIT_TERMINAL_PROMPT})+'\\n');
if(action==='get'&&input.includes(${JSON.stringify(`host=127.0.0.1:${server.address().port}`)})) process.stdout.write('username=fixture\\npassword='+process.env.SKILLDOCK_TEST_PASSWORD+'\\n\\n');
`);
  const config = path.join(root, 'gitconfig');
  const authConfig = `[http]\n sslCAInfo = ${JSON.stringify(cert)}\n[url ${JSON.stringify(`${endpoint}/`)}]\n insteadOf = https://skilldock-private.invalid/\n[credential]\n helper = \n helper = ${JSON.stringify(`!${quote(process.execPath)} ${quote(helper)}`)}\n`;
  await fs.writeFile(config, authConfig);
  return { root, env: { ...env, GIT_CONFIG_GLOBAL: config, SKILLDOCK_TEST_PASSWORD: password }, source, endpoint, first, git, commit, access, config, authConfig, password, helperLog, skill, plugin, bare };
}
