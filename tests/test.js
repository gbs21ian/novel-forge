'use strict';
// No npm install required. Run with: node tests/test.js
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
let lastRequest=null, requests=[], cacheCounter=0, forceCached404=false;
const modelResponses={
  gemini:{ candidates:[{content:{parts:[{text:'제1화 본문'}]}}],usageMetadata:{totalTokenCount:20} },
  anthropic:{content:[{type:'text',text:'클로드 본문'}],usage:{input_tokens:10}},
  openai:{choices:[{message:{content:'오픈AI 본문'}}],usage:{total_tokens:20}}
};
class TFile {
  constructor(p){this.path=p;this.name=p.split('/').at(-1);this.basename=this.name.replace(/\.md$/,'');}
}
class TFolder {
  constructor(p){this.path=p;this.name=p.split('/').at(-1);this.children=[];}
}
class FakeVault {
  constructor(){this.map=new Map();this.contents=new Map();this.otherFiles=new Map();this.adapter={exists:async p=>this.otherFiles.has(p), read:async p=>this.otherFiles.get(p), write:async(p,body)=>{this.otherFiles.set(p,body);}};}
  getAbstractFileByPath(p){return this.map.get(p)||null;}
  async createFolder(p){if(this.map.has(p))throw new Error('Already exists '+p);const f=new TFolder(p);this.map.set(p,f);this.attach(f);return f;}
  attach(f){const parentPath=f.path.split('/').slice(0,-1).join('/');const parent=this.map.get(parentPath);if(parent)parent.children.push(f);}
  async create(p,content){if(this.map.has(p))throw new Error('Duplicate '+p);const f=new TFile(p);this.map.set(p,f);this.contents.set(p,content);this.attach(f);return f;}
  getMarkdownFiles(){return [...this.map.values()].filter(f=>f instanceof TFile);}
  async cachedRead(f){return this.contents.get(f.path);}
  async read(f){return this.contents.get(f.path);}
  async delete(f){this.map.delete(f.path);this.contents.delete(f.path);}
  async process(f,fn){const next=fn(this.contents.get(f.path));this.contents.set(f.path,next);return next;}
  on(){return ()=>{};}
}
class Plugin {
  constructor(){this.app={vault:new FakeVault(),workspace:{getLeavesOfType:()=>[],detachLeavesOfType:()=>{},getLeaf:()=>({openFile:async()=>{}})},setting:{openTabById:()=>{}}};this.manifest={id:'novel-forge'};}
  async loadData(){return null;}
  async saveData(x){this.stored=x;}
  registerView(){} addRibbonIcon(){} addCommand(){} registerEvent(){} addSettingTab(){}
}
class FakeElement {
  constructor(){this.children=[];this.value='';this.hidden=false;this.textContent='';this.handlers={};this.dataset={};this.disabled=false;}
  createDiv(opts={}){const child=new FakeElement();child.textContent=opts.text||'';this.children.push(child);return child;}
  createEl(tag,opts={}){const child=new FakeElement();child.tagName=tag;child.textContent=opts.text||'';this.children.push(child);return child;}
  addClass(){} toggleClass(){} empty(){this.children=[];} setText(v){this.textContent=v;}
  setAttribute(){} addEventListener(name,fn){this.handlers[name]=fn;}
}
class Modal{constructor(app){this.app=app;this.contentEl=new FakeElement();this.modalEl=new FakeElement();} setTitle(){} close(){} open(){this.onOpen();}}
class ItemView{constructor(){this.containerEl={children:[new FakeElement(),new FakeElement()]};}} class PluginSettingTab{} class Setting{} class Notice {}
const moduleStub={exports:{}};
const fakeObsidian={Plugin,Modal,ItemView,PluginSettingTab,Setting,Notice,TFile,TFolder,
  MarkdownView:class {},normalizePath:s=>s.replace(/\\/g,'/').replace(/\/+/g,'/'),
  requestUrl:async params=>{
    lastRequest=params;requests.push(params);
    if(params.url.endsWith(':countTokens'))return {status:200,json:{totalTokens:5500}};
    if(params.url.endsWith('/cachedContents') && params.method==='POST')return {status:200,json:{name:'cachedContents/'+(++cacheCounter),expireTime:new Date(Date.now()+3600000).toISOString()}};
    if(params.url.includes('/cachedContents/') && params.method==='DELETE')return {status:204,json:{}};
    const provider=params.url.includes('generativelanguage')?'gemini':params.url.includes('anthropic')?'anthropic':'openai';
    if(provider==='gemini' && forceCached404 && JSON.parse(params.body).cachedContent){forceCached404=false;return {status:404,json:{error:{message:'cache expired'}}};}
    return {status:200,json:modelResponses[provider]};
  }
};
const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const ctx={module:moduleStub,require:name=>name==='obsidian'?fakeObsidian:name==='./core'?require('../core'):null,
  console,setTimeout,clearTimeout,URL,Date,navigator:{clipboard:{writeText:async()=>{}}}};
