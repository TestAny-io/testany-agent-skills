import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

const supported=process.platform==='darwin';
let build,binary;
before(()=>{
  if(!supported)return;
  build=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-swift-tests-'));binary=path.join(build,'resolver');
  execFileSync('/usr/bin/xcrun',['swiftc','-swift-version','5',fileURLToPath(new URL('../../launcher/LauncherCore.swift',import.meta.url)),fileURLToPath(new URL('./fixtures/launcher-resolver.swift',import.meta.url)),'-o',binary],{timeout:30000});
});
after(()=>{if(build)fs.rmSync(build,{recursive:true,force:true});});
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-offline-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function install(root,version='0.0.12',marketplace='personal'){
  const plugin=path.join(root,'plugins/cache',marketplace,'teamdesk',version);
  fs.mkdirSync(path.join(plugin,'.codex-plugin'),{recursive:true});fs.mkdirSync(path.join(plugin,'skills/team-workspace/scripts'),{recursive:true});
  fs.writeFileSync(path.join(plugin,'.codex-plugin/plugin.json'),JSON.stringify({name:'teamdesk',version}));
  fs.writeFileSync(path.join(plugin,'skills/team-workspace/scripts/one-click.mjs'),'');return plugin;
}
function resolve(root){return spawnSync(binary,[root],{encoding:'utf8',env:{PATH:'/nonexistent',CODEX_HOME:root,TEAMDESK_HOME:root},timeout:3000});}
test('cold launcher locates installed TeamDesk without Codex, a CLI process, PATH tools, or network',{skip:!supported},t=>{
  const root=fixture(t),plugin=install(root),result=resolve(root);
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).entry,path.join(plugin,'skills/team-workspace/scripts/one-click.mjs'));
});
test('the same icon resolves a later plugin version after replacement without a pinned path',{skip:!supported},t=>{
  const root=fixture(t),old=install(root);assert.equal(resolve(root).status,0);fs.rmSync(old,{recursive:true});const next=install(root,'0.1.0');
  assert.equal(JSON.parse(resolve(root).stdout).entry,path.join(next,'skills/team-workspace/scripts/one-click.mjs'));
});
test('ambiguous installed versions require repair instead of silently choosing a stale entry',{skip:!supported},t=>{
  const root=fixture(t);install(root);install(root,'0.1.0');const result=resolve(root);
  assert.equal(result.status,1);assert.match(result.stderr,/多个 TeamDesk/);
});
test('missing or mismatched installation reports the actual local failure',{skip:!supported},t=>{
  const root=fixture(t);assert.match(resolve(root).stderr,/未找到已安装/);const plugin=install(root);
  fs.writeFileSync(path.join(plugin,'.codex-plugin/plugin.json'),JSON.stringify({name:'teamdesk',version:'wrong'}));assert.match(resolve(root).stderr,/安装信息不完整/);
});
test('an entry symlink outside the installed plugin is not executed',{skip:!supported},t=>{
  const root=fixture(t),plugin=install(root),entry=path.join(plugin,'skills/team-workspace/scripts/one-click.mjs'),outside=path.join(root,'outside.mjs');
  fs.writeFileSync(outside,'');fs.unlinkSync(entry);fs.symlinkSync(outside,entry);assert.equal(resolve(root).status,1);
});
test('Finder launch can resolve the installed custom Codex profile and Node without shell variables',{skip:!supported},t=>{
  const root=fixture(t),plugin=install(root,'0.1.0','testany-agent-skills'),config=path.join(root,'installation.json');
  fs.writeFileSync(config,JSON.stringify({node:'/My Runtimes/node',codexHome:root}));
  const result=spawnSync(binary,['/not-the-profile',config],{encoding:'utf8',env:{PATH:'/nonexistent'},timeout:3000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).entry,path.join(plugin,'skills/team-workspace/scripts/one-click.mjs'));
  assert.equal(JSON.parse(result.stdout).node,'/My Runtimes/node');
});
test('corrupt or relative launcher installation settings require repair',{skip:!supported},t=>{
  const root=fixture(t);install(root);const config=path.join(root,'installation.json');
  for(const text of ['{',JSON.stringify({node:'node',codexHome:root})]) {
    fs.writeFileSync(config,text);const result=spawnSync(binary,[root,config],{encoding:'utf8',timeout:3000});
    assert.equal(result.status,1);assert.match(result.stderr,/安装配置不完整/);
  }
});
