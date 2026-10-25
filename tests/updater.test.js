'use strict';
// Test the actual updater library with mock GitHub responses and mock Obsidian adapter.
const assert=require('node:assert/strict');
const {webcrypto,createHash}=require('node:crypto');
const {
  repoSlug,compareVersion,requireAssets,checkRelease,downloadRelease,installRelease,pluginDirectory
}=require('../src/updater');
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const bytes = text => new TextEncoder().encode(text).buffer;
const digest = data => 'sha256:'+createHash('sha256').update(new Uint8Array(data)).digest('hex');
const slug='example/novel-forge';
const tag='v1.2.2';
const releaseUrl=`https://api.github.com/repos/${slug}/releases/latest`;
const main='// NEW Novel Forge plugin';
const manifest=JSON.stringify({id:'novel-forge',name:'Novel Forge',author:'NF',version:'1.2.2',minAppVersion:'1.5.0'});
const assetsData={'main.js':bytes(main),'manifest.json':bytes(manifest),'styles.css':bytes('.app{display:flex}')};
function mkRelease(){return {tag_name:tag,draft:false,prerelease:false,body:'v1.2.2 업데이트',html_url:`https://github.com/${slug}/releases/tag/${tag}`,
  assets:Object.keys(assetsData).map(name=>({name,size:assetsData[name].byteLength,digest:digest(assetsData[name]),state:'uploaded',browser_download_url:`https://github.com/${slug}/releases/download/${tag}/${name}`}))};}
const cloneBuffer = a => a.slice(0);
class Adapter {
  constructor() {this.directories=new Set(['.obsidian','.obsidian/plugins','.obsidian/plugins/novel-forge']);this.files=new Map();this.failTarget='';this.failOnce=false;}
  async exists(p){return this.files.has(p)||this.directories.has(p);}
  async mkdir(p){this.directories.add(p);}
  async readBinary(p){if(!this.files.has(p))throw new Error('missing '+p);return cloneBuffer(this.files.get(p));}
  async read(p){return new TextDecoder().decode(await this.readBinary(p));}
  async writeBinary(p,v){if(p===this.failTarget && this.failOnce){this.failOnce=false;throw new Error('Disk full');}this.files.set(p,cloneBuffer(v));}
  async write(p,t){this.files.set(p,bytes(t));}
  async remove(p){this.files.delete(p);}
}
function setup(){
  const adapter=new Adapter(),root='.obsidian/plugins/novel-forge';
  adapter.files.set(root+'/main.js',bytes('old plugin'));
  adapter.files.set(root+'/manifest.json',bytes(JSON.stringify({id:'novel-forge',version:'1.2.1'})));
  adapter.files.set(root+'/styles.css',bytes('old styles'));
  adapter.files.set(root+'/data.json',bytes('SECRET-API-KEY-AND-SETTINGS'));
  const plugin={settings:{updateRepository:slug},manifest:{id:'novel-forge',version:'1.2.1'},app:{vault:{adapter,configDir:'.obsidian'}}};
  return {adapter,plugin,root};
}
function mockRequest(response=mkRelease(),assetOverrides={}){
  const calls=[];
  const request=async args=>{
    calls.push(args.url);
    if(args.url===releaseUrl)return {status:200,json:response};
    for(const [name,v] of Object.entries(assetsData)){
      if(args.url===`https://github.com/${slug}/releases/download/${tag}/${name}`){
        return {status:200,arrayBuffer:assetOverrides[name]||v};
      }
    }
    throw new Error('Unexpected request '+args.url);
  };
  return {request,calls};
}
(async()=>{
  assert.equal(repoSlug('https://github.com/example/novel-forge/'),slug);
  assert.equal(repoSlug('example/novel-forge'),slug);
  for(const bad of ['https://evil.test/a/b','a/b/third','../evil','owner/repo?download=evil','a/.',''])assert.throws(()=>repoSlug(bad));
  assert.equal(compareVersion('1.2.10','1.2.9'),1);
  assert.equal(compareVersion('v1.2.1','1.2.1'),0);
  assert.equal(compareVersion('1.2.0','1.2.1'),-1);
  const r=mkRelease(), {plugin,adapter,root}=setup(), {request,calls}=mockRequest();
  assert.equal(pluginDirectory(plugin),root);
  assert.throws(()=>requireAssets({...r,assets:r.assets.filter(x=>x.name!=='styles.css')},slug),/styles.css/);
  assert.throws(()=>requireAssets({...r,assets:r.assets.map(x=>x.name==='main.js'?{...x,digest:null}:x)},slug),/SHA-256/);
  assert.throws(()=>requireAssets({...r,assets:r.assets.map(x=>x.name==='main.js'?{...x,browser_download_url:'https://malicious.test/file'}:x)},slug),/주소/);
  assert.throws(()=>requireAssets({...r,assets:r.assets.map(x=>x.name==='main.js'?{...x,browser_download_url:'https://github.com/attacker/novel-forge/releases/download/v1.2.2/main.js'}:x)},slug),/주소/);
  let available=await checkRelease(plugin,request);
  assert.equal(available.version,'1.2.2');assert.equal(available.isNewer,true);
  const downloaded=await downloadRelease(available,request);
  assert.equal(downloaded.manifest.version,'1.2.2');
  assert.equal(calls.filter(x=>x===releaseUrl).length,1);
  await assert.rejects(()=>downloadRelease(available,mockRequest(r,{'main.js':bytes('evil same length?')}).request),/크기|무결성/);
  await assert.rejects(()=>installRelease(plugin,available,request,()=>false),/이상/);
  assert.equal(new TextDecoder().decode(adapter.files.get(root+'/main.js')),'old plugin');
  const result=await installRelease(plugin,available,request,()=>true);
  assert.equal(result.to,'1.2.2');assert.equal(result.restartNeeded,true);
  assert.equal(new TextDecoder().decode(adapter.files.get(root+'/main.js')),main);
  assert.equal(new TextDecoder().decode(adapter.files.get(root+'/data.json')),'SECRET-API-KEY-AND-SETTINGS');
  assert.equal(new TextDecoder().decode(adapter.files.get(result.backupDir+'/main.js')),'old plugin');
  assert.ok(adapter.files.has(result.backupDir+'/UPDATE-INFO.json'));
  await assert.rejects(()=>installRelease(plugin,{...available,version:'1.2.0'},request,()=>true),/새로운/);
  const {plugin:brokenPlugin,adapter:brokenAdapter,root:brokenRoot}=setup();
  brokenAdapter.failTarget=brokenRoot+'/styles.css';brokenAdapter.failOnce=true;
  const available2=await checkRelease(brokenPlugin,request);
  await assert.rejects(()=>installRelease(brokenPlugin,available2,request,()=>true),/복구/);
  for(const [name,value] of [['main.js','old plugin'],['manifest.json',JSON.stringify({id:'novel-forge',version:'1.2.1'})],['styles.css','old styles'],['data.json','SECRET-API-KEY-AND-SETTINGS']]){
    assert.equal(new TextDecoder().decode(brokenAdapter.files.get(brokenRoot+'/'+name)),value);
  }
  const {plugin:stalePlugin}=setup();stalePlugin.settings.updateRepository='somebody/else';
  await assert.rejects(()=>installRelease(stalePlugin,available,request,()=>true),/저장소가 변경/);
  console.log('OK: release parsing, repo trust boundary, semver, SHA256, preflight, backup, safe install, rollback, settings preservation, repo switch rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
