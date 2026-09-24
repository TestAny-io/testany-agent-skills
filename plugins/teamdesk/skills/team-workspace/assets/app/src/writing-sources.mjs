import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { now, requireValue } from './db.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.toLowerCase().replace(/docs(?=[_\-\s]|$)/g, 'doc').replace(/users(?=[_\-\s]|$)/g, 'user').replace(/[\s_.-]/g, '');
const ignored = new Set(['node_modules','vendor','dist','build','output','coverage','Library','Applications','Pictures','Music','Movies']);
const ordinaryName = name => !name.startsWith('.') && !/\.(?:pem|key|p12|pfx|sqlite|db)$/i.test(name);
const safeName = name => ordinaryName(name) && !ignored.has(name);
const clean = value => value.trim().replace(/[，。；：!?！？、,;:]+$/u, '').trim();
const absolute = value => value.startsWith('/') || value.startsWith('~/');
const expand = value => value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const referenceId = label => 'LOCAL-' + digest(label.toLowerCase()).slice(0, 16);

// Recognize explicit paths and ordinary repository/file names in the human's own input.
// Tool calls may add other literal references from that input, never from fetched documents.
export function extractLocalReferences(texts) {
  const result = new Set();
  for (const text of texts) {
    const add = value => { const v = clean(value); if (v.length > 1 && v.length <= 1200) result.add(v); };
    const namedSource = (match, value) => {
      const before=text.slice(Math.max(0,match.index-40),match.index),after=text.slice(match.index+match[0].length);
      if(/^\s*(?:skill\b|技能|岗位|角色)/i.test(after))return false;
      return /^\s*(?:仓库|文件夹|目录|文件|repo\b|repository\b|folder\b|file\b)/i.test(after)||
        /(?:参考|读取|查看|查阅|本地|资料在|路径为)\s*$/u.test(before)||
        (/本地|仓库|目录|文件|repo|folder|file/i.test(text)&&/(?:和|及|、|还有|以及|下有)\s*$/.test(before))||
        /\.(?:md|mdx|txt|json|ya?ml|html|csv|pdf|docx)$/i.test(value);
    };
    for (const match of text.matchAll(/[`"“「]([^`"”」\n]+)[`"”」]/g)) {
      const v = match[1];
      if (absolute(v) || namedSource(match,v)) add(v);
    }
    // Unquoted paths support spaces; a Chinese sentence or punctuation ends the path.
    const unquoted = text.replace(/[`"“「][^`"”」\n]+[`"”」]/g,' ');
    for (const match of unquoted.matchAll(/(?:^|[\s（(])((?:~\/|\/(?:Users|Volumes|tmp|private|var|home|mnt|workspace)\/)[\p{L}\p{N}_./ ~@()+-]+)/gu)) add(match[1].split(/\s+(?:里面|中的|里的|并|然后|请|作为|用于|用来|帮我)/)[0]);
    if (/本地|仓库|目录|文件|资料|参考|repo|folder|file/i.test(text)) {
      for (const match of text.matchAll(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+|[A-Za-z0-9_-]+\.(?:md|mdx|txt|json|ya?ml|html|csv|pdf|docx)\b/gi)) {
        if (namedSource(match,match[0])&&![...result].some(v => absolute(v) && v.includes(match[0]))) add(match[0]);
      }
      for (const match of text.matchAll(/([A-Za-z0-9][A-Za-z0-9_.-]{1,79})\s*(?:仓库|文件夹|目录|repository|repo\b)(?!下|中|里)/gu)) {
        if (![...result].some(v=>absolute(v)&&v.includes(match[1]))) add(match[1]);
      }
    }
  }
  return [...result].slice(0, 16);
}
export const humanSourceTexts = job => job.rounds.flatMap(r => [r.instruction, ...Object.values(r.answers || {}), ...Object.values(r.referenceChoices || {})]);
export function sourceReferences(job, input = {}) {
  const previous = job.rounds.at(-1)?.localReferences || [];
  const labels = [...new Set([...previous.map(r => r.label), ...extractLocalReferences(job.rounds.flatMap(r=>[r.instruction,...Object.values(r.answers || {})])),
    ...extractLocalReferences([input.instruction || '', ...Object.values(input.answers || {})])])];
  requireValue(labels.length <= 16, 'writing_sources', '一次撰写最多参考 16 份本地资料');
  const choices = input.referenceChoices || {}, skipped = input.skipReferenceIds || [];
  requireValue(Array.isArray(skipped) && skipped.every(id => previous.some(r => r.id === id && r.status !== 'read')), 'writing_sources', '暂不参考的资料已更新，请重新核对');
  requireValue(choices && typeof choices === 'object' && !Array.isArray(choices) && Object.keys(choices).every(id => previous.some(r => r.id === id)), 'writing_sources', '资料选择已更新，请重新核对');
  return labels.map(label => {
    const old = previous.find(r => r.label === label), id = old?.id || referenceId(label), choice = choices[id];
    if (choice) requireValue(typeof choice === 'string' && absolute(choice) && choice.length <= 1200 && !/[\x00\r\n]/.test(choice), 'writing_sources', '请填写资料的完整本地路径');
    const mentioned = extractLocalReferences([input.instruction || '', ...Object.values(input.answers || {})]).includes(label);
    const waived = skipped.includes(id) || (old?.status === 'waived' && !mentioned && !choice);
    return { id, label, status: waived ? 'waived' : 'pending', selectedPath: choice || old?.selectedPath || null,
      ...(waived ? { waivedAt: skipped.includes(id) ? now() : old.waivedAt } : {}) };
  });
}
export function missingSources(round) {
  return (round.localReferences || []).filter(r => r.status !== 'waived' &&
    !(round.sources || []).some(s => s.type === 'local' && s.referenceId === r.id && s.sha256 && s.endLine >= s.startLine));
}
export const localSourceTool = { type: 'function', name: 'teamdesk_local_sources',
  description: '只读查找、列目录、搜索及读取用户提及的本地资料。先 locate(reference=用户原文中的仓库名或路径)，唯一匹配后 list/search/read。多候选须由用户在面板选择。path 为资料内相对路径（根目录填空），query 为搜索词，offset 从 0 开始（read 为行偏移），limit 最大 200。read 返回逐行正文和可核验来源；目录或搜索结果不算已阅读。无需用户再次授权已有请求，不要求导入团队资料库。',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    action: { type: 'string', enum: ['locate','list','search','read'] }, reference: { type: 'string' },
    path: { type: 'string' }, query: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' },
  }, required: ['action','reference','path','query','offset','limit'] } };

