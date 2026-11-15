import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';const require=createRequire(import.meta.url),ts=require('C:/myProjects/supplify_erp/node_modules/typescript');
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);let count=0;
for(const file of walk(root).filter(p=>p.endsWith('.tsx')&&!p.includes('__tests__'))){let source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],owners=new Set();function visit(n){
if(ts.isCallExpression(n)&&/^(React\.)?useMemo$/.test(n.expression.getText(ast))&&n.arguments[0]&&/\b(uiCopy|copy|t|assistantText)\(/.test(n.arguments[0].getText(ast))&&n.arguments[1]&&ts.isArrayLiteralExpression(n.arguments[1])&&!n.arguments[1].elements.some(e=>e.getText(ast)==='uiLocale')){
 let owner=n.parent;while(owner&&!ts.isFunctionDeclaration(owner))owner=owner.parent;
 if(owner?.body&&owner.body.getText(ast).includes('useUiLocale()')){const deps=n.arguments[1];edits.push({start:deps.end-1,end:deps.end-1,text:(deps.elements.length?', ':'')+'uiLocale'});owners.add(owner);count++;}
}ts.forEachChild(n,visit)}visit(ast);
for(const owner of owners){const body=owner.body;const offset=source.indexOf('useUiLocale()',body.getStart(ast));edits.push({start:offset,end:offset+'useUiLocale()'.length,text:'const uiLocale = useUiLocale()'});}
edits.sort((a,b)=>b.start-a.start).forEach(e=>source=source.slice(0,e.start)+e.text+source.slice(e.end));if(edits.length)fs.writeFileSync(file,source);
}
console.log(JSON.stringify({reactiveMemoDependencies:count}));
