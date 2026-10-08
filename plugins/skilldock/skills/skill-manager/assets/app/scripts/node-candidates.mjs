#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Writes (--write) or checks the generated node-candidates block of the shell entries
// against server/node-candidates.mjs, the single source of HLD 3.10's candidate list.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellBlock, BLOCK_PATTERN } from '../server/node-candidates.mjs';

const skillRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const SHELL_ENTRIES = ['scripts/launch.sh', 'scripts/native.sh'].map(file => path.join(skillRoot, file));

export async function staleEntries() {
  const stale = [];
  for (const file of SHELL_ENTRIES) {
    const text = await fs.readFile(file, 'utf8');
    if (text.match(BLOCK_PATTERN)?.[0] !== shellBlock()) stale.push(file);
  }
  return stale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    for (const file of SHELL_ENTRIES) {
      const text = await fs.readFile(file, 'utf8');
      if (!BLOCK_PATTERN.test(text)) throw new Error(`${file} 缺少 node-candidates 标记。`);
      await fs.writeFile(file, text.replace(BLOCK_PATTERN, shellBlock()));
    }
  } else {
    const stale = await staleEntries();
    if (stale.length) { process.stderr.write(`node-candidates 已过期：${stale.join('、')}；请运行 node assets/app/scripts/node-candidates.mjs --write\n`); process.exitCode = 1; }
  }
}
