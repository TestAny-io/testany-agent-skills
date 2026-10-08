// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe. The update state file `local/updates.json`: version 1 on generation-1
// data (0.10.x reads it), version 2 once 0.11 has migrated the directory (API-SDX-001 36a §8).
export const defaultSchedule = () => ({ enabled: false, intervalMinutes: 1440, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', autoApply: false, targets: [], running: false });
export const defaultUpdateState = (version, schedule = defaultSchedule()) => ({ version, schedule, bindings: {}, observations: {}, runs: [], activity: [] });
