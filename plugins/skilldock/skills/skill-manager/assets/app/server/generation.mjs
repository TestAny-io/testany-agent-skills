// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. Data generation marker (API-SDX-001 36a §4).
import fs from 'node:fs/promises';
import path from 'node:path';
import { readText } from './installs.mjs';

/** 0.10.x data is generation 1; 0.11.0 migrates it to 2. */
export const CURRENT_GENERATION = 2;
export const markerFile = state => path.join(state, 'generation.json');

/** Absent → 1; unreadable or malformed → Infinity, so nothing older takes over. */
export async function readGeneration(state) {
  const text = await readText(markerFile(state));
  if (text === undefined) return 1;
  try { const value = JSON.parse(text); if (Number.isInteger(value?.generation)) return value.generation; } catch { /* treated as newer */ }
  return Number.POSITIVE_INFINITY;
}

export async function writeAtomic(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { await fs.writeFile(temporary, text, { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

/** Written last during migration (HLD 3.7); never removed or lowered afterwards. */
export async function writeGeneration(state, writtenBy) {
  await writeAtomic(markerFile(state), `${JSON.stringify({ format: 1, generation: CURRENT_GENERATION, minimumCompatibleGeneration: CURRENT_GENERATION, writtenBy, writtenAt: new Date().toISOString() }, null, 2)}\n`);
}
