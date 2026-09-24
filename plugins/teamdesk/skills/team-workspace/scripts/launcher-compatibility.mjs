import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Use one minimum for the compiler, bundle metadata and installation checks.
export const minimumMacOSVersion = '13.0';
const command = (file,args) => execFileSync(file,args,{encoding:'utf8',timeout:30000});
const sameVersion = (a,b) => {
  const parts=value=>/^\d+\.\d+(?:\.\d+)?$/.test(value)?value.split('.').map(Number):[];
  const x=parts(a),y=parts(b);
  return x.length>0&&y.length>0&&[0,1,2].every(i=>(x[i]||0)===(y[i]||0));
};

export function launcherTarget(architecture=os.machine()) {
  if(!['arm64','x86_64'].includes(architecture))throw Error('不支持的 macOS 启动器架构：'+architecture);
  return architecture+'-apple-macosx'+minimumMacOSVersion;
}

export function verifyLauncherCompatibility(app,{run=command,architecture=os.machine()}={}) {
  launcherTarget(architecture);
  const declared=run('/usr/libexec/PlistBuddy',['-c','Print :LSMinimumSystemVersion',path.join(app,'Contents/Info.plist')]).trim();
  if(!sameVersion(declared,minimumMacOSVersion))throw Error('启动器声明的最低 macOS 版本不一致：'+declared);
  const binaries=['Contents/MacOS/TeamDesk','Contents/Resources/launch-codex'].map(file=>{
    const binary=path.join(app,file);
    const actualArchitecture=run('/usr/bin/xcrun',['lipo','-archs',binary]).trim();
    if(actualArchitecture!==architecture)throw Error(file+' 的架构不匹配：'+actualArchitecture+'；预期 '+architecture);
    const output=run('/usr/bin/xcrun',['vtool','-show-build',binary]);
    const platform=output.match(/^\s*platform\s+(\S+)\s*$/m)?.[1];
    const minimum=output.match(/^\s*minos\s+(\S+)\s*$/m)?.[1];
    const sdk=output.match(/^\s*sdk\s+(\S+)\s*$/m)?.[1];
    // Checking Info.plist alone misses a compiler that silently targets a newer OS.
    if(platform!=='MACOS'||!sameVersion(minimum||'',minimumMacOSVersion)) {
      throw Error(file+' 的实际最低 macOS 版本为 '+(minimum||'未知')+'（平台 '+(platform||'未知')+'），应为 '+minimumMacOSVersion+'；未通过启动兼容性核验。');
    }
    return {file,architecture:actualArchitecture,minimumMacOSVersion:minimum,sdk};
  });
  return {minimumMacOSVersion,architecture,binaries};
}
