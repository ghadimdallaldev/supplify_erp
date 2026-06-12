/**
 * Wave 3 API split — run from repo root: node scripts/wave3-split.mjs
 */
import fs from 'fs'
import path from 'path'

const root = path.resolve('apps/web/src')
const apiPath = path.join(root, 'services/api.ts')
const raw = fs.readFileSync(apiPath, 'utf8').replace(/\r\n/g, '\n')
const lines = raw.split('\n')

const createApiIdx = lines.findIndex((l) => l.startsWith('export const api = createApi'))
const endpointsOpenIdx = lines.findIndex((l) => l.includes('endpoints: (builder) => ({'))
const endpointsCloseIdx = lines.findIndex(
  (l, i) => i > endpointsOpenIdx && l === '  }),' && lines[i + 1]?.trim() === '})'
)
const exportIdx = lines.findIndex((l) => l.startsWith('export const {'))
const orderHelperStart = lines.findIndex((l) => l.startsWith('type OrderDetailCache'))
const typesImportEnd = lines.findIndex((l) => l === "} from '../types'")
const typesImportStart = lines.lastIndexOf('import type {', typesImportEnd)
const tagTypesStart = lines.findIndex((l) => l.trim() === 'tagTypes: [')
const tagTypesEnd = lines.findIndex((l, i) => i > tagTypesStart && l.trim() === '],')

const hookExportBlock = lines.slice(exportIdx).join('\n')

// base.ts = lib imports (before type block) + runtime helpers (after type block, before order helpers)
const libImportEnd = typesImportStart
const baseTs = `${lines.slice(0, libImportEnd).join('\n')}
${lines.slice(typesImportEnd + 2, orderHelperStart).join('\n')}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithUnwrap as any,
${lines.slice(tagTypesStart, tagTypesEnd + 1).join('\n')}
  keepUnusedDataFor: 120,
  refetchOnFocus: false,
  endpoints: () => ({}),
})
`

const typeImportBlock = lines
  .slice(typesImportStart, typesImportEnd + 1)
  .join('\n')
  .replace("from '../types'", "from '../../types'")

const legalLine = lines.find((l) => l.includes("from '../lib/legalDocuments'"))
const legalDocBlock = legalLine
  ? legalLine.replace("from '../lib/legalDocuments'", "from '../../lib/legalDocuments'")
  : ''

const libImportsBlock = lines
  .slice(0, libImportEnd)
  .join('\n')
  .replace(/\.\.\//g, '../../')

const orderHelpers = lines.slice(orderHelperStart, createApiIdx).join('\n')
const endpointBody = lines.slice(endpointsOpenIdx + 1, endpointsCloseIdx)

function lineIndex(sub, skip = 0) {
  let n = -1
  for (let i = 0; i < endpointBody.length; i++) {
    if (endpointBody[i].includes(sub)) {
      n++
      if (n === skip) return i
    }
  }
  return -1
}

const sections = [
  { file: 'auth', find: '// Auth endpoints' },
  { file: 'products', find: '// Product endpoints' },
  { file: 'orders', find: '// Order endpoints', helpers: orderHelpers },
  { file: 'suppliers', find: '// Supplier endpoints' },
  { file: 'restaurants', find: '// Restaurant endpoints' },
  { file: 'prices', find: '// Price endpoints' },
  { file: 'inventory', find: '// Inventory endpoints' },
  { file: 'warehouses', find: '// Warehouse endpoints' },
  { file: 'dashboard', find: '// Admin endpoints' },
  { file: 'files', find: '// File endpoints' },
  { file: 'chat', find: '// Chat endpoints' },
  { file: 'restaurantInventory', find: '// Restaurant Inventory endpoints' },
  { file: 'receiving', find: '// Receiving endpoints' },
  { file: 'quickLists', find: '// Quick Lists endpoints' },
  { file: 'finance', find: '// Restaurant Finance endpoints' },
  { file: 'branches', find: 'getBranches:', anchor: 'endpoint' },
  { file: 'notifications', find: '// Notification endpoints', skip: 1 },
  { file: 'public', find: '// Public reservation portal' },
  { file: 'staffPortal', find: '// Staff self-service portal' },
  { file: 'reports', find: '// Reports' },
  { file: 'disputes', find: '// Disputes' },
  { file: 'creditNotes', find: '// Credit notes' },
  { file: 'promotions', find: '// Promotions' },
  { file: 'contractPricing', find: '// Contract pricing' },
  { file: 'reviews', find: '// Reviews' },
  { file: 'tenantAudit', find: '// Tenant audit log' },
  { file: 'amendments', find: '// Order amendments' },
  { file: 'push', find: '// Web push' },
  { file: 'billing', find: '// Subscription endpoints' },
  { file: 'admin', find: '// Admin Dashboard endpoints' },
  { file: 'impersonation', find: '// Impersonation (admin' },
]

function sectionStart(section) {
  if (section.anchor === 'endpoint') {
    const idx = endpointBody.findIndex((l) => l.includes(section.find))
    return idx >= 0 ? Math.max(0, idx - 1) : -1
  }
  return lineIndex(section.find, section.skip ?? 0)
}

const apiDir = path.join(root, 'services/api')
const endpointsDir = path.join(apiDir, 'endpoints')
fs.mkdirSync(endpointsDir, { recursive: true })
fs.writeFileSync(path.join(apiDir, 'base.ts'), baseTs)

const written = []
for (let s = 0; s < sections.length; s++) {
  const section = sections[s]
  const start = sectionStart(section)
  if (start < 0) {
    console.warn(`Section not found: ${section.file} (${section.find})`)
    continue
  }
  let end = endpointBody.length
  for (let n = s + 1; n < sections.length; n++) {
    const nextStart = sectionStart(sections[n])
    if (nextStart > start) {
      end = nextStart
      break
    }
  }

  let body = endpointBody.slice(start, end).join('\n').trimEnd()
  if (section.anchor !== 'endpoint') {
    body = body.replace(/^\s*\/\/[^\n]*\n?/, '')
  }

  const content = `import { api } from '../base'
${legalDocBlock}
${typeImportBlock}
${libImportsBlock}

${section.helpers ? `${section.helpers}\n` : ''}export const ${section.file}Api = api.injectEndpoints({
  endpoints: (builder) => ({
${body}
  }),
})
`

  fs.writeFileSync(path.join(endpointsDir, `${section.file}.ts`), content)
  written.push(section.file)
  console.log(`Wrote endpoints/${section.file}.ts`)
}

const indexTs = `${written.map((f) => `import './endpoints/${f}'`).join('\n')}
import '../staffApi'
import '../reservationsApi'

export { api } from './base'

${hookExportBlock}
`

fs.writeFileSync(path.join(apiDir, 'index.ts'), indexTs)
fs.writeFileSync(apiPath, "export * from './api/index'\n")
console.log(`Done: ${written.length} endpoint modules`)
