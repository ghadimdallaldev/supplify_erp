import fs from 'node:fs';
const name=process.argv[2];if(!/^[a-z0-9-]+$/.test(name??''))throw Error('Bad capture name');
const source=fs.readFileSync(`output/mobile-transformation/android/${name}.xml`,'utf8');
const rows=[...source.matchAll(/<node\s[^>]+/g)].map(([node])=>{const get=name=>new RegExp(name+'="([^"]*)"').exec(node)?.[1];return{text:get('text'),description:get('content-desc'),bounds:get('bounds'),clickable:get('clickable')};}).filter(row=>row.text||row.description);
console.log(JSON.stringify(rows,null,2));
