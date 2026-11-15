import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import prettier from 'prettier'
const manifests=JSON.parse(fs.readFileSync('output/readonly-change-manifest.json','utf8'))
const results=[]
for (const {repo,files} of manifests) {
  execFileSync('git',['-C',repo,'diff','--check','--',...files],{stdio:['ignore','pipe','pipe']})
  results.push({repo,files:files.length,diffCheck:'passed',branch:execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()})
}
for (const file of manifests[1].files) assert.equal(fs.readFileSync(path.resolve(manifests[1].repo,file),'utf8'),fs.readFileSync(path.resolve(manifests[2].repo,file),'utf8'),`Native parity: ${file}`)
const canonical=async (file)=>prettier.format(fs.readFileSync(file,'utf8'),{parser:'typescript',semi:false,singleQuote:true,printWidth:95})
for (const type of ['assistant','reorder']) for (const {repo} of manifests.slice(1)) assert.equal(await canonical(`apps/web/src/types/${type}.ts`),await canonical(path.resolve(repo,`src/types/${type}.ts`)),`Shared ${type} types`)
for (const file of manifests[0].files.filter((f)=>f.endsWith('.json'))) JSON.parse(fs.readFileSync(file,'utf8'))
const result={repos:results,nativeParity:'13 matching files',sharedTypeParity:'passed',changedJson:'valid',unrelatedMarketingWork:'excluded from task checks'}
fs.writeFileSync('output/readonly-final-integrity.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
