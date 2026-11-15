import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const [name,tier]=process.argv.slice(2)
if(!['supplify_erp','supplify-mobile','supplify-mobile-ios'].includes(name)||!['preprod','prod'].includes(tier))throw new Error('Invalid promotion target')
const root='C:/myProjects/supplify_erp',repo=`C:/myProjects/${name}`
const folder=path.resolve(root,'.release-checkouts/all-env-20261114')
const checkout=path.resolve(folder,`${name}-${tier}`)
const resume=process.argv.includes('--resume')
if(!checkout.startsWith(folder+path.sep)||fs.existsSync(checkout)!==resume)throw new Error('Promotion checkout must be new, or explicitly resumed, inside the verified release folder')
fs.mkdirSync(folder,{recursive:true})
const token=spawnSync('gh',['auth','token','--user','ghadimdallaldev'],{encoding:'utf8',windowsHide:true})
if(token.status!==0)throw new Error('Owner authentication unavailable')
const env={...process.env,GH_TOKEN:token.stdout.trim(),HUSKY:'0'}
const git=(args,cwd=repo,allowFailure=false)=>{const r=spawnSync('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential',...args],{cwd,env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(r.status!==0&&!allowFailure)throw new Error(r.stderr||r.stdout);return r}
git(['fetch','origin','--prune'])
const source=tier==='prod'?'preprod':'dev',sourceRef=`origin/${source}`,baseRef=`origin/${tier}`
const sourceSha=git(['rev-parse',sourceRef]).stdout.trim(),baseSha=git(['rev-parse',baseRef]).stdout.trim()
const branch=`release/2026-11-14-${tier}-pilot-ipad`
if(!resume)git(['worktree','add','-b',branch,checkout,baseRef])
if(fs.realpathSync(checkout)!==fs.realpathSync(path.join(folder,`${name}-${tier}`)))throw new Error('Unexpected worktree path')
const merge=resume?{stdout:'Resumed prepared promotion',stderr:''}:git(['merge','--no-commit','--no-ff','-X','theirs',sourceRef],checkout,true)
const evidence=path.resolve(root,'output/all-env-release-2026-11-14')
fs.mkdirSync(evidence,{recursive:true})
fs.writeFileSync(path.join(evidence,`${name}-${tier}-merge.log`),merge.stdout+merge.stderr)
// The release policy synchronizes the source runtime tree before pruning.
// This is a fresh, isolated checkout; the user's working tree is not restored.
if(!resume)git(['restore',`--source=${sourceRef}`,'--staged','--worktree','--','.'],checkout)
const prune=fs.readFileSync(path.join(repo,'scripts/prune-release-tree.mjs'),'utf8')
fs.mkdirSync(path.join(checkout,'scripts'),{recursive:true})
fs.writeFileSync(path.join(checkout,'scripts/prune-release-tree.mjs'),prune)
const pruned=spawnSync('node',['scripts/prune-release-tree.mjs','--tier',tier],{cwd:checkout,env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})
fs.writeFileSync(path.join(evidence,`${name}-${tier}-prune.log`),pruned.stdout+pruned.stderr)
if(pruned.status!==0)throw new Error('Release pruning failed')
git(['add','-A'],checkout)
git(['diff','--cached','--check'],checkout)
if(git(['diff','--name-only','--diff-filter=U'],checkout).stdout.trim())throw new Error('Unresolved merge paths')
const files=git(['ls-files'],checkout).stdout.trim().split('\n')
if(files.some(file=>/^(docs|tests|\.github|output)\//.test(file)||/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(file)))throw new Error('Development files remain in runtime release')
const sourceTree=new Map(git(['ls-tree','-r',sourceRef]).stdout.trim().split('\n').map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]]}))
const stagedTree=new Map(git(['ls-files','--stage'],checkout).stdout.trim().split('\n').map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[1]]}))
if(name==='supplify_erp'){
 if(!files.includes('legal-pack-version.json')||!files.includes('apps/api/db/migrations/0232_consumer_checkout_idempotency.sql')||!files.includes('vendor/sheetjs/xlsx-0.20.3.tgz'))throw new Error('Required runtime build input missing')
 const expected=git(['ls-tree','-r','--name-only',sourceRef,'apps/api/db/migrations']).stdout.trim().split('\n')
 for(const file of expected){if(sourceTree.get(file)!==stagedTree.get(file))throw new Error('Migration mismatch: '+file)}
}
const runtime=name==='supplify_erp'?['apps/api/src','apps/web/src','deploy/keycloak/providers/email-otp']:['src']
for(const prefix of runtime){
 const expected=git(['ls-tree','-r','--name-only',sourceRef,prefix]).stdout.trim().split('\n').filter(Boolean)
 for(const file of expected){
  if(!files.includes(file))continue
  if(file==='apps/api/src/server.js')continue // release policy removes only the e2e registration
  if(sourceTree.get(file)!==stagedTree.get(file))throw new Error('Runtime mismatch: '+file)
 }
}
const committed=git(['commit','-m',`chore(release): promote ${source} repairs to ${tier}`],checkout)
const head=git(['rev-parse','HEAD'],checkout).stdout.trim()
const summary={repository:name,tier,source,sourceSha,baseSha,branch,head,checkout,runtimeFiles:files.length,createdAt:new Date().toISOString()}
fs.writeFileSync(path.join(evidence,`${name}-${tier}.json`),JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary))
