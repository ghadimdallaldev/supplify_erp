import fs from 'node:fs'
import path from 'node:path'
import { execFileSync,spawnSync } from 'node:child_process'
const root=process.cwd()
const pnpm=path.resolve('node_modules/pnpm/bin/pnpm.cjs')
const manifests=[]
for (const repo of [root,'C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios']) {
  const status=execFileSync('git',['-C',repo,'status','--porcelain','-uall'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})
  const files=status.split(/\r?\n/).filter(Boolean).map((line)=>line.slice(3)).filter((file)=> /\.(js|ts|tsx|json|md)$/.test(file) && (repo!==root ? file.startsWith('src/') : file.startsWith('apps/api/') || file.startsWith('apps/web/') || /^(docs\/features\/ai-|docs\/mobile\/MOBILE_|docs\/architecture\/rbac-overview|docs\/operations\/READ_ONLY_ASSISTANCE_VERIFICATION_2026-11-14)/.test(file)))
  const paths=files.map((file)=>path.resolve(repo,file))
  const result=spawnSync(process.execPath,[pnpm,'exec','prettier','--write',...paths],{cwd:root,encoding:'utf8',env:{...process.env,FORCE_COLOR:'0'}})
  fs.writeFileSync(path.resolve('output',`readonly-format-${manifests.length}.log`),(result.stdout||'')+(result.stderr||''))
  manifests.push({repo,files})
  if (result.status) throw new Error(`Formatting failed in ${repo}: ${result.stderr}`)
  console.log(JSON.stringify({repo,formatted:files.length}))
}
fs.writeFileSync('output/readonly-change-manifest.json',JSON.stringify(manifests,null,2))
