import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root='C:/myProjects/supplify-mobile';
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript');
const pkg=require('./package.json');
const declared={...pkg.dependencies,...pkg.devDependencies};
const imports=new Map();
function record(value,file){
 if(!value||value.startsWith('.')||value.startsWith('node:'))return;
 const name=value.startsWith('@')?value.split('/').slice(0,2).join('/'):value.split('/')[0];
 if(!imports.has(name))imports.set(name,new Set());
 imports.get(name).add(path.relative(root,file));
}
function scan(file){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))record(node.moduleSpecifier.text,file);
  if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))record(node.arguments[0].text,file);
  ts.forEachChild(node,visit);
 }
 visit(source);
}
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.[cm]?[jt]sx?$/.test(e.name))scan(p);}}
walk(path.join(root,'src'));for(const file of ['App.tsx','index.ts','app.config.js','babel.config.js','metro.config.js','jest.setup.js','jest.resolver.js'])if(fs.existsSync(path.join(root,file)))scan(path.join(root,file));
const undeclared=[...imports].filter(([name])=>!declared[name]).map(([name,files])=>{let installed=null;try{installed=require(name+'/package.json').version;}catch{}return{name,installed,files:[...files]};});
console.log(JSON.stringify({undeclared},null,2));
