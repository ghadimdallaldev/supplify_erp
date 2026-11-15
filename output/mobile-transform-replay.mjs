import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const base = 'C:/myProjects/supplify_erp/output/mobile-transformation';
function restore(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) restore(path.join(dir,entry.name),relative+'/');
    else {
      const target = path.join(base,'staged',relative);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,fs.readFileSync(path.join(dir,entry.name),'utf8').replaceAll('\r\n','\n'));
    }
  }
}
restore(path.join(base,'baseline'));
for (const file of ['foundation','navigation','homes','detail']) {
  const result = spawnSync(process.execPath,['output/mobile-transform-'+file+'.mjs'],{cwd:'C:/myProjects/supplify_erp',stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
fs.writeFileSync(path.join(base,'staged/src/i18n/index.ts'),"export * from './runtime'\n");
console.log('Normalized baseline and staged changes replayed');
