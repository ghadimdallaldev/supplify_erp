import fs from 'fs'
import path from 'path'

const apiDir = path.resolve('apps/web/src/services/api')
const endpointsDir = path.join(apiDir, 'endpoints')

function fixPaths(content, depth) {
  const lib = '../'.repeat(depth) + 'lib'
  const types = '../'.repeat(depth) + 'types'
  const features = '../'.repeat(depth) + 'features'
  return content
    .replace(/from '\.\.\/lib\//g, `from '${lib}/`)
    .replace(/from '\.\.\/\.\.\/lib\//g, `from '${lib}/`)
    .replace(/from '\.\.\/\.\.\/\.\.\/lib\//g, `from '${lib}/`)
    .replace(/from '\.\.\/types'/g, `from '${types}'`)
    .replace(/from '\.\.\/\.\.\/types'/g, `from '${types}'`)
    .replace(/from '\.\.\/\.\.\/\.\.\/types'/g, `from '${types}'`)
    .replace(/import\('\.\.\/types'\)/g, `import('${types}')`)
    .replace(/import\('\.\.\/\.\.\/types'\)/g, `import('${types}')`)
    .replace(/import\('\.\.\/lib\//g, `import('${lib}/`)
    .replace(/import\('\.\.\/\.\.\/lib\//g, `import('${lib}/`)
    .replace(/import\('\.\.\/features\//g, `import('${features}/`)
    .replace(/import\('\.\.\/\.\.\/features\//g, `import('${features}/`)
}

const basePath = path.join(apiDir, 'base.ts')
fs.writeFileSync(basePath, fixPaths(fs.readFileSync(basePath, 'utf8'), 2))

for (const file of fs.readdirSync(endpointsDir)) {
  if (!file.endsWith('.ts')) continue
  let content = fs.readFileSync(path.join(endpointsDir, file), 'utf8')
  // Remove duplicate LegalAcceptancePayload import (lib block includes it)
  const legalImport = "import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'\n"
  const first = content.indexOf(legalImport)
  if (first >= 0) {
    const second = content.indexOf(legalImport, first + 1)
    if (second >= 0) {
      content = content.slice(0, second) + content.slice(second + legalImport.length)
    }
  }
  fs.writeFileSync(path.join(endpointsDir, file), fixPaths(content, 3))
}

console.log('Fixed API import paths')
