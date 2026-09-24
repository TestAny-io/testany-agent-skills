import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {pluginVersion} from '../assets/app/src/version.mjs';
import {requireSupportedCodexVersion} from '../assets/app/src/shared-connection.mjs';

export const marketplace = 'testany-agent-skills';
export const repository = 'https://github.com/TestAny-io/testany-agent-skills.git';
const selector = 'teamdesk@' + marketplace;
const sourcePlugin = fileURLToPath(new URL('../../../',import.meta.url));
const command = (file, args, options = {}) => execFileSync(file, args, {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:120000, maxBuffer:8*1024*1024, ...options});
const json = (text, what) => {try {return JSON.parse(text);} catch {throw Error(what + '未返回有效 JSON；请重跑安装，若仍失败请报告该阶段。');}};
const isFile = file => {try {return fs.statSync(file).isFile();} catch {return false;}};
const inside = (root, file) => {const rel=path.relative(root,file);return rel!=='' && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel);};

export function parseArguments(args) {
  const options={open:true};
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--check') options.check=true;
    else if(arg==='--no-open') options.open=false;
    else if(['--source','--destination'].includes(arg)) {
      const value=args[++i];if(!value||value.startsWith('--'))throw Error(arg+' 缺少路径。');
      options[arg.slice(2)]=path.resolve(value);
    } else throw Error('未知参数：'+arg);
  }
  return options;
}

export function inspectDependencies({run=command, env=process.env, platform=process.platform, node=process.execPath}={}) {
  if(platform!=='darwin')throw Error('TeamDesk 一键启动目前仅支持 macOS。');
  const macVersion=run('/usr/bin/sw_vers',['-productVersion']).trim();
  if(!/^\d+\.\d+(?:\.\d+)?$/.test(macVersion)||Number(macVersion.split('.')[0])<13)throw Error('需要 macOS 13 或更高版本。');
  const codexApp=env.TEAMDESK_CODEX_APP;
  if(!codexApp||!path.isAbsolute(codexApp))throw Error('未找到 Codex Desktop；请先安装并正常打开一次，再运行 install-teamdesk.sh。');
  try {
    const bundle=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(codexApp,'Contents/Info.plist')]).trim();
    if(bundle!=='com.openai.codex')throw Error('wrong bundle');
  } catch {throw Error('指定的应用不是可用的 Codex Desktop。请检查 TEAMDESK_CODEX_APP 或重新安装 Codex。');}
  const cli=path.join(codexApp,'Contents/Resources/codex');
  let codexVersion;
  try {codexVersion=run(cli,['--version']).trim();} catch {throw Error('Codex Desktop 缺少可运行的内置 CLI，请更新或修复 Codex。');}
  requireSupportedCodexVersion(codexVersion);
  try {
    for(const args of [['plugin','add','--help'],['plugin','marketplace','add','--help'],['plugin','list','--help']])run(cli,args);
  } catch {throw Error('当前 Codex CLI 不支持所需插件安装命令，请更新 Codex Desktop。');}
  try {
    run(node,['--input-type=module','-e','import {DatabaseSync} from "node:sqlite"; const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13))process.exit(1);']);
  } catch {throw Error('需要 Node.js ≥22.13 且支持 node:sqlite；请设置 TEAMDESK_NODE 或安装 Node LTS。');}
  try {
    run('/usr/bin/xcrun',['--find','swiftc']);
    run('/usr/bin/xcrun',['--show-sdk-path']);
    run('/usr/bin/git',['--version']);
  } catch {throw Error('缺少 Xcode Command Line Tools。请在终端执行 xcode-select --install，完成系统安装后重跑本安装命令。');}
  for(const tool of ['/usr/bin/codesign','/usr/bin/iconutil','/usr/bin/sips','/usr/bin/plutil']) {
    try {fs.accessSync(tool,fs.constants.X_OK);}catch{throw Error('缺少 macOS 系统工具：'+tool+'。请修复系统安装。');}
  }
  const safari=run('/usr/bin/osascript',['-l','JavaScript','-e','ObjC.import("AppKit"); var app=$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier("com.apple.Safari"); if(!app.isNil()) ObjC.unwrap(app.path);']).trim();
  if(!safari)throw Error('未找到 Safari，请检查系统 Safari 安装。');
  return {cli,codexApp,codexVersion,node,macVersion,safari};
}