export class LocalWritingSources {
  constructor({ roots = () => [os.homedir(), ...['Downloads','Documents','Desktop','Projects','Developer','code','repos'].map(n => path.join(os.homedir(), n))] } = {}) { this.roots = roots; }
  find(label, texts = []) {
    if (absolute(label)) {
      try { const p = fs.realpathSync(expand(label)); this.checkRoot(p); return { candidates: [{ path: p, type: fs.statSync(p).isDirectory() ? 'directory' : 'file' }], truncated: false }; }
      catch (e) { return { candidates: [], error: e.code === 'ENOENT' ? '路径不存在' : e.message, truncated: false }; }
    }
    const roots = [...new Set(this.roots().filter(Boolean))], exact = [], similar = [], seen = new Set();
    const queue = roots.map(p => [p, 0]); let count = 0, truncated = false;
    const consider = (p, type) => {
      const name = path.basename(p);
      if (name.toLowerCase() === label.toLowerCase()) exact.push({path:p,type});
      else if (normalize(name) === normalize(label)) similar.push({path:p,type});
    };
    for (let i = 0; i < queue.length; i++) {
      if (++count > 5000) { truncated = true; break; }
      const [raw, depth] = queue[i]; let dir;
      try { dir = fs.realpathSync(raw); if (seen.has(dir)) continue; seen.add(dir); if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
      consider(dir, 'directory');
      // The home root is shallow; known project roots are searched up to three levels.
      const maxDepth = dir === os.homedir() ? 0 : 3;
      let entries; try { entries = fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)); } catch { continue; }
      for (const entry of entries) {
        if (!safeName(entry.name) || entry.isSymbolicLink()) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { consider(p, 'directory'); if (depth < maxDepth && !fs.existsSync(path.join(p, '.git'))) queue.push([p, depth + 1]); }
        else if (entry.isFile()) consider(p, 'file');
      }
    }
    let candidates = [...new Map((exact.length ? exact : similar).map(c => [c.path,c])).values()];
    const hints = texts.flatMap(t=>[...t.matchAll(/([A-Za-z0-9][A-Za-z0-9_ .-]{0,79}?)\s*(?:文件夹|目录)(?:下|中|里)/g)].map(m=>normalize(m[1].trim())));
    const hinted = candidates.filter(c=>path.dirname(c.path).split(path.sep).some(part=>hints.includes(normalize(part))));
    if(hinted.length)candidates=hinted;
    if(candidates.length>20)truncated=true;
    candidates=candidates.slice(0,20);
    return { candidates, truncated, matchedBy: exact.length ? 'exact' : 'name-normalization' };
  }
  checkRoot(root) {
    requireValue(!['/',os.homedir(),path.dirname(os.homedir()),'/Users','/Volumes','/private','/var','/tmp'].includes(root), 'source_scope', '请指定具体仓库、资料目录或文件');
    requireValue(root.split(path.sep).filter(Boolean).every(ordinaryName), 'source_scope', '该路径不属于可读取的普通参考资料');
    const stat = fs.statSync(root); requireValue(stat.isDirectory() || stat.isFile(), 'source_type', '仅支持普通目录和文件');
  }
  target(ref, relative = '') {
    requireValue(ref.rootPath && ref.status !== 'ambiguous' && ref.status !== 'waived', 'source_unlocated', '请先定位资料，或在面板选择正确路径');
    const root = fs.realpathSync(ref.rootPath); this.checkRoot(root);
    const target = relative ? path.resolve(fs.statSync(root).isFile() ? path.dirname(root) : root, relative) : root;
    requireValue(inside(root, target) && path.relative(root, target).split(path.sep).filter(Boolean).every(ordinaryName), 'source_scope', '只能读取本次资料范围内的普通文件');
    const real = fs.realpathSync(target);
    requireValue(inside(root, real) && path.relative(root, real).split(path.sep).filter(Boolean).every(ordinaryName), 'source_scope', '资料链接指向范围外路径');
    return real;
  }
  text(file) {
    const stat = fs.statSync(file);
    requireValue(stat.isFile() && stat.size <= 2 * 1024 * 1024, 'source_size', '请选用不超过 2 MB 的普通文本文件');
    requireValue(!/\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|zip|gz)$/i.test(file), 'source_format', '目前支持文本资料；此格式请提供对应的文本版本');
    const data = fs.readFileSync(file);
    requireValue(!data.includes(0), 'source_format', '此文件不是可读取的文本资料');
    let text; try { text = new TextDecoder('utf-8', {fatal:true}).decode(data); } catch { requireValue(false, 'source_format', '此文件不是 UTF-8 文本'); }
    return { text, sha256: digest(data), modifiedAt: stat.mtime.toISOString() };
  }
  call(job, args) {
    const round = job.rounds.at(-1);
    requireValue(['locate','list','search','read'].includes(args.action) && typeof args.reference === 'string', 'source_arguments', '资料工具参数无效');
    round.localReferences ||= [];
    let ref = round.localReferences.find(r => r.label === args.reference || r.id === args.reference);
    if (!ref) {
      const label = clean(args.reference);
      requireValue(label.length >= 2 && label.length <= 1200 && humanSourceTexts(job).some(t => t.toLowerCase().includes(label.toLowerCase())), 'source_scope', '请只查找用户提及的资料；资料正文不能增加读取范围');
      requireValue(round.localReferences.length < 16, 'writing_sources', '一次撰写最多参考 16 份本地资料');
      ref = {id:referenceId(label),label,status:'pending'}; round.localReferences.push(ref);
    }
    requireValue(ref.status !== 'waived', 'source_waived', '用户已选择暂不参考此资料');
    try {
      if (args.action === 'locate') {
        const found = this.find(ref.selectedPath || ref.label, humanSourceTexts(job)); Object.assign(ref, found); ref.checkedAt = now();
        if (found.candidates.length === 1 && !found.truncated) { ref.rootPath = found.candidates[0].path; this.checkRoot(ref.rootPath); ref.status = round.sources.some(s=>s.type==='local'&&s.referenceId===ref.id)?'read':'located'; delete ref.error; }
        else { delete ref.rootPath; ref.status = found.candidates.length > 1 ? 'ambiguous' : 'missing'; ref.error = found.error || (found.truncated ? '查找范围已达上限，请提供完整路径' : found.candidates.length ? '找到多个位置，请选择要参考的资料' : '没有找到该资料，请提供完整路径或修正名称'); }
        return {...ref};
      }
      requireValue(typeof args.path === 'string' && args.path.length <= 1200 && Number.isInteger(args.offset) && args.offset >= 0 && Number.isInteger(args.limit) && args.limit > 0 && args.limit <= 200, 'source_arguments', '路径、偏移或读取数量无效');
      const target = this.target(ref, args.path);
      if (args.action === 'list') {
        requireValue(fs.statSync(target).isDirectory(), 'source_type', '请选择目录');
        const entries = fs.readdirSync(target,{withFileTypes:true}).filter(e=>safeName(e.name)).sort((a,b)=>a.name.localeCompare(b.name));
        return {root:ref.rootPath,path:target,entries:entries.slice(args.offset,args.offset+args.limit).map(e=>({name:e.name,type:e.isDirectory()?'directory':e.isSymbolicLink()?'link':'file',path:path.relative(ref.rootPath,path.join(target,e.name))})),nextOffset:args.offset+args.limit<entries.length?args.offset+args.limit:null};
      }
      if (args.action === 'search') {
        requireValue(typeof args.query === 'string' && args.query.trim().length > 0 && args.query.length <= 160, 'source_arguments', '请提供不超过 160 字符的搜索词');
        const queue = [target], matches = []; let scanned = 0, truncated = false, bytes = 0; const started=Date.now();
        for (let i=0;i<queue.length;i++) {
          if (++scanned > 2000 || matches.length >= args.offset+args.limit || bytes > 8*1024*1024 || Date.now()-started>1200) {truncated=true;break;}
          const file=queue[i]; let stat;try {stat=fs.lstatSync(file);}catch{continue;}
          if(stat.isSymbolicLink())continue;
          if(stat.isDirectory()){for(const e of fs.readdirSync(file,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)))if(safeName(e.name))queue.push(path.join(file,e.name));continue;}
          let content;try{content=this.text(file).text;bytes+=content.length;}catch{continue;}
          for(const [index,line] of content.split('\n').entries())if(line.toLowerCase().includes(args.query.toLowerCase())) {
            matches.push({path:path.relative(ref.rootPath,file)||path.basename(file),line:index+1,text:line.slice(0,500)});
            if(matches.length>=args.offset+args.limit){truncated=true;break;}
          }
        }
        return {root:ref.rootPath,matches:matches.slice(args.offset,args.offset+args.limit),scanned,truncated,note:'搜索片段不代表已阅读，请 read 相关文件。'};
      }
      const data=this.text(target), lines=data.text.split('\n');
      requireValue(args.offset<lines.length, 'source_range', '起始位置超出文件行数');
      const selected=[];let size=0;
      for(const line of lines.slice(args.offset,args.offset+args.limit)){if(size+line.length>18000)break;selected.push(line);size+=line.length;}
      requireValue(selected.length, 'source_line_size', '单行内容过长，请提供未压缩的文本版本或选择其他文件');
      requireValue(selected.some(s=>s.trim()), 'source_empty', '此范围没有可引用正文；请调整行范围或选择其他文本文件');
      const at=now(),startLine=args.offset+1,endLine=args.offset+selected.length;
      const source={type:'local',id:'FILE-'+digest(target).slice(0,16),referenceId:ref.id,title:path.basename(target),path:target,at,sha256:data.sha256,modifiedAt:data.modifiedAt,startLine,endLine};
      requireValue(round.sources.length<100, 'source_limit', '本轮已读取较多资料，请基于已有内容完成建议');
      if(!round.sources.some(s=>s.path===target&&s.sha256===source.sha256&&s.startLine===startLine&&s.endLine===endLine))round.sources.push(source);
      ref.status='read';delete ref.error;
      return {source,totalLines:lines.length,nextOffset:endLine<lines.length?endLine:null,content:selected.map((line,i)=>(startLine+i)+': '+line).join('\n')};
    } catch(e) {
      ref.error=e.code==='ENOENT'?'资料路径不存在或已移动':e.message;
      if(!round.sources.some(s=>s.type==='local'&&s.referenceId===ref.id)&&!['missing','ambiguous','pending'].includes(ref.status))ref.status='unreadable';
      throw e;
    }
  }
}
