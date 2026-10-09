// SPDX-License-Identifier: AGPL-3.0-only
// Keep launcher/lock errors usable before application dependencies are installed.
export class AppError extends Error {
  // `nativeRules` travels only with CONFIRMATION_REQUIRED (API-SDX-001 36c §7.3).
  constructor(status, code, message, { nativeRules } = {}) { super(message); this.status = status; this.code = code; if (nativeRules) this.nativeRules = nativeRules; }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
export function redact(message) {
  return String(message).replace(/((?:https?|ssh):\/\/)[^\s/]+@/gi, '$1[redacted]@').replace(/((?:token|password|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]').slice(0, 3000);
}
