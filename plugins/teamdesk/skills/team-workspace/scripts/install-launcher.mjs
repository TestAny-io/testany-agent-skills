import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pluginVersion} from '../assets/app/src/version.mjs';
import {minimumMacOSVersion,launcherTarget,verifyLauncherCompatibility} from './launcher-compatibility.mjs';

const assets=fileURLToPath(new URL('../assets/launcher/',import.meta.url));
const identifier='io.testany.teamdesk.launcher';
export function installLauncher({destination=path.join(os.homedir(),'Applications/TeamDesk.app'),desktopLink=true,runtimeConfig={node:process.execPath,codexHome:path.resolve(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'))}}={}) {
  const swift=['swiftc','-target',launcherTarget(),'-swift-version','5'];
  destination=path.resolve(destination);
  if(!destination.endsWith('.app')) throw Error('启动器目标必须是 .app 目录。');
  if(!path.isAbsolute(runtimeConfig?.node||'')||!path.isAbsolute(runtimeConfig?.codexHome||''))throw Error('启动器运行时配置必须使用绝对路径。');
  if(fs.existsSync(destination)) {
    if(fs.lstatSync(destination).isSymbolicLink()) throw Error('启动器目标是链接，不会覆盖。');
    const previous=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(destination,'Contents/Info.plist')],{encoding:'utf8'}).trim();
    if(previous!==identifier)throw Error('目标位置有其他应用，不会覆盖。');
  }
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const stage=fs.mkdtempSync(path.join(path.dirname(destination),'.teamdesk-launcher-'));
  const app=path.join(stage,'TeamDesk.app'),macos=path.join(app,'Contents/MacOS'),resources=path.join(app,'Contents/Resources');
  let backup;
  try {
    fs.mkdirSync(macos,{recursive:true});fs.mkdirSync(resources,{recursive:true});
    fs.writeFileSync(path.join(resources,'installation.json'),JSON.stringify(runtimeConfig,null,2)+'\n',{mode:0o600});
    const info={CFBundleIdentifier:identifier,CFBundleName:'TeamDesk',CFBundleDisplayName:'TeamDesk',CFBundleExecutable:'TeamDesk',CFBundlePackageType:'APPL',CFBundleShortVersionString:pluginVersion,CFBundleVersion:pluginVersion,CFBundleIconFile:'TeamDesk.icns',LSUIElement:true,LSMinimumSystemVersion:minimumMacOSVersion,NSHighResolutionCapable:true};
    execFileSync('/usr/bin/plutil',['-convert','xml1','-o',path.join(app,'Contents/Info.plist'),'-'],{input:JSON.stringify(info)});
    execFileSync('/usr/bin/xcrun',[...swift,'-O',path.join(assets,'LauncherCore.swift'),path.join(assets,'TeamDeskLauncher.swift'),'-o',path.join(macos,'TeamDesk')],{stdio:'inherit',timeout:180000});
    execFileSync('/usr/bin/xcrun',[...swift,'-parse-as-library','-O',path.join(assets,'LaunchCodex.swift'),'-o',path.join(resources,'launch-codex')],{stdio:'inherit',timeout:180000});
    execFileSync('/usr/bin/codesign',['--force','--sign','-',path.join(resources,'launch-codex')],{stdio:'pipe'});
    const render=path.join(stage,'render-icon');
    execFileSync('/usr/bin/xcrun',[...swift,path.join(assets,'Icon.swift'),'-o',render],{stdio:'inherit',timeout:180000});
    const png=path.join(stage,'icon.png');execFileSync(render,[png]);
    const iconset=path.join(stage,'TeamDesk.iconset');fs.mkdirSync(iconset);
    for(const size of [16,32,128,256,512]) for(const scale of [1,2]) {
      execFileSync('/usr/bin/sips',['-z',String(size*scale),String(size*scale),png,'--out',path.join(iconset,`icon_${size}x${size}${scale===2?'@2x':''}.png`)],{stdio:'ignore'});
    }
    execFileSync('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'TeamDesk.icns')]);
    execFileSync('/usr/bin/codesign',['--force','--sign','-','--identifier',identifier,app],{stdio:'pipe'});
    const compatibility=verifyLauncherCompatibility(app);
    execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
    if(fs.existsSync(destination)){backup=path.join(stage,'previous.app');fs.renameSync(destination,backup);}
    try {fs.renameSync(app,destination);}catch(error){if(backup)fs.renameSync(backup,destination);throw error;}
    let link;
    if(desktopLink && fs.existsSync(path.join(os.homedir(),'Desktop'))) {
      const candidate=path.join(os.homedir(),'Desktop/TeamDesk.app');
      try {fs.symlinkSync(destination,candidate);link=candidate;}
      catch(error) {if(error.code!=='EEXIST')throw error;if(fs.lstatSync(candidate).isSymbolicLink()&&fs.readlinkSync(candidate)===destination)link=candidate;}
    }
    return {installed:true,version:pluginVersion,app:destination,desktopLink:link||null,compatibility};
  } finally {fs.rmSync(stage,{recursive:true,force:true});}
}

if(process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(installLauncher(),null,2));
