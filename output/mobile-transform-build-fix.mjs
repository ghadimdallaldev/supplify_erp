import fs from 'node:fs';import path from 'node:path';
const roots=['C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios'];
const output='C:/myProjects/supplify_erp/output/mobile-transformation';
for(const root of roots){
 if(fs.realpathSync(root).replaceAll('\\','/').toLowerCase()!==root.toLowerCase())throw Error('Unexpected repository root');
 const oldLock=path.join(root,'package-lock.json');
 if(fs.existsSync(oldLock)){fs.copyFileSync(oldLock,path.join(output,path.basename(root)+'-previous-package-lock.json'));fs.unlinkSync(oldLock);}
 const easPath=path.join(root,'eas.json'),eas=JSON.parse(fs.readFileSync(easPath,'utf8'));
 for(const profile of ['development','demo','preprod','production'])eas.build[profile].pnpm='8.15.9';
 fs.writeFileSync(easPath,JSON.stringify(eas,null,2)+'\n');
 const promotePath=path.join(root,'scripts/promote-release.mjs');
 let promote=fs.readFileSync(promotePath,'utf8').replaceAll('package-lock.json','pnpm-lock.yaml');
 promote=promote.replace("['src', 'App.tsx', 'index.ts', 'app.json', 'tsconfig.json']", "['src', 'App.tsx', 'index.ts', 'app.json', 'app.config.js', 'eas.json', 'tsconfig.json']");
 fs.writeFileSync(promotePath,promote);
 const prunePath=path.join(root,'scripts/prune-release-tree.mjs');let prune=fs.readFileSync(prunePath,'utf8');
 if(!prune.includes("from 'node:child_process'"))prune="import { execSync } from 'node:child_process'\n"+prune;
 prune=prune.replace("import { execSync } from 'node:child_process'\n#!/usr/bin/env node", "#!/usr/bin/env node\nimport { execSync } from 'node:child_process'");
 if(!prune.includes('packageManager: pkg.packageManager'))prune=prune.replace('    private: true,','    private: true,\n    packageManager: pkg.packageManager,');
 if(!prune.includes('pnpm install --lockfile-only'))prune=prune.replace('slimPackageJson()', 'slimPackageJson()');
 // The pruned manifest has no dev dependencies; regenerate only lock metadata for that manifest.
 const invocation=/^slimPackageJson\(\);?\s*$/m;
 if(!prune.includes('pnpm install --lockfile-only'))prune=prune.replace(invocation,"slimPackageJson()\nexecSync('pnpm install --lockfile-only --ignore-scripts', { cwd: ROOT, stdio: 'inherit' })");
 fs.writeFileSync(prunePath,prune);
 const historical=path.join(root,'docs/SUPPLIFY_MOBILE_V2_RESTYLE_SPEC.md');
 let spec=fs.readFileSync(historical,'utf8');
 if(!spec.includes('Superseded 2026-11-15'))fs.writeFileSync(historical,"> **Superseded 2026-11-15:** The approved all-role violet redesign replaces this five-screen green proposal. See the canonical [mobile transformation record](../../supplify_erp/docs/mobile/MOBILE_UI_TRANSFORMATION_2026-11-15.md).\n\n"+spec);
 console.log(JSON.stringify({root,packageManager:'pnpm 8.15.9',obsoleteLockRemoved:true}));
}
