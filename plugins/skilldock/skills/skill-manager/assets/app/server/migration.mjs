// SPDX-License-Identifier: AGPL-3.0-only
// Data migration from generation 1 (0.10.x) to 2 (HLD 3.7; DEC-SDX-022). Runs inside
// launch.mjs while <state>/launcher.lock is held.
import path from 'node:path';
import { readText } from './installs.mjs';
import { readGeneration, writeGeneration, CURRENT_GENERATION } from './generation.mjs';
import { EXIT_MIGRATION_BLOCKED } from './launch-plan.mjs';

// The files 0.10.x reads whose format changes in generation 2 (36a §5, §8, §10).
const CONVERTED = ['launcher.json', 'local/updates.json', 'background/context.json'];

export async function legacyData(state) {
  const present = [];
  for (const file of CONVERTED) if (await readText(path.join(state, file)) !== undefined) present.push(file);
  return present;
}

/**
 * A data directory without 0.10.x launcher, plan or background files starts directly at
 * generation 2. Existing 0.10.x data needs the gate and takeover of phase 1c.
 */
export async function migrateIfNeeded({ state, plan }) {
  if (await readGeneration(state) >= CURRENT_GENERATION) return { migrated: false };
  const present = await legacyData(state);
  if (present.length) {
    throw Object.assign(new Error(`数据目录含有 0.10.x 数据（${present.join('、')}），此构建尚不能迁移。`), { code: 'MIGRATION_PENDING', exitCode: EXIT_MIGRATION_BLOCKED });
  }
  await writeGeneration(state, plan.own.version);
  return { migrated: true, fresh: true };
}
