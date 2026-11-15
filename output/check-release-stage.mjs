import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const folder='output/all-env-release-2026-11-14'
mkdirSync(folder,{recursive:true})
const cwd=process.cwd()
const run=(command,args,root=cwd)=>{const r=spawnSync(command,args,{cwd:root,windowsHide:true,encoding:'utf8',shell:command.endsWith('.cmd'),maxBuffer:12*1024*1024});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout}
const staged=run('git',['diff','--cached','--name-only','-z']).split('\0').filter(Boolean)
if(staged.some(name=>/^output\/|^docs\/marketing\/|^scripts\/horeca\/|\.env(?:\.|$)|\.(?:jks|keystore|pem|p12)$/.test(name)))throw new Error('Unexpected private/generated/marketing file staged')
const source=staged.filter(name=>/\.(js|jsx|ts|tsx|json|css|md|mjs)$/.test(name))
writeFileSync(folder+'/source-commit-message.txt','fix: harden pilot workflows and iPad guest experience\n')
writeFileSync(folder+'/mobile-commit-message.txt','fix: isolate pilot sessions and align deals and checkout\n')
const format=spawnSync('pnpm.cmd',['exec','prettier','--check',...source],{cwd,windowsHide:true,encoding:'utf8',shell:true,maxBuffer:4*1024*1024})
writeFileSync(folder+'/staged-format.log',format.stdout+format.stderr)
if(format.status!==0)throw new Error('Staged formatting check failed; inspect staged-format.log')
run('pnpm.cmd',['exec','commitlint','--edit',folder+'/source-commit-message.txt'])
run('pnpm.cmd',['exec','commitlint','--edit',folder+'/mobile-commit-message.txt'])
const native='C:/myProjects/supplify-mobile', ios='C:/myProjects/supplify-mobile-ios'
const paths=run('git',['diff','--cached','--name-only','-z'],native).split('\0').filter(name=>name.startsWith('src/'))
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const mismatches=paths.filter(name=>hash(native+'/'+name)!==hash(ios+'/'+name))
if(mismatches.length)throw new Error('Native parity mismatch: '+mismatches.join(', '))
writeFileSync(folder+'/staged-verification.json',JSON.stringify({erpFiles:staged.length,formattedFiles:source.length,nativeSharedFiles:paths.length,nativeMismatches:mismatches,checkedAt:new Date().toISOString()},null,2))
console.log(JSON.stringify({erpFiles:staged.length,format:'pass',commitlint:'pass',nativeSharedFiles:paths.length,nativeMismatches:mismatches}))
