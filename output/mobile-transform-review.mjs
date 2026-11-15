import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
for(const root of ['C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios']){
 const git=async(...args)=>(await run('git',['-C',root,...args],{windowsHide:true,maxBuffer:8*1024*1024})).stdout;
 const branch=(await git('branch','--show-current')).trim();
 const stat=await git('diff','--stat');fs.writeFileSync('output/mobile-transformation/'+root.split('/').pop()+'-diff-stat.txt',stat);
 let diffErrors=[];try{await git('diff','--check');}catch(error){diffErrors=(error.stdout+'\n'+error.stderr).split('\n').filter(Boolean);}
 console.log(JSON.stringify({root,branch,diffErrors,summary:stat.trim().split('\n').at(-1)}));if(diffErrors.length)process.exitCode=1;
}