export function verifyInstallation(result, codexHome, version) {
  if(result.pluginId!==selector||result.name!=='teamdesk'||result.marketplaceName!==marketplace||result.version!==version)throw Error('原生安装回执的插件或版本不一致。请重新下载最新安装程序后重试。');
  const cache=fs.realpathSync(path.join(codexHome,'plugins/cache'));
  if(typeof result.installedPath!=='string'||!path.isAbsolute(result.installedPath))throw Error('原生安装回执缺少绝对安装路径。');
  const installed=fs.realpathSync(result.installedPath);
  const expected=path.join(cache,marketplace,'teamdesk',version);
  if(installed!==expected)throw Error('原生返回的插件目录不在预期缓存位置，未执行启动器构建。');
  const required=['.codex-plugin/plugin.json','skills/team-workspace/SKILL.md','hooks/hooks.json','skills/team-workspace/scripts/install-launcher.mjs','skills/team-workspace/scripts/one-click.mjs'];
  for(const name of required) {
    const file=path.join(installed,name);
    if(!isFile(file)||!inside(installed,fs.realpathSync(file)))throw Error('安装副本缺少文件或包含越界链接：'+name);
  }
  const manifest=json(fs.readFileSync(path.join(installed,required[0]),'utf8'),'插件 manifest ');
  if(manifest.name!=='teamdesk'||manifest.version!==version)throw Error('安装副本的 manifest 与原生回执不一致。');
  return installed;
}

export function verifyPluginCopy(source, installed) {
  const files=root=>{
    const found={};
    const visit=directory=>{
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        if(entry.name==='.DS_Store'||entry.name==='.git')continue;
        const file=path.join(directory,entry.name);
        if(entry.isSymbolicLink())throw Error('TeamDesk 安装副本或来源包含意外链接：'+path.relative(root,file));
        if(entry.isDirectory())visit(file);
        else if(entry.isFile())found[path.relative(root,file)]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      }
    };
    visit(root);return found;
  };
  const expected=files(source),actual=files(installed);
  const mismatch=[...new Set([...Object.keys(expected),...Object.keys(actual)])].find(name=>expected[name]!==actual[name]);
  if(mismatch)throw Error('原生安装内容与本次下载/本地源码不一致：'+mismatch+'。可能来源已更新或缓存不完整，请重新下载并重跑安装。');
  return Object.keys(expected).length;
}

function checkSource(source, configured) {
  if(source) {
    const manifest=json(fs.readFileSync(path.join(source,'.claude-plugin/marketplace.json'),'utf8'),'本地 marketplace ');
    if(manifest.name!==marketplace||!manifest.plugins?.some(p=>p.name==='teamdesk'))throw Error('本地仓库缺少 TeamDesk marketplace 条目。');
  }
  if(!configured)return;
  const details=configured.marketplaceSource;
  const match=source
    ? details?.sourceType==='local' && fs.realpathSync(details.source)===fs.realpathSync(source)
    : details?.sourceType==='git' && [repository,repository.replace(/\.git$/,'')].includes(details.source) && (!details.ref||details.ref==='main');
  if(!match)throw Error('已有 testany-agent-skills marketplace 使用其他来源，未修改它。请从原 clone 更新并运行安装脚本，或先在 Codex 中明确更换该 marketplace 来源。');
}

function acquireLock(codexHome) {
  fs.mkdirSync(codexHome,{recursive:true,mode:0o700});
  const file=path.join(codexHome,'.teamdesk-install.lock');
  for(let attempt=0;attempt<2;attempt++) {
    try {fs.writeFileSync(file,String(process.pid),{flag:'wx',mode:0o600});return()=>{try{if(fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file);}catch{}};}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const pid=Number(fs.readFileSync(file,'utf8'));
      if(!Number.isInteger(pid)||pid<2)throw Error('安装锁不完整，请确认没有安装正在运行后删除 '+file+' 并重试。');
      try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){fs.unlinkSync(file);continue;}throw e;}
      throw Error('另一个 TeamDesk 安装正在运行，请等待它完成。');
    }
  }
  throw Error('无法取得 TeamDesk 安装锁，请稍后重试。');
}

