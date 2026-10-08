// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Locks for shared state on generation-2 data (HLD 3.7; DEC-SDX-010).
import fs from 'node:fs';
import path from 'node:path';
import { acquireFileLock, operationLock } from './process-lock.mjs';

// DEC-SDX-010: the instance lock in the data directory is taken before any Agent lock.
export const instanceLock = stateDir => path.join(stateDir, 'instance.lock');

/**
 * Shared-state writes on generation-2 data: instance lock → Codex lock (when the Codex
 * root exists; taking a lock never creates an Agent root). Busy locks are retried until
 * `wait` ms have passed.
 */
export async function withStateLocks(stateDir, codexHome, operation, { wait = 60000 } = {}) {
  const deadline = Date.now() + wait;
  for (;;) {
    let instance; let codex;
    try {
      instance = acquireFileLock(instanceLock(stateDir));
      if (codexHome && fs.existsSync(codexHome)) codex = acquireFileLock(operationLock(codexHome));
    } catch (error) {
      codex?.(); instance?.();
      if (error.code !== 'BUSY' || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 200)); continue;
    }
    try { return await operation(); } finally { codex?.(); instance?.(); }
  }
}
export const isOperationActive = codexHome => !!occupied(inspect(operationLock(codexHome)));
