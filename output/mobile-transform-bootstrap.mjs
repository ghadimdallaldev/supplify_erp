import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation';
const source = 'C:/myProjects/supplify-mobile';
fs.mkdirSync(root, { recursive: true });
if (!fs.existsSync(path.join(root, 'baseline'))) {
  fs.cpSync(path.join(source, 'src'), path.join(root, 'baseline/src'), { recursive: true });
  for (const name of ['package.json', 'app.json', 'App.tsx', 'eas.json']) {
    fs.copyFileSync(path.join(source, name), path.join(root, 'baseline', name));
  }
  fs.cpSync(path.join(root, 'baseline'), path.join(root, 'staged'), { recursive: true });
}
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? walk(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name]);
}
const files = walk(path.join(root, 'baseline/src'));
const inventory = files.filter(p => /Screens?(\.web)?\.tsx$/.test(p) && !p.includes('__tests__'))
  .map(file => ({ file, status: 'pending', before: crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'baseline/src', file))).digest('hex') }));
fs.writeFileSync(path.join(root, 'inventory.json'), JSON.stringify(inventory, null, 2));
console.log(JSON.stringify({ root, files: files.length, screenFiles: inventory.length }));
