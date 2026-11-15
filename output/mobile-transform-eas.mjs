import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root='C:/myProjects/supplify-mobile';
const output='C:/myProjects/supplify_erp/output/mobile-transformation';
const cli='C:/Users/ghadi.mdallal/AppData/Roaming/npm/node_modules/eas-cli/bin/run';
const mode=process.argv[2]??'status';
const saved=path.join(output,'android-build.json');
const existing=fs.existsSync(saved)?JSON.parse(fs.readFileSync(saved,'utf8')):null;
if(mode!=='submit'&&!existing?.id)throw Error('No submitted build');
if(mode==='submit'&&existing?.id&&!['ERRORED','CANCELED'].includes(existing.status)&&!(existing.status==='FINISHED'&&process.argv.includes('--rebuild-after-fix')))throw Error('Build already submitted; inspect it before starting another build');
if(mode==='submit'&&existing?.id)fs.writeFileSync(path.join(output,'android-build-'+existing.id+'.json'),JSON.stringify(existing,null,2)+'\n');
const args=mode==='submit'?['build','--platform','android','--profile','demo','--non-interactive','--no-wait','--json','--freeze-credentials']:mode==='cancel'?['build:cancel',existing.id,'--non-interactive']:['build:view',existing.id,'--json'];
const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...args],{cwd:root,env:{...process.env,CI:'1',EAS_NO_VCS:'1',EAS_PROJECT_ROOT:root},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
fs.writeFileSync(path.join(output,'eas-'+mode+'.log'),result.stderr);
if(result.code!==0){console.error(result.stderr.slice(-3500));process.exit(result.code??1);}
if(mode==='cancel'){console.log(JSON.stringify({id:existing.id,cancellationRequested:true,output:(result.stdout+result.stderr).slice(-500)}));process.exit(0);}
const parsed=JSON.parse(result.stdout);const build=Array.isArray(parsed)?parsed[0]:parsed;
const record={id:build.id,status:build.status,error:build.error??null,profile:build.buildProfile,platform:build.platform,appVersion:build.appVersion,buildVersion:build.appBuildVersion,createdAt:build.createdAt,completedAt:build.completedAt,artifact:build.artifacts?.applicationArchiveUrl??build.artifacts?.buildUrl??null,buildUrl:'https://expo.dev/accounts/supplify-team/projects/supplify-mobile/builds/'+build.id,api:'https://api-dev.supplifyerp.com'};
if(record.profile!=='demo'||record.platform!=='ANDROID')throw Error('Unexpected build profile or platform');
fs.writeFileSync(saved,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
if(mode==='logs'||mode==='phases'){
 let all='';for(const url of build.logFiles??[]){const response=await fetch(url);all+=await response.text()+'\n';}
 fs.writeFileSync(path.join(output,'eas-build-'+build.id+'.log'),all);
 const lines=all.split('\n');
 if(mode==='phases'){
  const rows=lines.flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}});
  console.log(JSON.stringify(rows.filter(row=>/^(Start phase|End phase|Android Bundl|BUILD SUCCESSFUL|BUILD FAILED)/.test(row.msg??'')).map(row=>({phase:row.phase,msg:row.msg})).slice(-25)));
  console.log(JSON.stringify({recentCompilation:rows.filter(row=>row.phase==='RUN_GRADLEW'&&/^(> Task|BUILD |FAILURE)/.test(row.msg??'')).slice(-6).map(row=>row.msg)}));
 }else{
  const hits=[];for(let i=0;i<lines.length;i++)if(/error|fail|ERR_|lockfile|pnpm|not found|Cannot/i.test(lines[i]))hits.push(lines.slice(Math.max(0,i-1),Math.min(lines.length,i+3)).join('\n'));
  console.log(hits.join('\n').slice(-15000));
 }
}
