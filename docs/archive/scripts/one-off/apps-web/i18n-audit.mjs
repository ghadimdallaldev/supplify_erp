import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const enDir = path.join(__dirname, '../src/i18n/locales/en')
const arDir = path.join(__dirname, '../src/i18n/locales/ar')

function flat(o, p = '') {
  const rows = []
  for (const [k, v] of Object.entries(o || {})) {
    const key = p ? `${p}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(...flat(v, key))
    else rows.push([key, String(v)])
  }
  return rows
}

let total = 0
let same = 0
const byNs = {}

for (const f of fs.readdirSync(enDir).filter((x) => x.endsWith('.json'))) {
  const ns = f.replace('.json', '')
  const en = JSON.parse(fs.readFileSync(path.join(enDir, f), 'utf8'))
  const ar = JSON.parse(fs.readFileSync(path.join(arDir, f), 'utf8'))
  const ef = flat(en)
  const af = Object.fromEntries(flat(ar))
  let nsTotal = 0
  let nsSame = 0
  for (const [k, v] of ef) {
    nsTotal++
    total++
    if (af[k] === v) {
      nsSame++
      same++
    }
  }
  byNs[ns] = { total: nsTotal, same: nsSame, pct: Math.round((100 * nsSame) / nsTotal) }
}

console.log(`Total keys: ${total}, Identical en/ar: ${same} (${Math.round((100 * same) / total)}%)`)
for (const [ns, stats] of Object.entries(byNs).sort((a, b) => b[1].pct - a[1].pct)) {
  console.log(`${ns}: ${stats.same}/${stats.total} identical (${stats.pct}%)`)
}
