// Paste these definitions once into the supported browser REPL after host setup.
// Replaying after reset is safe; this file never selects a browser or opens a tab.
var workflowBrowserVersion = "1";
var workflowSnapshot = undefined;
var workflowSnapshotTab = undefined;
var workflowSnapshotSerial = 0;

function workflowInvalidate() {
  workflowSnapshot = undefined;
  workflowSnapshotTab = undefined;
}

function workflowRegion(text, request = {}) {
  const error = (status, extra = {}) => ({status, complete: false, purpose: "navigation_only", ...extra});
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  if (typeof text !== "string" || !request || typeof request !== "object" || Array.isArray(request))
    return error("INVALID_ARGUMENT");
  const limit = request.maxBytes ?? 6144;
  if (!Number.isInteger(limit) || limit < 1024 || limit > 65536) return error("INVALID_ARGUMENT");
  const lines = text.split("\n");
  const base = {scope: "selected_lines_only", total_lines: lines.length, snapshot_chars: text.length};
  const notices = lines.flatMap((line, i) => /^\s*- (?:alert|dialog|alertdialog)\b/.test(line) ? [i + 1] : []);
  base.notice_lines = notices.slice(0, 16);
  base.notices_omitted = Math.max(0, notices.length - base.notice_lines.length);
  const navigate = (status, indexes) => {
    const result = error(status, {...base, matches: [], matches_omitted: indexes.length,
      next: "Use an observed unique label or explicit {from,to}; omitted content is unread."});
    for (const i of indexes) {
      const label = lines[i].slice(0, 160);
      const row = {line: i + 1, label, label_omitted_chars: lines[i].length - label.length};
      result.matches.push(row);
      result.matches_omitted--;
      if (bytes(result) > limit) {result.matches.pop(); result.matches_omitted++; break;}
    }
    return result;
  };
  let from = request.from, to = request.to;
  if (request.find !== undefined) {
    if (typeof request.find !== "string" || !request.find || from !== undefined || to !== undefined)
      return error("INVALID_ARGUMENT");
    const matches = lines.flatMap((line, i) => line.includes(request.find) ? [i] : []);
    if (matches.length !== 1) return navigate(matches.length ? "AMBIGUOUS" : "NOT_FOUND", matches);
    const before = request.before ?? 3, after = request.after ?? 12;
    if (![before, after].every(n => Number.isInteger(n) && n >= 0)) return error("INVALID_ARGUMENT");
    from = Math.max(1, matches[0] + 1 - before);
    to = Math.min(lines.length, matches[0] + 1 + after);
  }
  if (from === undefined && to === undefined) {
    const landmarks = lines.flatMap((line, i) => /^\s*- (?:heading|dialog|alert|alertdialog|main|region|navigation)\b/.test(line) ? [i] : []);
    return navigate("LOCATORS", landmarks.length ? landmarks : lines.map((_, i) => i));
  }
  if (![from, to].every(Number.isInteger) || from < 1 || to < from || to > lines.length)
    return error("INVALID_RANGE", base);
  const result = {status: "REGION", complete: true, purpose: "navigation_only", ...base,
    from, to, before_unread_lines: from - 1, after_unread_lines: lines.length - to,
    text: lines.slice(from - 1, to).join("\n")};
  if (bytes(result) > limit) return error("TOO_LARGE", {...base, from, to,
    next: "Select fewer lines on this snapshot or a supported scoped locator for a long line."});
  return result;
}

async function workflowObserve(tab, request = {}) {
  workflowInvalidate();
  if (!tab || typeof tab.playwright?.domSnapshot !== "function")
    return {status: "UNSUPPORTED", complete: false, next: "Use this host's documented scoped observation API."};
  try {
    const text = await tab.playwright.domSnapshot();
    if (typeof text !== "string") throw new Error("unsupported snapshot result");
    workflowSnapshot = text;
    workflowSnapshotTab = tab;
    workflowSnapshotSerial++;
    return workflowRegion(text, request);
  } catch (_) {
    workflowInvalidate();
    return {status: "UNAVAILABLE", complete: false, next: "Recover the tab using host documentation, then observe again."};
  }
}

function workflowRead(tab, request = {}) {
  if (tab !== workflowSnapshotTab || typeof workflowSnapshot !== "string")
    return {status: "STALE", complete: false, next: "Take a fresh workflowObserve after setup or page/tab change."};
  return workflowRegion(workflowSnapshot, request);
}

if (typeof module !== "undefined") module.exports = {workflowRegion, workflowObserve, workflowRead, workflowInvalidate};
