// SPDX-License-Identifier: AGPL-3.0-only
// Keep launcher/lock errors usable before application dependencies are installed.
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
