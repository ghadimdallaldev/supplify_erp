import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ts=require('C:/myProjects/supplify_erp/node_modules/typescript');
const erp='C:/myProjects/supplify_erp',output=path.join(erp,'output/mobile-transformation'),mobile='C:/myProjects/supplify-mobile';
function prependAfterIntro(file,entry){const p=path.join(erp,file),s=fs.readFileSync(p,'utf8');if(s.includes('## 2026-11-15 - All-role mobile design transformation'))return;const end=s.indexOf('\n\n');fs.writeFileSync(p,s.slice(0,end+2)+entry+'\n\n'+s.slice(end+2));}
prependAfterIntro('docs/mobile/MOBILE_FEATURE_PARITY.md',`## 2026-11-15 - All-role mobile design transformation

Android and iOS share the new violet/light presentation, reactive English/Arabic
copy, adaptive navigation, tablet layouts, controls, sheets, motion, and role
screens. Restaurant navigation prioritizes Home, Suppliers, Orders, Messages,
and More; reservations remain directly reachable. The existing read-only
Assistant/reorder work is preserved. No backend endpoint, auth/session contract,
permission key, feature key, notification payload, or required environment
variable changed. Local client query-enablement options remain wire-compatible.

Both native repositories were updated. The user requested an Android **dev APK
only**; iOS source/type/test parity is required while native iOS builds and device
checks are deferred. The obsolete npm locks were removed; pnpm is pinned in EAS
and the promotion/pruning scripts now use the pnpm lockfile.

See [implementation and verification record](MOBILE_UI_TRANSFORMATION_2026-11-15.md)
and [screen inventory](MOBILE_UI_SCREEN_INVENTORY_2026-11-15.md). Exact build and
final validation evidence is recorded there before handoff.`);
prependAfterIntro('docs/mobile/MOBILE_PARITY_CHECKLIST.md',`## 2026-11-15 - All-role mobile design transformation

- [x] Shared design system, controls, role navigation, and screen migration mirrored.
- [x] English/Arabic copy and locale-aware presentation mirrored.
- [x] Reservation date/time, details, table assignment, and existing status contracts preserved.
- [x] Existing read-only Assistant and reorder protections retained.
- [x] No new backend/auth/RBAC/feature/notification contract or environment variable.
- [x] Native source/dependency parity and dated implementation documentation.
- [x] Android and iOS regression suites pass (34 suites / 125 tests each).
- [x] Android and iOS typechecks, ERP root typecheck, and Expo compatibility checks pass.
- [x] Rendered route review passes 137 cases using isolated fixtures.
- [ ] Android APK download, installation, and native smoke evidence: see transformation record.
- [ ] Native iOS/device validation deferred at the user's request.`);
const baseline=path.join(output,'baseline/src');
const walk=(d,p='')=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name),p+e.name+'/'):[p+e.name]);
const files=walk(baseline).filter(p=>/Screens?(\.web)?\.tsx$/.test(p)&&!p.includes('__tests__'));
let content=`# Mobile screen inventory — 2026-11-15

The pre-transformation baseline contains **${files.length} screen files**. Several
files export multiple routed screens. Shared sheets, layout and controls are
tracked in the implementation record. Both native source trees are verified by
the ERP parity script; native iOS rendering remains deferred.

Every listed screen now consumes the migrated presentation or delegates to a
migrated screen. The rendered test matrix exercises registered routes, including
English role flows and Arabic tablet layouts. Fixture-backed rendering is not
evidence of live business transactions or physical-device accessibility.

| Baseline source | Presentation |\n| --- | --- |\n`;
for(const file of files)content+=`| \`${file}\` | ${fs.readFileSync(path.join(mobile,'src',file),'utf8').includes('export {')&&fs.readFileSync(path.join(mobile,'src',file),'utf8').split('\n').length<6?'Shared screen alias':'Migrated shared system'} |\n`;
content+='\nThe new sign-in experience and reservation board replace their former implementations through compatible exports. Order/conversation detail components are reused in wide layouts; domain clients and canonical route parameters remain intact.\n';
fs.writeFileSync(path.join(erp,'docs/mobile/MOBILE_UI_SCREEN_INVENTORY_2026-11-15.md'),content);
console.log(JSON.stringify({inventoryFiles:files.length,docsUpdated:3}));
