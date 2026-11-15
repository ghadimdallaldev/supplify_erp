import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
const repos=['supplify_erp','supplify-mobile','supplify-mobile-ios']
const results=[]
function git(repo,args){const r=spawnSync('git',args,{cwd:`C:/myProjects/${repo}`,encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.stdout||'Git verification failed');return r.stdout.trim()}
for(const repo of repos){
 const heads=Object.fromEntries(['dev','preprod','prod'].map(branch=>[branch,git(repo,['rev-parse',`origin/${branch}`])]))
 git(repo,['merge-base','--is-ancestor','origin/dev','origin/preprod'])
 git(repo,['merge-base','--is-ancestor','origin/preprod','origin/prod'])
 const differences=git(repo,['diff','--name-only','origin/preprod','origin/prod']).split('\n').filter(Boolean)
 if(differences.some(file=>file!=='README.md'))throw new Error('Unverified production runtime differences')
 results.push({repository:repo,heads,promotionAncestry:true,productionRuntimeMatchesPreprod:true,localDevMatchesRemote:git(repo,['rev-parse','HEAD'])===heads.dev,remainingWorkingTree:git(repo,['status','--short'])})
}
const nativePaths=git('supplify-mobile',['diff-tree','--no-commit-id','--name-only','-r','origin/dev','--','src']).split('\n').filter(Boolean)
let checked=0
for(const branch of ['dev','preprod','prod']){
 const trees=['supplify-mobile','supplify-mobile-ios'].map(repo=>new Map(git(repo,['ls-tree','-r',`origin/${branch}`,'src']).split('\n').map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]]})))
 for(const file of nativePaths){if(branch!=='dev'&&/\.test\.tsx?$/.test(file))continue;if(trees[0].get(file)!==trees[1].get(file))throw new Error(`Native mismatch: ${branch}/${file}`);checked++}
}
fs.writeFileSync('output/all-env-release-2026-11-14/git-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),repositories:results,nativeFileComparisons:checked},null,2))
console.log(JSON.stringify({repositories:results.map(({remainingWorkingTree,...rest})=>rest),nativeFileComparisons:checked}))
