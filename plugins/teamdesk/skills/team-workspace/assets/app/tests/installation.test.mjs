import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {install,inspectDependencies,parseArguments,verifyInstallation,verifyPluginCopy,marketplace,repository} from '../../../scripts/install.mjs';
import {pluginVersion} from '../src/version.mjs';

function fixture(t) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk install ')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const codexHome=path.join(root,'Codex profile'), installed=path.join(codexHome,'plugins/cache',marketplace,'teamdesk',pluginVersion);
  const files={'.codex-plugin/plugin.json':JSON.stringify({name:'teamdesk',version:pluginVersion}),'skills/team-workspace/SKILL.md':'skill','hooks/hooks.json':'{}','skills/team-workspace/scripts/install-launcher.mjs':'','skills/team-workspace/scripts/one-click.mjs':''};
  for(const [name,text] of Object.entries(files)){const file=path.join(installed,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  const sourceRoot=path.join(root,'source');fs.cpSync(installed,sourceRoot,{recursive:true});
  const runtime={cli:path.join(root,'Codex Desktop.app/Contents/Resources/codex'),node:process.execPath};
  const receipt={pluginId:'teamdesk@'+marketplace,name:'teamdesk',marketplaceName:marketplace,version:pluginVersion,installedPath:installed};
  const saved={...receipt,installed:true,enabled:true};
  const state={previous:[],configured:[],saved,calls:[],progress:[],builds:0,receipt};
  const run=(file,args,options)=>{
    state.calls.push({file,args,options});
    if(file===runtime.cli) {
      const key=args.join(' ');
      if(key==='plugin list --json')return JSON.stringify({installed:state.previous});
      if(key==='plugin marketplace list --json')return JSON.stringify({marketplaces:state.configured});
      if(key.startsWith('plugin marketplace add ')){state.configured=[{name:marketplace,marketplaceSource:{sourceType:'git',source:repository,ref:'main'}}];return JSON.stringify({marketplaceName:marketplace});}
      if(key.startsWith('plugin marketplace upgrade '))return JSON.stringify({errors:state.upgradeFailure?['offline']:[]});
      if(key==='plugin add teamdesk@'+marketplace+' --json'){if(state.cliFailure)throw Error('offline');state.previous=[state.saved];return JSON.stringify(state.receipt);}
      if(key==='plugin list -m '+marketplace+' --json')return JSON.stringify({installed:[state.saved]});
      throw Error('Unexpected CLI command: '+key);
    }
    if(file==='/usr/libexec/PlistBuddy')return args[1].includes('CFBundleIdentifier')?'io.testany.teamdesk.launcher':args[1].includes('LSMinimumSystemVersion')?'13.0':(state.iconVersion||pluginVersion);
    if(file==='/usr/bin/xcrun'&&args[0]==='lipo')return os.machine();
    if(file==='/usr/bin/xcrun'&&args[0]==='vtool')return 'Load command 11\n      cmd LC_BUILD_VERSION\n platform MACOS\n    minos '+(state.binaryMinimum||'13.0')+'\n      sdk 27.0\n';
    if(file==='/usr/bin/codesign'){if(state.signatureFailure)throw Error('invalid signature');return '';}
    if(file==='/usr/bin/open'){if(state.openFailure)throw Error('open failed');return '';}
    throw Error('Unexpected command: '+file);
  };
  const build=async (actual,settings)=>{
    state.builds++;state.settings=settings;assert.equal(actual,installed);
    if(state.buildFailure)throw Error('compiler failure');
    return {installed:true,version:pluginVersion,app:settings.destination||path.join(root,'Applications/TeamDesk.app')};
  };
  return {root,codexHome,installed,sourceRoot,state,receipt,dependencies:{run,build,sourceRoot,inspect:()=>runtime,env:{CODEX_HOME:codexHome},progress:m=>state.progress.push(m)}};
}

test('first install orders native install, enabled readback, icon build and signature verification',async t=>{
  const f=fixture(t);const result=await install({open:false},f.dependencies);
  assert.equal(result.state,'installed');assert.equal(f.state.builds,1);
  assert.deepEqual(result.steps.map(s=>s.state),['verified','verified','verified','verified']);
  assert.deepEqual(f.state.settings.runtimeConfig,{node:process.execPath,codexHome:f.codexHome});
  assert.ok(f.state.calls.some(c=>c.args.includes(repository)));
  assert.ok(f.state.calls.some(c=>c.args.join(' ')==='plugin list -m testany-agent-skills --json'));
  assert.ok(!f.state.calls.some(c=>c.file==='/usr/bin/open'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.codexHome,'teamdesk-install-result.json'))).state,'installed');
  assert.equal(fs.existsSync(path.join(f.codexHome,'.teamdesk-install.lock')),false);
});
test('dependency-only check makes no plugin, icon, lock, or result writes',async t=>{
  const f=fixture(t);assert.equal((await install({check:true},f.dependencies)).state,'checked');
  assert.equal(f.state.calls.length,0);assert.equal(f.state.builds,0);
  assert.equal(fs.existsSync(path.join(f.codexHome,'teamdesk-install-result.json')),false);
});
test('failed dependency checks never reach mutation',async t=>{
  const f=fixture(t);f.dependencies.inspect=()=>{throw Error('missing compiler');};
  await assert.rejects(install({},f.dependencies),/missing compiler/);assert.equal(f.state.calls.length,0);
});
test('repeat installation preserves the configured remote and refreshes only that marketplace',async t=>{
  const f=fixture(t);await install({open:false},f.dependencies);f.state.calls=[];
  await install({open:false},f.dependencies);
  assert.ok(!f.state.calls.some(c=>c.args.join(' ').startsWith('plugin marketplace add')));
  assert.equal(f.state.calls.filter(c=>c.args.join(' ')==='plugin marketplace upgrade testany-agent-skills --json').length,1);
});
test('a local clone with spaces is passed as one CLI argument and is not silently switched to remote',async t=>{
  const f=fixture(t),source=path.join(f.root,'my local checkout');fs.mkdirSync(path.join(source,'.claude-plugin'),{recursive:true});
  fs.writeFileSync(path.join(source,'.claude-plugin/marketplace.json'),JSON.stringify({name:marketplace,plugins:[{name:'teamdesk'}]}));
  await install({source,open:false,destination:path.join(f.root,'custom apps/TeamDesk.app')},f.dependencies);
  assert.ok(f.state.calls.some(c=>c.args.includes(source)));assert.equal(f.state.settings.desktopLink,false);
  f.state.configured=[{name:marketplace,marketplaceSource:{sourceType:'local',source}}];f.state.calls=[];
  await install({source,open:false},f.dependencies);
  assert.ok(!f.state.calls.some(c=>/marketplace (add|upgrade)/.test(c.args.join(' '))));
});
test('another marketplace source is preserved and a useful error is reported',async t=>{
  const f=fixture(t);f.state.configured=[{name:marketplace,marketplaceSource:{sourceType:'git',source:'https://example.invalid/other.git'}}];
  await assert.rejects(install({},f.dependencies),/其他来源/);
  assert.ok(!f.state.calls.some(c=>/plugin (add|marketplace (add|upgrade))/.test(c.args.join(' '))));
});
test('other TeamDesk installations and disabled plugins require an explicit source/enablement choice',async t=>{
  const f=fixture(t);f.state.previous=[{name:'teamdesk',pluginId:'teamdesk@personal'}];
  await assert.rejects(install({},f.dependencies),/其他 marketplace/);
  f.state.previous=[{...f.state.saved,enabled:false}];await assert.rejects(install({},f.dependencies),/已被停用/);
  assert.equal(f.state.builds,0);
});
test('older installers do not downgrade a newer installed version',async t=>{
  const f=fixture(t);f.state.previous=[{...f.state.saved,version:'1.0.0'}];
  await assert.rejects(install({},f.dependencies),/未执行降级/);assert.equal(f.state.builds,0);
});
test('native install errors are retained and a retry can finish without clearing data',async t=>{
  const f=fixture(t),data=path.join(f.codexHome,'keep-me');fs.writeFileSync(data,'unchanged');f.state.cliFailure=true;
  await assert.rejects(install({},f.dependencies),/offline/);
  assert.equal(f.state.builds,0);f.state.cliFailure=false;
  await install({open:false},f.dependencies);assert.equal(fs.readFileSync(data,'utf8'),'unchanged');
});
test('manifest, receipt and enabled state mismatches stop before executing the installed builder',async t=>{
  const f=fixture(t);f.state.receipt={...f.receipt,version:'different'};
  await assert.rejects(install({},f.dependencies),/版本不一致/);
  f.state.receipt=f.receipt;f.state.saved={...f.state.saved,enabled:false};
  await assert.rejects(install({},f.dependencies),/启用状态/);assert.equal(f.state.builds,0);
});
test('cache boundary and required-file symlink escapes are refused',t=>{
  const f=fixture(t);assert.equal(verifyInstallation(f.receipt,f.codexHome,pluginVersion),f.installed);
  const entry=path.join(f.installed,'skills/team-workspace/scripts/install-launcher.mjs');
  fs.unlinkSync(entry);const outside=path.join(f.root,'outside.mjs');fs.writeFileSync(outside,'');fs.symlinkSync(outside,entry);
  assert.throws(()=>verifyInstallation(f.receipt,f.codexHome,pluginVersion),/越界/);
  assert.throws(()=>verifyInstallation({...f.receipt,installedPath:f.root},f.codexHome,pluginVersion),/预期缓存/);
});
test('same-version stale files or unexpected extra files cannot be executed as a verified install',async t=>{
  const f=fixture(t);assert.equal(verifyPluginCopy(f.sourceRoot,f.installed),5);
  const entry=path.join(f.installed,'skills/team-workspace/scripts/install-launcher.mjs');fs.writeFileSync(entry,'changed');
  await assert.rejects(install({},f.dependencies),/安装内容.*不一致/);assert.equal(f.state.builds,0);
  fs.writeFileSync(entry,'');fs.writeFileSync(path.join(f.installed,'extra'),'untracked');
  assert.throws(()=>verifyPluginCopy(f.sourceRoot,f.installed),/不一致/);
});
test('failed Git marketplace refresh does not install a stale cached plugin',async t=>{
  const f=fixture(t);f.state.configured=[{name:marketplace,marketplaceSource:{sourceType:'git',source:repository}}];f.state.upgradeFailure=true;
  await assert.rejects(install({},f.dependencies),/更新未核验成功/);
  assert.ok(!f.state.calls.some(c=>c.args.join(' ').startsWith('plugin add')));
});
test('compiler failure keeps native installation but reports partial failure; retry completes',async t=>{
  const f=fixture(t);f.state.buildFailure=true;
  await assert.rejects(install({},f.dependencies),/compiler failure/);
  const saved=JSON.parse(fs.readFileSync(path.join(f.codexHome,'teamdesk-install-result.json')));
  assert.equal(saved.state,'failed');assert.equal(saved.steps[1].state,'verified');assert.equal(saved.steps[2].state,'failed');
  f.state.buildFailure=false;assert.equal((await install({open:false},f.dependencies)).state,'installed');
});
test('signature and icon version failures are not reported as successful installation',async t=>{
  const f=fixture(t);f.state.signatureFailure=true;
  await assert.rejects(install({},f.dependencies),/invalid signature/);f.state.signatureFailure=false;f.state.iconVersion='wrong';
  await assert.rejects(install({},f.dependencies),/图标版本/);
  assert.ok(!f.state.calls.some(c=>c.file==='/usr/bin/open'));
});
test('an incompatible executable cannot pass installation using a compatible plist alone',async t=>{
  const f=fixture(t);f.state.binaryMinimum='28.0';
  await assert.rejects(install({},f.dependencies),/实际最低 macOS 版本为 28.0/);
  const result=JSON.parse(fs.readFileSync(path.join(f.codexHome,'teamdesk-install-result.json')));
  assert.equal(result.state,'failed');assert.equal(result.steps[3].state,'failed');
  assert.ok(!f.state.calls.some(c=>c.file==='/usr/bin/open'));
});
test('another active installer is not removed or run over',async t=>{
  const f=fixture(t),lock=path.join(f.codexHome,'.teamdesk-install.lock');fs.writeFileSync(lock,String(process.pid));
  await assert.rejects(install({},f.dependencies),/另一个 TeamDesk 安装/);
  assert.equal(fs.readFileSync(lock,'utf8'),String(process.pid));assert.equal(f.state.calls.length,0);
});
test('an open request failure leaves verified installation intact and tells the user to open manually',async t=>{
  const f=fixture(t);f.state.openFailure=true;const result=await install({},f.dependencies);
  assert.equal(result.state,'installed');assert.equal(result.openRequested,false);assert.ok(f.state.progress.some(m=>m.includes('手动双击')));
});
test('installer arguments reject typos rather than accidentally using defaults',()=>{
  assert.deepEqual(parseArguments(['--check','--no-open']),{open:false,check:true});
  assert.throws(()=>parseArguments(['--source','--check']),/缺少路径/);
  assert.throws(()=>parseArguments(['--no-ope']),/未知参数/);
});

