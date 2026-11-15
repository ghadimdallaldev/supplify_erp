import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const stage = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged';
const roots = ['C:/myProjects/supplify-mobile', 'C:/myProjects/supplify-mobile-ios'];
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? walk(path.join(dir, e.name), prefix + e.name + '/') : [prefix + e.name]);
}
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const changed = [];
for (const root of roots) {
  if (fs.realpathSync(root).replaceAll('\\', '/').toLowerCase() !== root.toLowerCase()) throw Error('Unexpected mobile path');
  let count = 0;
  for (const file of [...walk(path.join(stage, 'src')).map(p => 'src/' + p), 'App.tsx', 'app.json']) {
    const target = path.join(root, file);
    const content = fs.readFileSync(path.join(stage, file));
    if (fs.existsSync(target) && digest(content) === digest(fs.readFileSync(target))) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    changed.push({ root, file }); count++;
  }
  console.log(JSON.stringify({ root, updated: count }));
}
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/synced.json', JSON.stringify(changed, null, 2));
