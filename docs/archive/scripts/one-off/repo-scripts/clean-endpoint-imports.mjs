import fs from 'fs'
import path from 'path'

const endpointsDir = path.resolve('apps/web/src/services/api/endpoints')

for (const file of fs.readdirSync(endpointsDir)) {
  if (!file.endsWith('.ts')) continue
  let content = fs.readFileSync(path.join(endpointsDir, file), 'utf8')
  content = content.replace(
    /import \{ createApi, fetchBaseQuery \} from '@reduxjs\/toolkit\/query\/react'\n/,
    ''
  )
  const legal = "import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'\n"
  while (content.split(legal).length > 2) {
    const idx = content.lastIndexOf(legal)
    content = content.slice(0, idx) + content.slice(idx + legal.length)
  }
  fs.writeFileSync(path.join(endpointsDir, file), content)
}
console.log('Cleaned endpoint imports')
