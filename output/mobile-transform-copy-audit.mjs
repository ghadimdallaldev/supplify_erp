import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('C:/myProjects/supplify_erp/node_modules/typescript');
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const keys=new Set();
for(const file of walk(root).filter(f=>/\.tsx?$/.test(f)&&!f.includes('__tests__')&&!f.endsWith('runtime.ts'))){
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(n){if(ts.isCallExpression(n)&&/^(uiCopy|copy)$/.test(n.expression.getText(ast))&&n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0]))keys.add(n.arguments[0].text);ts.forEachChild(n,visit)}visit(ast);
}
const ar=JSON.parse(fs.readFileSync(path.join(root,'i18n/ar.json'),'utf8'));
const missing=[...keys].filter(k=>/[A-Za-z]{2}/.test(k)&&!ar[k]).sort();
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/missing-ar.json',JSON.stringify(missing,null,2));
fs.writeFileSync(path.join(root,'i18n/en.json'),JSON.stringify(Object.fromEntries([...keys].sort().map(k=>[k,k])),null,2)+'\n');
console.log(JSON.stringify({registered:keys.size,missing:missing.length}));
