import fs from 'node:fs';import path from 'node:path';
const root='C:/myProjects/supplify_erp/output/mobile-transformation';
const target=path.join(root,'staged/src/i18n/ar.json');
const ar=JSON.parse(fs.readFileSync(target,'utf8'));
for(const file of fs.readdirSync(root).filter(f=>/^ar-additions-.*\.json$/.test(f)))Object.assign(ar,JSON.parse(fs.readFileSync(path.join(root,file),'utf8')));
fs.writeFileSync(target,JSON.stringify(ar,null,2)+'\n');console.log(JSON.stringify({translations:Object.keys(ar).length}));