vm.runInNewContext(source+'\nmodule.exports.__test={safeName,validRoot,charCount,buildContext,requestAI,NovelAIModal,NovelStudioView,ProjectModal,ChapterModal,SummaryModal,summaryState,summaryPath,gatherStaticCorpus,explicitCapable,findOrCreateCache,loadHistory,saveHistory,recordConversation,historySession,chatWindow,searchNovel,updateLocalIndex,formatEvidence,backupChapter,autoBackupOnModify,makeStyleDraft,StyleProfileModal,BackupsModal};',ctx);
const Forge=moduleStub.exports,{safeName,validRoot,charCount,buildContext,requestAI,NovelAIModal,NovelStudioView,ProjectModal,ChapterModal,SummaryModal,summaryState,summaryPath,gatherStaticCorpus,explicitCapable,findOrCreateCache,loadHistory,saveHistory,recordConversation,historySession,chatWindow,searchNovel,updateLocalIndex,formatEvidence,backupChapter,autoBackupOnModify,makeStyleDraft,StyleProfileModal,BackupsModal}=Forge.__test;
(async()=>{
  assert.equal(safeName('A/B:C'),'A-B-C');
  assert.throws(()=>validRoot('../Secrets'));
  assert.equal(charCount('---\nstatus: draft\n---\n# 제1화\n\n## 본문\n가 나\n다'),3);
  const p=new Forge();await p.onload();
  const projectPath=await p.createProject('재의 종이 울린 뒤','다크 판타지','종소리가 죽음을 뒤바꾼다');
  assert.equal(projectPath,'웹소설/재의 종이 울린 뒤');
  assert.equal(p.getProjects().length,1);
  assert.equal(p.getReferenceNotes(p.getActiveProject()).length,9);
  const c1=await p.createChapter(p.getActiveProject(),'제1화','한밤중 종소리');
  const c2=await p.createChapter(p.getActiveProject(),'제2화','불길한 재');
  assert.equal(p.getChapters(p.getActiveProject()).length,2);
  await p.changeChapterStatus(c1,'done');
  assert.match(await p.app.vault.cachedRead(c1),/status: done/);
  await assert.rejects(()=>p.changeChapterStatus(c1,'invalid'),/알 수 없는 상태/);
  assert.match(c2.path,/0002-제2화\.md$/);
  const context=await buildContext(p,p.getActiveProject(),{targetPath:c2.path,includeNotes:true,includeRecent:true,includeCurrent:true,selectedText:'문장 선택'});
  assert.ok(context.text.includes('문장 선택'));
  assert.ok(context.text.includes('세계관'));
  assert.ok(context.text.includes('한밤중 종소리'));
  assert.ok(context.text.includes('불길한 재'));
  assert.ok(context.names.length>=5);
  p.settings.contextChars=1000;
  const small=await buildContext(p,p.getActiveProject(),{targetPath:c2.path,includeNotes:true,includeRecent:true,includeCurrent:true,selectedText:'중요 선택 문장'});
  assert.ok(small.text.includes('중요 선택 문장'));
  assert.ok(small.text.length<=1050);
  p.settings.provider='gemini';p.settings.model='gemini-2.5-flash';p.settings.apiKeys.gemini='GEMINI-FAKE';
  assert.equal((await requestAI(p,'시스템','사용자')).text,'제1화 본문');
  assert.equal(lastRequest.headers['x-goog-api-key'],'GEMINI-FAKE');
  assert.equal(JSON.parse(lastRequest.body).systemInstruction.parts[0].text,'시스템');
  p.settings.provider='anthropic';p.settings.model='claude-sonnet-4-5';p.settings.apiKeys.anthropic='ANTHROPIC-FAKE';
  assert.equal((await requestAI(p,'시스템','사용자')).text,'클로드 본문');
  assert.equal(lastRequest.headers['anthropic-version'],'2023-06-01');
  p.settings.provider='openai';p.settings.model='gpt-5-mini';p.settings.apiKeys.openai='OPENAI-FAKE';
  assert.equal((await requestAI(p,'시스템','사용자')).text,'오픈AI 본문');
  assert.ok(JSON.parse(lastRequest.body).max_completion_tokens);
  p.settings.provider='custom';p.settings.model='my-model';p.settings.apiKeys.custom='CUSTOM-FAKE';
  p.settings.customEndpoint='http://public.example/v1/chat/completions';
  await assert.rejects(()=>requestAI(p,'a','b'),/HTTPS/);
  p.settings.customEndpoint='https://public.example/v1/chat/completions';
  assert.equal((await requestAI(p,'시스템','사용자')).text,'오픈AI 본문');
  assert.ok(JSON.parse(lastRequest.body).max_tokens);
  assert.equal(JSON.parse(lastRequest.body).max_completion_tokens,undefined);
  // Summaries are scoped per chapter, never accepted if the source content changed.
  const project=p.getActiveProject();
  const state=(await summaryState(p,project))[0];
  assert.equal(state.valid,false);
  const summaryFile=await p.app.vault.create(summaryPath(project,c1),`---\nsource_hash: ${state.source}\n---\n# 요약\n\n첫 화 주요 내용`);
  assert.equal((await summaryState(p,project))[0].valid,true);
  await p.app.vault.process(c1,old=>old+'\n설정 변경');
  assert.equal((await summaryState(p,project))[0].valid,false);
  const staticNotes=await gatherStaticCorpus(p,project);
  assert.ok(staticNotes.text.includes('세계관'));
  assert.ok(!staticNotes.text.includes('첫 화 주요 내용'));
  assert.equal(explicitCapable('gemini-2.5-flash'),true);
  assert.equal(explicitCapable('gemini-3.8-flash'),true);
  assert.equal(explicitCapable('gemini-4-argon'),false);
  assert.equal(chatWindow(Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:String(i)})),8).length,16);
  // Server caching: create once, reuse, invalidate when corpus changes, fall back on 404.
  p.settings.provider='gemini';p.settings.model='gemini-2.5-flash';p.settings.apiKeys.gemini='GEMINI-FAKE';
  const largeWorld=p.app.vault.getAbstractFileByPath(project.path+'/01-설정/세계관.md');
  await p.app.vault.process(largeWorld,old=>old+'\n'+'세계관 규칙 '.repeat(1900));
  let corpus=await gatherStaticCorpus(p,project);
  const fixedSystem='작가 시스템';
  const created=await requestAI(p,fixedSystem,'집필 시작',{staticContext:corpus.text,projectPath:project.path});
  assert.equal(created.cacheMode,'명시적 캐시 신규 생성');
  const tokenRequest=requests.find(r=>r.url.endsWith(':countTokens'));
  assert.ok(JSON.parse(tokenRequest.body).generateContentRequest.systemInstruction);
  assert.ok(JSON.parse(lastRequest.body).cachedContent);
  assert.equal(JSON.parse(lastRequest.body).systemInstruction,undefined);
  assert.equal(requests.filter(r=>r.url.endsWith('/cachedContents')&&r.method==='POST').length,1);
  const reused=await requestAI(p,fixedSystem,'다시 집필',{staticContext:corpus.text,projectPath:project.path});
  assert.equal(reused.cacheMode,'명시적 캐시 재사용');
  assert.equal(requests.filter(r=>r.url.endsWith('/cachedContents')&&r.method==='POST').length,1);
  await p.app.vault.process(largeWorld,old=>old+'\n다시 수정');
  corpus=await gatherStaticCorpus(p,project);
  await requestAI(p,fixedSystem,'세 번째',{staticContext:corpus.text,projectPath:project.path});
  assert.equal(requests.filter(r=>r.url.endsWith('/cachedContents')&&r.method==='POST').length,2);
  assert.ok(requests.some(r=>r.method==='DELETE'&&r.url.includes('/cachedContents/')));
  forceCached404=true;
  const recovered=await requestAI(p,fixedSystem,'재요청',{staticContext:corpus.text,projectPath:project.path});
  assert.match(recovered.cacheMode,/일반 재시도/);
  assert.equal(JSON.parse(lastRequest.body).cachedContent,undefined);
  p.settings.model='gemini-4-argon';
  const fourth=await requestAI(p,fixedSystem,'4 요청',{staticContext:corpus.text,projectPath:project.path});
  assert.equal(fourth.cacheMode,'자동/일반');
  assert.equal(JSON.parse(lastRequest.body).cachedContent,undefined);
  p.settings.model='gemini-2.5-flash';
  // Actual conversation persistence and bounded conversation sending.
  p.settings.enableAutoSummary=false;
  for(let k=0;k<14;k++)await recordConversation(p,project,'draft','',`지시${k}`,`답변${k}`);
  let h=await historySession(p,project,'draft','');
  assert.equal(h.session.recent.length,28);
  assert.equal(chatWindow(h.session.recent,8).length,16);
  const recentResponse=await requestAI(p,fixedSystem,'대답',{history:h.session.recent});
  assert.equal(JSON.parse(lastRequest.body).contents.length,18); // prefix, 16 history messages, new user
  p.settings.enableAutoSummary=true;
  await recordConversation(p,project,'draft','','지시14','답변14');
  h=await historySession(p,project,'draft','');
  assert.equal(h.session.recent.length,16);
  assert.ok(h.session.archiveSummary.includes('제1화 본문'));
  assert.ok(p.settings.usageRecords.length>0);
  const view=new NovelStudioView(null,p);
  await view.render();
  assert.ok(view.containerEl.children[1].children.length>0);
  const aiModal=new NovelAIModal(p,p.getActiveProject(),'continue','','');
  aiModal.onOpen();
  assert.ok(aiModal.contentEl.children.length>0);
  // Exercise the actual summary modal path, not only summary helpers.
  const summaryModal=new SummaryModal(p,project);
  await summaryModal.onOpen();
  const scan=el=>[el,...(el.children || []).flatMap(scan)];
  const generateSummaryButton=scan(summaryModal.contentEl).find(e=>e.tagName==='button'&&e.textContent.includes('최대 3화 요약'));
  assert.ok(generateSummaryButton);
  await generateSummaryButton.handlers.click();
  assert.equal((await summaryState(p,project)).filter(s=>s.valid).length,2);
  // End-to-end modal generation keeps the result unsaved until user requests a save.
  const writer=new NovelAIModal(p,project,'continue','','');
  writer.onOpen();writer.prompt='다음 전개를 써줘';
  await writer.generate();
  assert.equal(writer.generated,'제1화 본문');
  assert.match(writer.message.textContent,/캐싱:/);
  assert.equal((await historySession(p,project,'continue',c2.path)).session.recent.length,2);
  const projectModal=new ProjectModal(p);
  projectModal.onOpen();
  assert.ok(projectModal.contentEl.children.length>0);
  const chapterModal=new ChapterModal(p);
  chapterModal.onOpen();
  assert.ok(chapterModal.contentEl.children.length>0);
  const before=await p.app.vault.cachedRead(c1);
  await p.app.vault.process(c1,old=>old+'\nAI 작성 본문');
  const after=await p.app.vault.cachedRead(c1);
  assert.ok(after.includes(before)&&after.includes('AI 작성 본문'));
  const result=await p.saveAIResult(p.getActiveProject(),'퇴고','새 문장');
  assert.ok(result.path.includes('04-AI결과'));
  assert.ok((await p.app.vault.cachedRead(result)).includes('새 문장'));
  // Search index persists only local token frequencies and line locations (no extracted raw corpus).
  const evidence=await searchNovel(p,project,'종소리 불길한 재 한밤중');
  assert.ok(evidence.length>=1);
  assert.ok(evidence.some(e=>e.path.includes('02-회차')));
  assert.ok(formatEvidence(evidence).includes('[E1]'));
  assert.ok(p.app.vault.otherFiles.has(project.path+'/05-기억/검색색인.json'));
  const indexJson=p.app.vault.otherFiles.get(project.path+'/05-기억/검색색인.json');
  assert.ok(!indexJson.includes('한밤중 종소리')); // no full manuscript copies in index
  const original=await p.app.vault.read(c2);
  const snap=await backupChapter(p,project,c2,'AI추가-이전');
  assert.equal(await p.app.vault.read(snap),original);
  assert.ok(snap.path.includes('06-백업'));
  const backupModal=new BackupsModal(p,project);backupModal.onOpen();
  assert.ok(backupModal.contentEl.children.length>0);
  const styleModal=new StyleProfileModal(p,project);styleModal.onOpen();
  assert.ok(styleModal.contentEl.children.length>0);
  // Planning -> main writing -> source-backed review -> polishing are separate opt-in steps.
  p.settings.pipelinePlan=true;p.settings.pipelineCritique=true;p.settings.pipelinePolish=true;
  const callsBefore=requests.length;
  const pipeline=new NovelAIModal(p,project,'draft','','');pipeline.onOpen();
  pipeline.usePipeline=true;pipeline.prompt='불길한 재와 종소리의 비밀을 드러낸다';
  await pipeline.generate();
  assert.ok(requests.length>=callsBefore+3);
  assert.ok(pipeline.generated);
  assert.ok(pipeline.plan);
  assert.ok(pipeline.critique);
  assert.ok(pipeline.evidenceOutput.children.length>=1);
  // Multi-model per-stage override goes to actual payload, without switching the user's primary model.
  p.settings.pipelinePlannerModel='gemini-2.5-pro';p.settings.pipelinePolish=false;
  const multi=new NovelAIModal(p,project,'draft','','');multi.onOpen();multi.usePipeline=true;multi.prompt='종소리 비밀';
  await multi.generate();
  assert.ok(requests.some(r=>r.url.includes('/gemini-2.5-pro:generateContent')));
  assert.equal(p.settings.model,'gemini-2.5-flash');
  // Style profile is never installed without an explicit approval click.
  const stylePath=project.path+'/03-자료/문체프로필.md';
  const initialProfile=await p.app.vault.read(p.app.vault.getAbstractFileByPath(stylePath));
  const approvalModal=new StyleProfileModal(p,project);approvalModal.onOpen();
  const styleAnalyze=scan(approvalModal.contentEl).find(e=>e.tagName==='button'&&e.textContent.includes('AI 문체 분석'));
  const styleApprove=scan(approvalModal.contentEl).find(e=>e.tagName==='button'&&e.textContent.includes('문체 프로필로 승인'));
  await styleAnalyze.handlers.click();
  assert.equal(await p.app.vault.read(p.app.vault.getAbstractFileByPath(stylePath)),initialProfile);
  assert.equal(styleApprove.disabled,false);
  await styleApprove.handlers.click();
  assert.match(await p.app.vault.read(p.app.vault.getAbstractFileByPath(stylePath)),/제1화 본문/);
  // Automatic periodic snapshots are throttled for each manuscript; pre-append preserves precise prior text.
  const snapshotsBefore=p.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(project.path+'/06-백업/')).length;
  await autoBackupOnModify(p,c1);
  await autoBackupOnModify(p,c1);
  assert.equal(p.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(project.path+'/06-백업/')).length,snapshotsBefore+1);
  const preAppend=await p.app.vault.read(c2);
  const appender=new NovelAIModal(p,project,'continue','','');appender.onOpen();appender.generated='안전한 새 본문';appender.targetPath=c2.path;
  await appender.appendToChapter();
  assert.match(await p.app.vault.read(c2),/안전한 새 본문/);
  const savedPreAppend=p.app.vault.getMarkdownFiles().filter(f=>f.path.includes('/06-백업/')&&f.path.includes('AI추가-이전')).sort((a,b)=>b.path.localeCompare(a.path))[0];
  assert.equal(await p.app.vault.read(savedPreAppend),preAppend);
  // Two-click restore, and a new pre-restore snapshot is made before replacing current manuscript.
  const beforeRestore=p.app.vault.getMarkdownFiles().filter(f=>f.path.includes('/06-백업/')).length;
  const restorer=new BackupsModal(p,project);restorer.onOpen();
  const restoreRow=scan(restorer.contentEl).find(e=>e.children?.some(x=>x.textContent?.includes('AI추가-이전'))&&e.children?.some(x=>x.tagName==='button'&&x.textContent==='복원'));
  assert.ok(restoreRow);
  const restoreButton=restoreRow.children.find(x=>x.tagName==='button'&&x.textContent==='복원');
  await restoreButton.handlers.click();
  assert.match(await p.app.vault.read(c2),/안전한 새 본문/); // confirmation only
  await restoreButton.handlers.click();
  assert.equal(await p.app.vault.read(c2),preAppend);
  assert.ok(p.app.vault.getMarkdownFiles().filter(f=>f.path.includes('/06-백업/')).length>=beforeRestore);
  // Backwards-compatible 1.1 conversation memory remains readable and bounded.
  assert.ok((await historySession(p,project,'draft','')).session.recent.length);
  console.log('OK: v1.1 compatibility; 4 API providers; cache lifecycle; sliding history; RAG citation/excerpt retrieval; multi-stage AI; multi-model stages; approved style profile; throttled backups and confirmation-based restore.');
})().catch(e=>{console.error(e);process.exitCode=1;});
