import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'smol-toml';
import { fail, hash, exists, atomicWrite } from './files.mjs';

export function parseConfig(text) {
  try { return parse(text); } catch { fail(422, 'INVALID_CONFIG', 'Codex config.toml 无法解析，已保留原文件。'); }
}
export async function readConfig(file) {
  let text = '';
  try { text = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return { text, data: parseConfig(text), fingerprint: hash(text) };
}
function setEnabledBlock(block, enabled) {
  const matches = [...block.matchAll(/^([ \t]*enabled[ \t]*=[ \t]*)(true|false)([ \t]*(?:#.*)?\r?)$/gm)];
  if (matches.length > 1) fail(422, 'CONFIG_SYNTAX', '配置包含重复 enabled 字段，不能安全修改。');
  if (matches.length === 1) return block.replace(/^([ \t]*enabled[ \t]*=[ \t]*)(true|false)([ \t]*(?:#.*)?\r?)$/gm, `$1${enabled}$3`);
  if (/^\s*enabled\s*=/m.test(block)) fail(422, 'CONFIG_SYNTAX', 'enabled 字段不是支持的布尔值语法。');
  const newline = block.includes('\r\n') ? '\r\n' : '\n';
  const first = block.indexOf('\n');
  if (first < 0) return `${block}${newline}enabled = ${enabled}${newline}`;
  return `${block.slice(0, first + 1)}enabled = ${enabled}${newline}${block.slice(first + 1)}`;
}
function sections(text) {
  const headers = [...text.matchAll(/^[ \t]*(\[\[?[^\r\n]+\]\]?)[ \t]*(?:#.*)?\r?$/gm)];
  return headers.map((match, i) => ({ start: match.index, end: headers[i + 1]?.index ?? text.length, header: match[1].trim(), text: text.slice(match.index, headers[i + 1]?.index ?? text.length) }));
}
export function patchToggle(text, type, selector, enabled) {
  const data = parseConfig(text); let result;
  if (text.includes('"""') || text.includes("'''")) fail(422, 'CONFIG_SYNTAX', '配置包含多行字符串；初版不能保证最小补丁安全，请用 Codex 官方设置入口。');
  if (type === 'skill') {
    const entries = data.skills?.config ?? [];
    if (!Array.isArray(entries)) fail(422, 'CONFIG_SYNTAX', 'skills.config 不是数组，不能安全修改。');
    const matching = entries.filter(item => item.path === selector);
    if (matching.length > 1) fail(422, 'CONFIG_SYNTAX', '同一路径存在多个 skills.config 条目，请先整理配置。');
    const blocks = sections(text).filter(section => /^\[\[\s*skills\s*\.\s*config\s*\]\]$/.test(section.header));
    const block = blocks.find(section => { try { return parseConfig(section.text).skills?.config?.[0]?.path === selector; } catch { return false; } });
    if (matching.length && !block) fail(422, 'CONFIG_SYNTAX', '现有 skills.config 使用内联或不支持的写法，不能安全修改。');
    if (block) result = text.slice(0, block.start) + setEnabledBlock(block.text, enabled) + text.slice(block.end);
    else {
      if ('config' in (data.skills ?? {}) && blocks.length !== entries.length) fail(422, 'CONFIG_SYNTAX', 'skills.config 使用不支持的内联写法，不能安全追加。');
      result = `${text}${text.endsWith('\n') || !text ? '' : '\n'}\n[[skills.config]]\npath = ${JSON.stringify(selector)}\nenabled = ${enabled}\n`;
    }
  } else {
    const existing = data.plugins?.[selector];
    const block = sections(text).find(section => {
      if (section.header.startsWith('[[')) return false;
      try { const value = parseConfig(`${section.header}\n`).plugins?.[selector]; return value && Object.keys(value).length === 0; } catch { return false; }
    });
    if (existing !== undefined && !block) fail(422, 'CONFIG_SYNTAX', '插件配置使用内联或不支持的写法，不能安全修改。');
    if (block) result = text.slice(0, block.start) + setEnabledBlock(block.text, enabled) + text.slice(block.end);
    else result = `${text}${text.endsWith('\n') || !text ? '' : '\n'}\n[plugins.${JSON.stringify(selector)}]\nenabled = ${enabled}\n`;
  }
  const verified = parseConfig(result);
  const actual = type === 'skill' ? verified.skills?.config?.find(item => item.path === selector)?.enabled : verified.plugins?.[selector]?.enabled;
  if (actual !== enabled) fail(422, 'CONFIG_SYNTAX', '配置修改未通过语义校验，已保留原文件。');
  // A minimal edit must not alter any unrelated parsed field.
  const before = structuredClone(data); const after = structuredClone(verified);
  if (type === 'skill') {
    const prior = before.skills?.config?.find(item => item.path === selector);
    if (prior) { delete prior.enabled; delete after.skills.config.find(item => item.path === selector).enabled; }
    else { after.skills.config = after.skills.config.filter(item => item.path !== selector); if (!before.skills?.config) delete after.skills.config; }
    if (before.skills && !Object.keys(before.skills).length) delete before.skills; if (after.skills && !Object.keys(after.skills).length) delete after.skills;
  } else {
    const prior = before.plugins?.[selector];
    if (prior) { delete prior.enabled; delete after.plugins[selector].enabled; } else delete after.plugins[selector];
    if (before.plugins && !Object.keys(before.plugins).length) delete before.plugins; if (after.plugins && !Object.keys(after.plugins).length) delete after.plugins;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) fail(422, 'CONFIG_SYNTAX', '检测到无关配置可能改变，已停止。');
  return result;
}

export async function toggleConfig(file, type, selector, enabled, backupDir, options = {}) {
  return writeConfigPatch(file, text => patchToggle(text, type, selector, enabled), backupDir, options);
}

export async function toggleSkillConfigs(file, values, backupDir) {
  return writeConfigPatch(file, text => values.reduce((current, { path, enabled }) => {
    const configured = parseConfig(current).skills?.config?.find(item => item.path === path)?.enabled;
    return configured === enabled ? current : patchToggle(current, 'skill', path, enabled);
  }, text), backupDir);
}

async function writeConfigPatch(file, patch, backupDir, options = {}) {
  if (await exists(file) && (await fs.lstat(file)).isSymbolicLink()) fail(403, 'CONFIG_LINK', '配置文件是链接，初版不直接改写。');
  const original = await readConfig(file); const next = patch(original.text);
  if (next === original.text) return { undo: async () => {} };
  const wasPresent = await exists(file); const mode = wasPresent ? (await fs.stat(file)).mode & 0o777 : 0o600;
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDir, `${Date.now()}-${crypto.randomUUID()}.toml`);
  await atomicWrite(backup, original.text, 0o600);
  if (options.beforeCommit) await options.beforeCommit();
  if ((await readConfig(file)).fingerprint !== original.fingerprint) fail(409, 'CONFIG_CHANGED', '配置已被其他程序修改，请刷新后重试。');
  await atomicWrite(file, next, mode);
  if ((await readConfig(file)).text !== next) fail(409, 'CONFIG_CHANGED', '写入后配置发生变化，请刷新确认。');
  return { backup, undo: async () => { if ((await readConfig(file)).text !== next) fail(409, 'CONFIG_CHANGED', '回滚前配置发生变化，备份已保留。'); if (wasPresent) await atomicWrite(file, original.text, mode); else await fs.rm(file, { force: true }); } };
}
