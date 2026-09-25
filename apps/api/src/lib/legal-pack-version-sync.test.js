import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LEGAL_PACK_VERSION } from './legal-documents.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const legalPack = JSON.parse(readFileSync(path.join(repoRoot, 'legal-pack-version.json'), 'utf8'))
const webLegalTs = readFileSync(path.join(repoRoot, 'apps/web/src/lib/legalDocuments.ts'), 'utf8')

describe('legal pack version sync', () => {
  it('API constant matches legal-pack-version.json', () => {
    expect(LEGAL_PACK_VERSION).toBe(legalPack.version)
  })

  it('web legalDocuments imports the same legal-pack-version.json', () => {
    expect(webLegalTs).toContain("from '../../../../legal-pack-version.json'")
  })
})
