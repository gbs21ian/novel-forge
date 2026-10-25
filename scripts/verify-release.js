'use strict';
const fs=require('fs');const crypto=require('crypto');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
if(manifest.id!=='novel-forge')throw Error('Wrong plugin id');
for(const f of ['main.js','manifest.json','styles.css']){
 const b=fs.readFileSync(f);
 console.log(`${crypto.createHash('sha256').update(b).digest('hex')}  ${f} (${b.length} bytes)`);
}
console.log('Release v'+manifest.version+' ready. Upload the above THREE FILES as separate GitHub release assets.');
