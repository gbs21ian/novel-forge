'use strict';
/** Local, dependency-free Korean/English lexical retrieval. No text leaves the vault until a user starts an AI task. */
const STOP = new Set('그리고 그러나 하지만 그래서 그러므로 대한 이번 회차 장면 해당 인물 인물의 이야기 소설 작품 설정 내용 부분 현재 이후 이전 다음 관련 대화 원고 집필 작성 여기 이것 그것 있다 없다 해줘 합니다 하세요 필요 자연스럽게 내용은 것을 하는 되는 있는 없는 위해 추가 좀 더 어떻게 어떤 무엇 왜 이런 그런 제가 사용할 참고해주세요'.split(' '));
function tokens(text) {
  const words=String(text||'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const out=[];
  for (const w of words) {
    if (STOP.has(w)) continue;
    out.push(w);
    if (w.length >= 3 && /[가-힣]/.test(w)) {
      for(let i=0; i<w.length-1; i++) out.push(w.slice(i,i+2));
    }
  }
  return out;
}
function textChunks(text, size=850) {
  const lines=String(text||'').split(/\r?\n/), chunks=[];
  let buffer=[], length=0, begin=1;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(length && length+line.length+1>size){
      chunks.push({start:begin,end:i,text:buffer.join('\n')});buffer=[];length=0;begin=i+1;
    }
    if(line.length>size){
      if(buffer.length){chunks.push({start:begin,end:i,text:buffer.join('\n')});buffer=[];length=0;}
      for(let j=0;j<line.length;j+=size)chunks.push({start:i+1,end:i+1,text:line.slice(j,j+size),offset:j});
      begin=i+2;
    } else {buffer.push(line);length+=line.length+1;}
  }
  if(buffer.length)chunks.push({start:begin,end:lines.length,text:buffer.join('\n')});
  return chunks;
}
function indexText(text, maxChars=140000) {
  return textChunks(String(text||'').slice(0,maxChars)).map((part,i)=>{
    const frequencies={};
    for(const t of tokens(part.text)) frequencies[t]=(frequencies[t]||0)+1;
    return {start:part.start,end:part.end,offset:part.offset||0,frequencies,len:Math.max(1,tokens(part.text).length),index:i};
  }).filter(p=>Object.keys(p.frequencies).length);
}
function rank(index, query, {limit=7,maxPerFile=2}={}) {
  const counts={};for(const t of tokens(String(query||'').slice(0,4000)))counts[t]=(counts[t]||0)+1;
  const words=Object.keys(counts).sort((a,b)=>a.length-b.length).slice(-120);
  if(!words.length)return [];
  const corpus=[];
  for(const [path,item] of Object.entries(index||{}))for(const part of (item.chunks||[]))corpus.push({...part,path});
  if(!corpus.length)return [];
  const df={};for(const w of words)df[w]=corpus.reduce((n,c)=>n+(c.frequencies?.[w]?1:0),0);
  const ranked=[];
  for(const c of corpus){let score=0,found=0;
    for(const w of words){const tf=c.frequencies?.[w]||0;
      if(!tf)continue;
      found++;
      const idf=Math.log(1+(corpus.length-df[w]+.5)/(df[w]+.5));
      const weight=w.length>=4 ? 1.65 : 1;
      score+=idf*(tf*2.2)/(tf+1.2*(.25+.75*c.len/90))*weight;
    }
    if(found>=2)score*=1+Math.min(found,7)*.07;
    if(score>0)ranked.push({...c,score});
  }
  ranked.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)||a.start-b.start);
  const chosen=[],perFile={};
  for(const hit of ranked){if((perFile[hit.path]||0)>=maxPerFile)continue;chosen.push(hit);perFile[hit.path]=(perFile[hit.path]||0)+1;if(chosen.length>=limit)break;}
  return chosen;
}
function validateEvidence(text, evidence){
  const referenced=[...new Set(Array.from(String(text||'').matchAll(/\[E(\d+)\]/g),m=>Number(m[1])))];
  const valid=new Set((evidence||[]).map(x=>x.id));
  return {referenced,unknown:referenced.filter(n=>!valid.has(n))};
}
module.exports={tokens,textChunks,indexText,rank,validateEvidence};
