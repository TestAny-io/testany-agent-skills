// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite, readJson, writeJson, fail, redact } from './files.mjs';
import { installationIdentity, sameInstallation } from './installation.mjs';
import { findNpm } from './toolchain.mjs';
import { compareVersions } from './versions.mjs';
import { verifyRuntime } from './runtime.mjs';

const execute = promisify(execFile);
const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const quote = value => `'${String(value).replace(/'/g, "'\\''")}'`;
export function normalizeBackgroundStatus(status = {}) {
  // 0.4.0 mixed update-batch messages into worker health. Its real worker
  // exceptions always included retryAt; entry failures had no app version.
  // Keep both genuine failure forms, including before the first upgraded wake.
  if (status.format === undefined && status.version === '0.4.0' && !status.retryAt)
    return { ...status, error: undefined, errorAt: undefined };
  return status;
}
export const backgroundPaths = (stateDir, home = os.homedir()) => {
  const label = `io.testany.skilldock.update.${crypto.createHash('sha256').update(stateDir).digest('hex').slice(0, 16)}`;
  const root = path.join(stateDir, 'background');
  return { root, label, context: path.join(root, 'context.json'), status: path.join(root, 'status.json'),
    entry: path.join(root, 'entry.mjs'), script: path.join(root, 'run.sh'), disabled: path.join(root, 'disabled.json'),
    plist: path.join(home, 'Library/LaunchAgents', `${label}.plist`) };
};

