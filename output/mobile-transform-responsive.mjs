import fs from 'node:fs';
const source=fs.readFileSync('output/mobile-transform-all-screens.mjs','utf8');
const original="[{role:'RESTAURANT',width:390,locale:'en'},{role:'SUPPLIER',width:390,locale:'en'},{role:'DRIVER',width:390,locale:'en'},{role:'CONSUMER',width:390,locale:'en'},{role:'ADMIN',width:390,locale:'en'},{role:'PENDING',width:390,locale:'en'},{role:'STAFF_PORTAL',width:390,locale:'en'},{role:'RESTAURANT',width:1024,locale:'ar'}]";
if(!source.includes(original))throw Error('Harness changed');
const next=source.replace(original,"[{role:'RESTAURANT',width:360,locale:'en'},{role:'SUPPLIER',width:430,locale:'ar'},{role:'RESTAURANT',width:768,locale:'en'},{role:'SUPPLIER',width:1366,locale:'en'}]")
 .replace("output/mobile-transformation/screens'","output/mobile-transformation/responsive'")
 .replace('for(const route of routes){',"for(const route of routes.filter(route=>['Home','Dashboard','Fulfillment','Orders','More','Shop','Catalog','Cart','Reservations','CreateReservation','Inventory','Invoices','Reports','Dispatch','Chat','ChatThread'].includes(route.name))){")
 .replace('document.documentElement.scrollWidth>innerWidth','document.documentElement.scrollWidth>innerWidth||Array.from(document.querySelectorAll(\'[role="tab"]\')).some(tab=>{const rect=tab.getBoundingClientRect();return rect.width>0&&(rect.bottom>innerHeight+1||rect.left< -1||rect.right>innerWidth+1)})');
fs.writeFileSync('output/mobile-transform-responsive-generated.mjs',next);
await import('./mobile-transform-responsive-generated.mjs');
