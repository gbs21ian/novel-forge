'use strict';
// Builtin Node only; repeatable plugin build. Run: node build.js
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
let core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
core = core.replace(/^'use strict';\s*/, '').replace(/module\.exports=\{tokens,textChunks,indexText,rank,validateEvidence\};\s*$/, '');
const target = "const {indexText,rank,validateEvidence} = require('./core');";
if (!source.includes(target)) throw new Error('core import not found; build stopped');
const bundled = source.replace(target, `const {indexText,rank,validateEvidence} = (()=>{\n${core}\nreturn {indexText,rank,validateEvidence};\n})();`);
const updater = fs.readFileSync(path.join(root,'src/updater.js'),'utf8')
  .replace(/^'use strict';\s*/, '')
  .replace(/module\.exports=\{repoSlug,compareVersion,requireAssets,checkRelease,downloadRelease,installRelease,pluginDirectory,hashHex\};\s*$/, '');
const token = "const {repoSlug,checkRelease,installRelease} = require('./updater');";
if (!bundled.includes(token)) throw new Error('updater import not found; build stopped');
const complete = bundled.replace(token, `const {repoSlug,checkRelease,installRelease} = (()=>{\n${updater}\nreturn {repoSlug,checkRelease,installRelease};\n})();`);
fs.writeFileSync(path.join(root,'main.js'),complete);
console.log('Built Novel Forge v1.2.2 main.js');
