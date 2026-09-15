import { fail } from './files.mjs';

/** Interpret only GitHub directory links; other Git transports keep their existing semantics. */
export function githubDirectory(source) {
  if (typeof source !== 'string' || source.length > 2000) return null;
  let url;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol === 'ssh:') return null;
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search)
    fail(400, 'INVALID_GITHUB_URL', 'GitHub 来源请使用不含凭证或查询参数的 HTTPS 仓库或目录链接。');
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { fail(400, 'INVALID_GITHUB_URL', 'GitHub 链接包含无效的路径编码。'); }
  const [owner, repository, kind, ...tail] = parts;
  if (!owner || !repository || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository))
    fail(400, 'INVALID_GITHUB_URL', '请粘贴完整的 GitHub 仓库或技能目录链接。');
  if (!kind) return null;
  if (kind !== 'tree' || !tail.length)
    fail(400, 'INVALID_GITHUB_URL', '请粘贴 GitHub 技能目录的 tree 链接，而不是文件、提交或 Pull Request 页面。');
  const decoded = tail.join('/');
  if (decoded.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(decoded))
    fail(400, 'INVALID_GITHUB_URL', 'GitHub 目录链接包含无效路径。');
  return { source: `https://github.com/${owner}/${repository.replace(/\.git$/, '')}.git`, tail: decoded };
}

export function resolveGithubDirectory(location, explicitRef, refs) {
  const named = refs.flatMap(ref => {
    if (ref.startsWith('refs/remotes/origin/') && !ref.endsWith('/HEAD')) return [ref.slice(20)];
    if (ref.startsWith('refs/tags/')) return [ref.slice(10)];
    return [];
  });
  const prefix = ref => location.tail === ref || location.tail.startsWith(`${ref}/`);
  const candidates = [...new Set(named)].filter(prefix).sort((a, b) => b.length - a.length);
  const first = location.tail.split('/')[0];
  if (/^[a-f0-9]{7,40}$/i.test(first) || first === 'HEAD') candidates.push(first);
  // A matching explicit ref also disambiguates URLs whose branch names share a prefix.
  const urlRef = explicitRef && candidates.includes(explicitRef) ? explicitRef : candidates[0];
  if (!urlRef) fail(422, 'GITHUB_REF_NOT_FOUND', '未找到链接中的分支、标签或 commit。请核对目录链接；也可使用仓库地址和高级子目录选项。');
  return { ref: explicitRef || urlRef, subpath: location.tail.slice(urlRef.length).replace(/^\//, '') || '.' };
}
