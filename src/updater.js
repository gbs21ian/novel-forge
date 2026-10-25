'use strict';
/**
 * Opt-in GitHub Release updater for privately distributed Novel Forge installations.
 * This MUST NOT be shipped in Obsidian's official Community Plugins directory:
 * official policy prohibits plugins from updating themselves.
 *
 * No GitHub credentials are requested. No vault documents/data.json leave the device.
 * The GitHub repo must be explicitly configured. Downloads are limited to release
 * assets of that repository; sha256 digests from the release metadata are mandatory.
 */

const UPDATE_FILENAMES = Object.freeze(['main.js', 'manifest.json', 'styles.css']);
const SIZE_LIMITS = Object.freeze({'main.js': 6*1024*1024, 'manifest.json': 128*1024, 'styles.css': 2*1024*1024});
const REPOSITORY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function repoSlug(value){
  const input=String(value||'').trim().replace(/\/+$/,'');
  const slug=input.startsWith('https://github.com/')?input.slice('https://github.com/'.length).replace(/\.git$/i,''):input;
  if(!REPOSITORY.test(slug)||slug.split('/').some(s=>s==='.'||s==='..'))throw new Error('GitHub 저장소는 owner/repo 형식으로 입력하세요.');
  return slug;
}
function versionParts(value){
  const cleaned=String(value||'').replace(/^v/,'');
  if(!VERSION.test(cleaned))throw new Error('잘못된 버전 형식입니다: '+value);
  return cleaned.split('.').map(Number);
}
function compareVersion(a,b){
  const x=versionParts(a),y=versionParts(b);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
function requireAssets(release, slug) {
  if(!release || release.draft || release.prerelease)throw new Error('정식 공개 릴리스가 없습니다.');
  const version=String(release.tag_name||'').replace(/^v/,'');
  versionParts(version);
  const assets={};
  for(const name of UPDATE_FILENAMES){
    const candidates=(release.assets||[]).filter(a=>a.name===name && a.state==='uploaded');
    if(candidates.length!==1)throw new Error(`${name} 릴리스 파일이 없거나 중복됩니다.`);
    const a=candidates[0];
    if(!Number.isSafeInteger(a.size)||a.size<1||a.size>SIZE_LIMITS[name])throw new Error(`${name} 파일 크기가 허용 범위를 벗어났습니다.`);
    if(!/^sha256:[a-fA-F0-9]{64}$/.test(String(a.digest||'')))throw new Error(`${name} SHA-256 해시가 릴리스에 없습니다. 배포자에게 문의하세요.`);
    const url=new URL(String(a.browser_download_url||''));
    const prefix=`/${slug}/releases/download/`;
    if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash||
      !url.pathname.startsWith(prefix)||!url.pathname.endsWith('/'+name))throw new Error(`${name} 다운로드 주소가 설정한 GitHub 저장소와 일치하지 않습니다.`);
    const tagSegment=url.pathname.slice(prefix.length,-('/'+name).length);
    if(decodeURIComponent(tagSegment)!==release.tag_name)throw new Error(`${name} 릴리스 태그와 다운로드 주소가 다릅니다.`);
    assets[name]={url:url.href,hash:a.digest.slice(7).toLowerCase(),size:a.size};
  }
  return {version,notes:String(release.body||'').slice(0,4000),assets,url:release.html_url||'',repo:slug};
}
function concatPath(base,name){return base.replace(/\/+$/,'')+'/'+name;}
function pluginDirectory(plugin){
  // Respect custom Obsidian config directories (not always .obsidian).
  const dir=plugin.app.vault.configDir;
  if(!dir||!plugin.manifest?.id||!/^[-a-z0-9]+$/.test(plugin.manifest.id))throw new Error('Obsidian 설정 폴더를 확인할 수 없습니다.');
  return concatPath(concatPath(dir,'plugins'),plugin.manifest.id);
}
async function ensureDir(adapter,path){
  const parts=path.split('/');
  for(let i=1;i<=parts.length;i++){
    const dir=parts.slice(0,i).join('/');
    if(!await adapter.exists(dir))await adapter.mkdir(dir);
  }
}
async function hashHex(bytes){
  // Web Crypto is supported by Electron and mobile Obsidian; avoid desktop-only Node APIs.
  if(!globalThis.crypto?.subtle?.digest)throw new Error('SHA-256 검증을 지원하지 않는 환경입니다.');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function checkRelease(plugin,request){
  const repo=repoSlug(plugin.settings.updateRepository);
  const response=await request({url:`https://api.github.com/repos/${repo}/releases/latest`,method:'GET',
    headers:{'Accept':'application/vnd.github+json'}});
  if(response.status!==200)throw new Error(`GitHub 조회 실패 (HTTP ${response.status}). 공개 저장소와 Releases를 확인하세요.`);
  const release=requireAssets(response.json,repo);
  release.isNewer=compareVersion(release.version,plugin.manifest.version)>0;
  return release;
}
async function downloadRelease(release,request){
  const files={};
  for(const name of UPDATE_FILENAMES){
    const asset=release.assets[name];
    const resp=await request({url:asset.url,method:'GET'});
    if(resp.status!==200||!(resp.arrayBuffer instanceof ArrayBuffer))throw new Error(`${name} 다운로드에 실패했습니다 (HTTP ${resp.status}).`);
    const bytes=resp.arrayBuffer;
    if(bytes.byteLength!==asset.size)throw new Error(`${name} 다운로드된 파일의 크기가 다릅니다.`);
    if(await hashHex(bytes)!==asset.hash)throw new Error(`${name} SHA-256 무결성 검증에 실패했습니다.`);
    files[name]=bytes;
  }
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files['manifest.json']));
  if(manifest.id!=='novel-forge')throw new Error('다운로드된 플러그인 ID가 다릅니다.');
  if(manifest.version!==release.version)throw new Error('배포 버전과 manifest.json 버전이 다릅니다.');
  versionParts(manifest.minAppVersion);
  if(!manifest.name||!manifest.author)throw new Error('manifest.json 필수 항목이 없습니다.');
  if(!new TextDecoder('utf-8',{fatal:true}).decode(files['main.js']).trim())throw new Error('main.js가 비어 있습니다.');
  return {files,manifest};
}
async function installRelease(plugin,release,request,requireApiVersion){
  if(!release.isNewer||compareVersion(release.version,plugin.manifest.version)<=0)
    throw new Error('현재 버전보다 새로운 릴리스만 설치할 수 있습니다.');
  const repo=repoSlug(plugin.settings.updateRepository);
  if(repo!==release.repo)throw new Error('확인 이후 GitHub 저장소가 변경됐습니다. 다시 확인하세요.');
  // Check again that the release we are about to install is still the expected release.
  const current=await checkRelease(plugin,request);
  if(current.version!==release.version || !current.isNewer)throw new Error('릴리스가 변경되었습니다. 업데이트 확인을 다시 실행하세요.');
  for(const name of UPDATE_FILENAMES){
    if(current.assets[name].hash!==release.assets[name].hash)throw new Error('릴리스 파일이 변경되었습니다. 다시 확인하세요.');
  }
  const downloaded=await downloadRelease(current,request);
  if(typeof requireApiVersion!=='function' || !requireApiVersion(downloaded.manifest.minAppVersion))
    throw new Error(`Obsidian ${downloaded.manifest.minAppVersion} 이상에서만 실행할 수 있는 버전입니다.`);
  const adapter=plugin.app.vault.adapter;
  const base=pluginDirectory(plugin);
  if(!await adapter.exists(base))throw new Error('기존 플러그인 폴더를 찾을 수 없습니다.');
  const onDisk=concatPath(base,'manifest.json');
  if(await adapter.exists(onDisk)){
    let installed;
    try{installed=JSON.parse(await adapter.read(onDisk));}
    catch(e){throw new Error('로컬 manifest.json을 확인할 수 없습니다. 수동 복구가 필요할 수 있습니다.');}
    if(installed.version!==plugin.manifest.version)throw new Error('플러그인 파일이 이미 바뀌었습니다. Obsidian을 재시작한 뒤 확인하세요.');
  }
  // Do not touch data.json or any manuscript data. Keep old plugin assets in a retained backup.
  const backupDir=concatPath(concatPath(base,'.novel-forge-updates'),
    `${plugin.manifest.version}-to-${release.version}-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  const old={};
  for(const name of UPDATE_FILENAMES){
    const target=concatPath(base,name);
    old[name]=await adapter.exists(target)?await adapter.readBinary(target):null;
  }
  if(old['main.js']===null||old['manifest.json']===null)throw new Error('기존 설치 파일이 없어서 안전한 업데이트를 진행할 수 없습니다.');
  await ensureDir(adapter,backupDir);
  for(const name of UPDATE_FILENAMES){if(old[name]!==null)await adapter.writeBinary(concatPath(backupDir,name),old[name]);}
  await adapter.write(concatPath(backupDir,'UPDATE-INFO.json'), JSON.stringify({
    from:plugin.manifest.version,to:release.version,repository:repo,createdAt:new Date().toISOString(),
    files:UPDATE_FILENAMES.filter(n=>old[n]!==null)
  },null,2));
  const touched=[];
  try {
    for(const name of UPDATE_FILENAMES){
      const target=concatPath(base,name);
      touched.push(name); // a failed partial write still needs rollback
      await adapter.writeBinary(target,downloaded.files[name]);
    }
  }catch(e){
    const rollbackErrors=[];
    for(const name of touched.reverse()){
      try{
        const target=concatPath(base,name);
        if(old[name]!==null)await adapter.writeBinary(target,old[name]);
        else if(await adapter.exists(target))await adapter.remove(target);
      }catch(re){rollbackErrors.push(name+': '+String(re.message||re));}
    }
    if(rollbackErrors.length)throw new Error('업데이트 실패, 자동 복원도 일부 실패했습니다. 백업 위치: '+backupDir+' / '+rollbackErrors.join('; '));
    throw new Error('설치 중 오류가 발생하여 기존 버전을 복구했습니다. 백업 위치: '+backupDir+' / '+String(e.message||e));
  }
  return {from:plugin.manifest.version,to:release.version,backupDir,restartNeeded:true};
}

module.exports={repoSlug,compareVersion,requireAssets,checkRelease,downloadRelease,installRelease,pluginDirectory,hashHex};
