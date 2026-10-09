// SPDX-License-Identifier: AGPL-3.0-only
// Test helper: the production translator, compiled once, for checking that service messages
// have whole English and Japanese translations.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
let bundle;
export async function translator(language) {
  bundle ??= await build({ stdin: { contents: 'export * from "./src/i18n"; export { setPreferences } from "./src/preferences";', resolveDir: app, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false });
  const module = { exports: {} }, storage = new Map();
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { dataset: {}, style: {} }, getElementById: () => null },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} } });
  module.exports.setPreferences({ language }); return module.exports.t;
}

/** Every Chinese message has a whole English translation (no Chinese left) and a Japanese one. */
export async function assertTranslated(messages) {
  const en = await translator('en'), ja = await translator('ja');
  for (const text of messages) {
    assert.equal(/[一-鿿]/.test(en(text)), false, `en: ${text}`);
    assert.notEqual(ja(text), text, `ja: ${text}`);
  }
}
