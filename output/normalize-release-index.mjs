import { spawnSync } from 'node:child_process'
for (const cwd of ['C:/myProjects/supplify_erp','C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios']) {
  const run = args => { const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout }
  const paths=run(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean)
  run(['-c','core.autocrlf=true','add','--renormalize','--',...paths])
  const checked=run(['diff','--cached','--check'])
  console.log(JSON.stringify({repo:cwd,stagedFiles:paths.length,diffCheck:checked||'pass',stats:run(['diff','--cached','--shortstat']).trim()}))
}
