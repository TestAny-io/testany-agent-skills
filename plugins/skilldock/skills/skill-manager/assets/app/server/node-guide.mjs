// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. The guidance dialog when no usable Node.js is found (HLD 3.10): shown
// in its own process so the caller returns at once; never for restart jobs, headless
// runs (SKILLDOCK_NO_DIALOG=1) or outside macOS.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function showNodeGuidance({ skillRoot, args, state, env = process.env, platform = process.platform, osascript = '/usr/bin/osascript' }) {
  const action = args[0] || 'start';
  if (platform !== 'darwin' || !['start', 'restart'].includes(action) || env.SKILLDOCK_RESTART_JOB || env.SKILLDOCK_NO_DIALOG === '1' || !existsSync(osascript)) return false;
  // "重新检测" runs the same start again with the state, port and project it had.
  const rerun = [`SKILLDOCK_STATE_DIR=${state}`, `PORT=${env.PORT || 4771}`, `SKILLDOCK_PROJECT_DIR=${env.SKILLDOCK_PROJECT_DIR || ''}`,
    '/bin/sh', path.join(skillRoot, 'scripts/launch.sh'), ...args];
  const child = spawn(osascript, [path.join(skillRoot, 'scripts/node-guide.applescript'), ...rerun], { detached: true, stdio: 'ignore', shell: false });
  child.on('error', () => {}); child.unref();
  return true;
}
