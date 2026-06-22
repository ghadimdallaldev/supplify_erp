import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

for (const f of ['admin', 'common', 'navigation', 'auth', 'settings']) {
  const en = flatten(JSON.parse(readFileSync(join(root, 'en', `${f}.json`), 'utf8')));
  const ar = flatten(JSON.parse(readFileSync(join(root, 'ar', `${f}.json`), 'utf8')));
  let total = 0;
  let same = 0;
  for (const k of Object.keys(en)) {
    if (!(k in ar)) continue;
    total++;
    if (ar[k] === en[k]) same++;
  }
  console.log(`${f}: total=${total} translated=${total - same} same_as_en=${same}`);
}
