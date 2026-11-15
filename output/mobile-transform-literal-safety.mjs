import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ts=require('C:/myProjects/supplify_erp/node_modules/typescript');
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
let restored=0;
for(const file of walk(root).filter(p=>p.endsWith('.tsx')&&!p.includes('__tests__'))){let source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(n){if(ts.isCallExpression(n)&&/^(uiCopy|copy)$/.test(n.expression.getText(ast))&&n.arguments.length===1&&ts.isStringLiteralLike(n.arguments[0])){
  const p=n.parent;let machine=ts.isBinaryExpression(p)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind);
  if(ts.isArrayLiteralExpression(p))machine=true;
  if(ts.isCallExpression(p)&&ts.isPropertyAccessExpression(p.expression)&&['includes','startsWith','endsWith','replace','replaceAll','split'].includes(p.expression.name.text))machine=true;
  if(machine){edits.push({start:n.getStart(ast),end:n.end,text:n.arguments[0].getText(ast)});return;}
 }ts.forEachChild(n,visit)}visit(ast);edits.sort((a,b)=>b.start-a.start).forEach(e=>source=source.slice(0,e.start)+e.text+source.slice(e.end));if(edits.length){fs.writeFileSync(file,source);restored+=edits.length;}}
console.log(JSON.stringify({machineLiteralsPreserved:restored}));
