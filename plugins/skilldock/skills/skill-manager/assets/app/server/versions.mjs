// SPDX-License-Identifier: AGPL-3.0-only
export function compareVersions(left, right) {
  const parse = value => /^v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value || '');
  const a = parse(left); const b = parse(right); if (!a || !b) return null;
  const aa = a[1].split('.').map(Number); const bb = b[1].split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) > (bb[i] || 0) ? 1 : -1;
  if (a[2] === b[2]) return 0; if (!a[2]) return 1; if (!b[2]) return -1;
  const preA = a[2].split('.'); const preB = b[2].split('.');
  for (let i = 0; i < Math.max(preA.length, preB.length); i += 1) {
    if (preA[i] === preB[i]) continue; if (preA[i] === undefined) return -1; if (preB[i] === undefined) return 1;
    const numA = /^\d+$/.test(preA[i]); const numB = /^\d+$/.test(preB[i]);
    if (numA && numB) return Number(preA[i]) > Number(preB[i]) ? 1 : -1;
    if (numA !== numB) return numA ? -1 : 1; return preA[i] > preB[i] ? 1 : -1;
  }
  return 0;
}
