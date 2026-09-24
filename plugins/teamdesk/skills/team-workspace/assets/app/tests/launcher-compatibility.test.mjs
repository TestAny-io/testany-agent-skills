import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {minimumMacOSVersion,launcherTarget,verifyLauncherCompatibility} from '../../../scripts/launcher-compatibility.mjs';

function fixture({declared='13.0',architecture='arm64',main='13.0',helper='13.0',platform='MACOS',sdk='27.0'}={}) {
  return (file,args)=>{
    if(file==='/usr/libexec/PlistBuddy')return declared;
    if(args[0]==='lipo')return architecture;
    if(args[0]==='vtool')return `Load command 11\n      cmd LC_BUILD_VERSION\n platform ${platform}\n    minos ${args[2].endsWith('launch-codex')?helper:main}\n      sdk ${sdk}\n`;
    throw Error('Unexpected command');
  };
}
test('launcher compilation targets macOS 13 explicitly on both supported architectures',()=>{
  assert.equal(launcherTarget('arm64'),'arm64-apple-macosx13.0');
  assert.equal(launcherTarget('x86_64'),'x86_64-apple-macosx13.0');
  assert.throws(()=>launcherTarget('i386'),/不支持/);
});
test('a newer SDK is allowed when both executable deployment targets match the plist',()=>{
  const result=verifyLauncherCompatibility('/Test/TeamDesk.app',{run:fixture(),architecture:'arm64'});
  assert.equal(result.minimumMacOSVersion,'13.0');assert.equal(result.binaries.length,2);
  assert.ok(result.binaries.every(b=>b.minimumMacOSVersion==='13.0'&&b.sdk==='27.0'));
});
test('a newer target on either executable is rejected even with a compatible plist',()=>{
  for(const options of [{main:'28.0'},{helper:'28.0'}]) {
    assert.throws(()=>verifyLauncherCompatibility('/Test/TeamDesk.app',{run:fixture(options),architecture:'arm64'}),/实际最低 macOS 版本为 28.0/);
  }
});
test('missing metadata, wrong platforms and wrong CPU architectures fail compatibility verification',()=>{
  for(const options of [{main:'unknown'},{platform:'IOSSIMULATOR'},{architecture:'x86_64'},{architecture:'arm64 x86_64'},{declared:'27.0'}]) {
    assert.throws(()=>verifyLauncherCompatibility('/Test/TeamDesk.app',{run:fixture(options),architecture:'arm64'}));
  }
});
test('real launcher build ignores a higher inherited deployment target and validates both signed binaries',{skip:process.platform!=='darwin'},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk compatibility '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=new URL('../../../scripts/install-launcher.mjs',import.meta.url).href;
  const script=path.join(root,'build.mjs');
  fs.writeFileSync(script,`import {installLauncher} from ${JSON.stringify(entry)}; console.log(JSON.stringify(installLauncher({destination:process.argv[2],desktopLink:false})));`);
  const output=execFileSync(process.execPath,[script,path.join(root,'TeamDesk.app')],{
    encoding:'utf8',timeout:180000,env:{...process.env,MACOSX_DEPLOYMENT_TARGET:'28.0'}
  });
  const result=JSON.parse(output);
  assert.equal(result.installed,true);
  assert.equal(result.compatibility.minimumMacOSVersion,minimumMacOSVersion);
  assert.equal(result.compatibility.architecture,os.machine());
  assert.deepEqual(verifyLauncherCompatibility(result.app),result.compatibility);
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',result.app]);
  // Exercise the helper without opening Codex or changing an employee task.
  const helper=spawnSync(path.join(result.app,'Contents/Resources/launch-codex'),[],{encoding:'utf8'});
  assert.equal(helper.status,1);assert.match(JSON.parse(helper.stdout).error,/参数不完整/);
});
