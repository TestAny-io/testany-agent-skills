import { fail, identity } from './files.mjs';

export function normalizeTags(tags) {
  if (!Array.isArray(tags) || tags.length > 12) fail(400, 'INVALID_TAGS', '每个对象最多设置 12 个标签。');
  const result = []; const seen = new Set();
  for (const value of tags) {
    if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) fail(400, 'INVALID_TAGS', '标签必须为不含控制字符的文字。');
    const tag = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (!tag || [...tag].length > 32) fail(400, 'INVALID_TAGS', '每个标签需要 1 至 32 个字符。');
    const key = tag.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(tag); }
  }
  return result;
}

export function tagKey(kind, item) {
  // Package identity and its relative component path survive versioned cache moves.
  const parts = kind === 'plugin' ? ['plugin', item.id]
    : item.scope === 'plugin' && item.pluginId && item.packagePath ? ['plugin-skill', item.pluginId, item.packagePath]
      : ['skill', item.id];
  return identity(JSON.stringify(parts));
}

export function enrichTags(snapshot, registry) {
  for (const [kind, items] of [['skill', snapshot.skills], ['plugin', snapshot.plugins]]) {
    for (const item of items) item.tags = normalizeTags(registry.tags?.[tagKey(kind, item)] || []);
  }
  return snapshot;
}
