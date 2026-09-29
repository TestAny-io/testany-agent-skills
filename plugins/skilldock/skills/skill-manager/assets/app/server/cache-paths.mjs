// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe: launchers import this before installing app dependencies.
import path from 'node:path';
import { fail } from './errors.mjs';

export const safeSegment = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
export const pluginCacheRoot = codexHome => path.join(codexHome, 'plugins/cache');
export function pluginPath(codexHome, marketplace, plugin, version) {
  if (![marketplace, plugin, version].every(safeSegment)) fail(422, 'PLUGIN_IDENTITY', '无法绑定插件安装身份。');
  return path.join(pluginCacheRoot(codexHome), marketplace, plugin, version);
}
