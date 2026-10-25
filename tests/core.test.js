'use strict';
const assert=require('node:assert/strict');
const {tokens,textChunks,indexText,rank,validateEvidence}=require('../core');
assert.ok(tokens('종탑에서 울린 불길한 종소리').includes('종소리'));
assert.ok(tokens('큰 세계관').includes('세계관'));
const example={
  '02-회차/0087-재의종.md':{chunks:indexText('종소리가 울렸다. 그리고 재의 종탑 문이 열렸다.\n종탑 아래에서 주인공이 쓰러졌다.')},
  '01-설정/성채.md':{chunks:indexText('성채의 늑대와 강철 단검에 관한 기록')}
};
assert.equal(rank(example,'종소리 종탑 재의').at(0).path,'02-회차/0087-재의종.md');
assert.equal(rank(example,'성채 늑대 단검').at(0).path,'01-설정/성채.md');
assert.deepEqual(validateEvidence('근거 [E1] [E9]',[{id:1}]),{referenced:[1,9],unknown:[9]});
const long=textChunks('a'.repeat(1900),850);
assert.ok(long.length>=3);
assert.ok(long.every(c=>c.end>=c.start));
console.log('OK: local Korean tokenization, ranked retrieval, source citation validation, long-line indexing.');