test('preflight accepts later Codex releases and reports missing compiler or plugin support',{skip:process.platform!=='darwin'},()=>{
  let version='codex-cli 0.156.0',fail;
  const run=(file,args)=>{
    if(file===fail||args.join(' ')===fail)throw Error('missing');
    if(file==='/usr/bin/sw_vers')return '13.0';
    if(file==='/usr/libexec/PlistBuddy')return 'com.openai.codex';
    if(args[0]==='--version')return version;
    if(file==='/usr/bin/osascript')return '/Applications/Safari.app';
    return '';
  };
  const options={run,platform:'darwin',env:{TEAMDESK_CODEX_APP:'/My Apps/Codex.app'}};
  assert.equal(inspectDependencies(options).codexVersion,version);
  version='codex-cli 0.155.0-alpha.16';assert.equal(inspectDependencies(options).codexVersion,version);
  version='codex-cli 0.154.9';assert.throws(()=>inspectDependencies(options),/版本过低/);
  version='codex-cli 1.0.0';fail='/usr/bin/xcrun';assert.throws(()=>inspectDependencies(options),/xcode-select --install/);
  fail='plugin add --help';assert.throws(()=>inspectDependencies(options),/不支持所需插件/);
  assert.throws(()=>inspectDependencies({...options,platform:'win32'}),/仅支持 macOS/);
});
test('public installer help is available without network or dependency probing',()=>{
  const root=fileURLToPath(new URL('../../../../../../../install-teamdesk.sh',import.meta.url));
  const help=execFileSync('/bin/sh',[root,'--help'],{encoding:'utf8'});assert.match(help,/--check/);assert.match(help,/--no-open/);
});
test('downloaded or symlinked installer entry executes instead of silently returning success',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk entry '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const entry=path.join(dir,'install.mjs');fs.symlinkSync(fileURLToPath(new URL('../../../scripts/install.mjs',import.meta.url)),entry);
  const result=spawnSync(process.execPath,[entry,'--invalid-option'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/未知参数/);
  assert.equal(result.stdout,'');
});