export async function install(options={}, dependencies={}) {
  const {run=command, inspect=inspectDependencies, version=pluginVersion, env=process.env, sourceRoot=sourcePlugin,
    build=async(installed,settings)=>(await import(pathToFileURL(path.join(installed,'skills/team-workspace/scripts/install-launcher.mjs')).href)).installLauncher(settings),
    progress=message=>console.log(message)}=dependencies;
  const codexHome=path.resolve(env.CODEX_HOME||path.join(os.homedir(),'.codex'));
  const result={version,state:'running',steps:[],startedAt:new Date().toISOString()};
  let release;
  const record=()=>{
    const file=path.join(codexHome,'teamdesk-install-result.json'),temp=file+'.'+process.pid;
    fs.writeFileSync(temp,JSON.stringify(result,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);
  };
  const step=async(name,work)=>{
    progress(name);const row={name,state:'running'};result.steps.push(row);
    try{const value=await work();row.state='verified';return value;}catch(error){row.state='failed';throw error;}
  };
  try {
    const runtime=await step('[1/4] 检查本机依赖',()=>inspect({run,env}));
    result.runtime=runtime;
    if(options.check){result.state='checked';progress('依赖检查通过；尚未安装插件或创建图标。');return result;}
    release=acquireLock(codexHome);
    const cli=args=>json(run(runtime.cli,args,{env:{...env,CODEX_HOME:codexHome}}),'Codex ');
    const installed=await step('[2/4] 安装并核验 Codex 插件',()=>{
      const previous=cli(['plugin','list','--json']).installed||[];
      const other=previous.filter(p=>p.name==='teamdesk'&&p.pluginId!==selector);
      if(other.length)throw Error('已从其他 marketplace 安装 TeamDesk（'+other.map(p=>p.pluginId).join(', ')+'）。请先在 Codex 中明确保留的来源；安装器不会删除或重复安装。');
      const current=previous.find(p=>p.pluginId===selector);
      if(current?.enabled===false)throw Error('TeamDesk 已被停用，请先在 Codex 中明确启用，再重跑安装。');
      if(current?.version) {
        const a=current.version.split(/[.+-]/).slice(0,3).map(Number),b=version.split('.').map(Number);
        for(let i=0;i<3;i++){if(a[i]>b[i])throw Error('已安装较新 TeamDesk，未执行降级。请重新下载最新安装程序。');if(a[i]<b[i])break;}
      }
      const configured=(cli(['plugin','marketplace','list','--json']).marketplaces||[]).find(m=>m.name===marketplace);
      checkSource(options.source,configured);
      if(!configured) {
        const args=['plugin','marketplace','add',options.source||repository,...(options.source?[]:['--ref','main']),'--json'];
        const added=cli(args);
        if(added.marketplaceName!==marketplace)throw Error('原生 marketplace 注册回执不一致。');
      } else if(!options.source) {
        const updated=cli(['plugin','marketplace','upgrade',marketplace,'--json']);
        if(!Array.isArray(updated.errors)||updated.errors.length)throw Error('GitHub marketplace 更新未核验成功，请检查网络后重试。');
      }
      const receipt=cli(['plugin','add',selector,'--json']);
      const root=verifyInstallation(receipt,codexHome,version);
      result.verifiedFiles=verifyPluginCopy(sourceRoot,root);
      const saved=(cli(['plugin','list','-m',marketplace,'--json']).installed||[]).find(p=>p.pluginId===selector);
      if(saved?.version!==version||saved.installed!==true||saved.enabled!==true)throw Error('插件文件已安装，但原生启用状态未核验通过。请在 Codex 插件设置中检查 TeamDesk，再重跑安装。');
      result.installedPath=root;record();return root;
    });
    const icon=await step('[3/4] 创建 TeamDesk 启动图标',()=>build(installed,{
      ...(options.destination?{destination:options.destination,desktopLink:false}:{}),
      runtimeConfig:{node:runtime.node,codexHome}
    }));
    await step('[4/4] 核验启动图标',()=>{
      if(icon.installed!==true||icon.version!==version||!path.isAbsolute(icon.app||''))throw Error('图标构建回执不一致。');
      run('/usr/bin/codesign',['--verify','--deep','--strict',icon.app]);
      const info=path.join(icon.app,'Contents/Info.plist');
      if(run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',info]).trim()!=='io.testany.teamdesk.launcher'||run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',info]).trim()!==version)throw Error('图标版本或应用标识核验失败。');
      result.icon=icon;result.state='installed';record();
    });
    progress('TeamDesk '+version+' 安装完成：'+icon.app);
    progress('首次连接仍需在团队设置中审查并信任 hook；安装成功不代表连接或记账已验证。');
    if(options.open!==false) {
      try {run('/usr/bin/open',[icon.app]);result.openRequested=true;}
      catch {result.openRequested=false;progress('安装已完成，自动打开失败；请手动双击上述 TeamDesk.app。');}
    }
    record();return result;
  } catch(error) {
    result.state='failed';result.error=error.message;
    if(release)record();
    throw Error('TeamDesk 安装未完成：'+error.message+'\n完成步骤：'+(result.steps.filter(s=>s.state==='verified').map(s=>s.name).join(' → ')||'无')+'\n修复后可重跑同一安装命令；已有业务数据不会被删除。',{cause:error});
  } finally {release?.();}
}

if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await install(parseArguments(process.argv.slice(2)));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
