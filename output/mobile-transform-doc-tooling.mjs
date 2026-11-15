import fs from 'node:fs';
import path from 'node:path';
const roots=['C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios'];
for(const root of roots){
 if(fs.realpathSync(root).replaceAll('\\','/').toLowerCase()!==root.toLowerCase())throw Error('Unexpected root');
 for(const file of ['README.md','docs/mobile/MOBILE_SETUP.md','docs/mobile/MOBILE_QA_CHECKLIST.md','docs/mobile/MOBILE_PARITY_CHECKLIST.md']){
  const target=path.join(root,file);let text=fs.readFileSync(target,'utf8');
  text=text.replaceAll('npm test -- --runInBand','pnpm exec jest --runInBand').replaceAll('npm test','pnpm test').replaceAll('npm install','pnpm install --frozen-lockfile').replaceAll('npm start','pnpm start').replaceAll('npm run ','pnpm ').replaceAll('npx expo-doctor','pnpm dlx expo-doctor').replaceAll('npx eas-cli','pnpm dlx eas-cli');
  if(file==='README.md'&&!text.includes('Pinned package manager:'))text=text.replace(/(^# .+\r?\n)/,'$1\nPinned package manager: `pnpm@8.15.9`; retain `pnpm-lock.yaml` as the only dependency lockfile.\n');
  fs.writeFileSync(target,text);
 }
 const target=path.join(root,'docs/operations/branching.md');let text=fs.readFileSync(target,'utf8');
 if(!text.includes('The dependency lockfile is'))text=text.replace('## What the prune script removes', 'The dependency lockfile is `pnpm-lock.yaml`; EAS and `packageManager` pin pnpm 8.15.9. Promotion synchronizes `app.config.js` and `eas.json` as runtime configuration. Pruning regenerates lockfile metadata after removing development dependencies. Do not reintroduce `package-lock.json`.\n\n## What the prune script removes');
 fs.writeFileSync(target,text);
 const p=path.join(root,'package.json');const pkg=JSON.parse(fs.readFileSync(p,'utf8'));pkg.scripts.doctor='pnpm dlx expo-doctor';fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n');
 console.log(JSON.stringify({root,updated:'pnpm setup, QA, release workflow'}));
}