export function launchAgentPlist(paths, home) {
  const calendars = Array.from({ length: 12 }, (_, n) => `<dict><key>Minute</key><integer>${n * 5}</integer></dict>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${xml(paths.label)}</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>${xml(paths.script)}</string></array>
<key>WorkingDirectory</key><string>${xml(paths.root)}</string>
<key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(home)}</string><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string></dict>
<key>RunAtLoad</key><true/><key>StartCalendarInterval</key><array>${calendars}</array>
<key>ProcessType</key><string>Background</string><key>LowPriorityIO</key><true/>
<key>ExitTimeOut</key><integer>300</integer><key>ThrottleInterval</key><integer>30</integer>
<key>StandardErrorPath</key><string>${xml(path.join(paths.root, 'launchd.log'))}</string>
</dict></plist>\n`;
}

export function createBackgroundManager({ stateDir, home = os.homedir(), codexHome, project, platform = process.platform,
  uid = process.getuid?.(), command = async args => execute('/bin/launchctl', args, { timeout: 10000, maxBuffer: 1024 * 1024 }), appRuntime = runtime } = {}) {
  const paths = backgroundPaths(stateDir, home); const domain = `gui/${uid}`; const service = `${domain}/${paths.label}`;
  async function disabled() {
    const { stdout } = await command(['print-disabled', domain]);
    return stdout.split('\n').some(line => line.includes(`"${paths.label}"`) && /=>\s*true/.test(line));
  }
  async function loaded() {
    try { return (await command(['print', service])).stdout; }
    catch (error) { if (/Could not find service|not found|No such process/i.test(error.stderr || error.message)) return null; throw error; }
  }
  async function ensure() {
    if (platform !== 'darwin') fail(422, 'BACKGROUND_UNSUPPORTED', '独立后台更新目前支持 macOS。');
    if (await disabled()) fail(422, 'BACKGROUND_DISABLED', '后台任务已被 macOS 禁用。请在系统设置中允许 SkillDock 后台运行，再保存计划。');
    await fs.mkdir(paths.root, { recursive: true, mode: 0o700 });
    const record = await readJson(path.join(stateDir, 'launcher.json'), null);
    const previous = await readJson(paths.context, null);
    const matching = record?.runtime === appRuntime && record.state === stateDir;
    const source = matching ? record.source : process.env.SKILLDOCK_APP_SOURCE || (previous?.runtime === appRuntime ? previous.source : appRuntime);
    const installation = await installationIdentity(source, codexHome, { expected: matching ? record.installation : previous?.installation });
    const context = { version: 1, stateDir, home, codexHome, projectDir: project(), runtime: appRuntime, source, installation,
      node: process.execPath, ...((matching ? record.digest : process.env.SKILLDOCK_SOURCE_DIGEST) ? { digest: matching ? record.digest : process.env.SKILLDOCK_SOURCE_DIGEST } : {}), ...(matching && record.cli?.available ? { codexBin: record.cli.path } : {}),
      environment: Object.fromEntries(['SKILLDOCK_SELECTED_NPM_CLI', 'SKILLDOCK_CODEX_APP_DIR', 'SKILLDOCK_WORKSPACE_RUNTIME'].filter(key => process.env[key]).map(key => [key, process.env[key]])) };
    if (!context.codexBin && process.env.SKILLDOCK_CODEX_BIN) context.codexBin = process.env.SKILLDOCK_CODEX_BIN;
    if (previous?.digest && previous.runtime !== appRuntime && sameInstallation(previous.installation, installation)) {
      const activeVersion = (await readJson(path.join(appRuntime, 'package.json'))).version;
      const preparedVersion = (await readJson(path.join(previous.runtime, 'package.json'), {})).version;
      if (compareVersions(preparedVersion, activeVersion) === 1) {
        await verifyRuntime(previous.runtime, previous.digest);
        Object.assign(context, { runtime: previous.runtime, source: previous.source, digest: previous.digest });
      }
    }
    const npm = await findNpm(process.execPath);
    if (!npm) fail(422, 'BACKGROUND_RUNTIME_UNAVAILABLE', '未找到可供后台构建使用的 npm，请通过 launch.sh 重新打开 SkillDock。');
    context.environment.SKILLDOCK_SELECTED_NPM_CLI = npm.npmCli;
    await writeJson(paths.context, context);
    await atomicWrite(paths.entry, await fs.readFile(path.join(appRuntime, 'server/background-entry.mjs')));
    // The fixed shell entry survives removal of a versioned plugin cache or a
    // desktop app's Node binary. No interactive shell or stored credentials.
    await atomicWrite(paths.script, `#!/bin/sh\nset -eu\nexport SKILLDOCK_STATE_DIR=${quote(stateDir)}\nfor candidate in ${quote(process.execPath)} "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ${quote(stateDir)}/node/node-v*-darwin-*/bin/node /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node /Applications/Codex.app/Contents/Resources/cua_node/bin/node /Applications/ChatGPT.app/Contents/Resources/node /Applications/Codex.app/Contents/Resources/node /opt/homebrew/bin/node /usr/local/bin/node; do\n  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' >/dev/null 2>&1; then\n    exec "$candidate" ${quote(paths.entry)} ${quote(paths.context)}\n  fi\ndone\nprintf '%s\\n' 'SkillDock: Node runtime unavailable. Reopen SkillDock to repair background updates.' >&2\nexit 1\n`, 0o700);
    const wasLoaded = await loaded();
    await fs.mkdir(path.dirname(paths.plist), { recursive: true });
    await atomicWrite(paths.plist, launchAgentPlist(paths, home));
    try {
      if (!wasLoaded) await command(['bootstrap', domain, paths.plist]);
      if (!await loaded()) throw new Error('launchd did not retain the background task');
    } catch (error) {
      if (!wasLoaded) {
        await command(['bootout', service]).catch(() => {});
        await fs.rm(paths.plist, { force: true });
      }
      fail(422, 'BACKGROUND_REGISTRATION_FAILED', `后台任务注册失败：${redact(error.stderr || error.message)}`);
    }
    return { newlyRegistered: !wasLoaded };
  }
  async function remove({ deferBootout = false } = {}) {
    if (platform !== 'darwin') return;
    // Remove the next-login registration even if the GUI login domain is gone.
    await fs.rm(paths.plist, { force: true });
    if (await loaded()) {
      if (deferBootout) {
        // launchctl may wait for the worker to exit. A self-uninstall must not
        // wait on that command while launchd is waiting on this very process.
        await new Promise((resolve, reject) => {
          const child = spawn('/bin/launchctl', ['bootout', service], { detached: true, stdio: 'ignore' });
          child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
        });
        return;
      }
      await command(['bootout', service]);
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      if (!await loaded()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    fail(422, 'BACKGROUND_REMOVE_FAILED', '后台任务尚未卸载，请重试。');
  }
  async function status(enabled) {
    const last = normalizeBackgroundStatus(await readJson(paths.status, {}));
    const common = { provider: 'launchd', lastWakeAt: last?.lastWakeAt, lastFinishedAt: last?.finishedAt,
      lastError: last?.error, lastErrorAt: last?.error ? last.errorAt || last.finishedAt : undefined, outcome: last?.outcome, retryAt: last?.retryAt };
    if (platform !== 'darwin') return { ...common, status: 'unsupported' };
    try {
      if (await disabled()) return { ...common, status: enabled ? 'blocked' : 'off' };
      const job = await loaded();
      if (!enabled) return { ...common, status: job ? 'stopping' : 'off' };
      if (!job) return { ...common, status: 'unregistered' };
      const exit = /last exit code = (\d+)/.exec(job);
      if (exit && Number(exit[1]) !== 0) return { ...common, status: 'error', lastError: common.lastError || `后台任务异常退出（${exit[1]}），请重新打开 SkillDock 检查运行环境。` };
      const active = last?.pid && new RegExp(`\\bpid = ${last.pid}\\b`).test(job);
      if (!active && (!last?.lastWakeAt || Date.now() - Date.parse(last.lastWakeAt) > 20 * 60000)) return { ...common, status: 'unverified' };
      return { ...common, status: last.error ? 'error' : 'ready' };
    } catch (error) { return { ...common, status: 'error', lastError: redact(error.stderr || error.message) }; }
  }
  return { paths, ensure, remove, status };
}
