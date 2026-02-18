/**
 * Fails if any feature in feature-inventory.yml has no test files assigned.
 * Run: node tests/scripts/check-coverage-map.mjs (or pnpm test:coverage-map)
 * Uses simple YAML parsing (no external yaml dep).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const INVENTORY_PATH = path.join(ROOT, 'tests', 'feature-inventory.yml')

function parseInventory(raw: string): { id: string; name: string; test_files: string[] }[] {
  const features: { id: string; name: string; test_files: string[] }[] = []
  const lines = raw.split(/\r?\n/)
  let current: { id: string; name: string; test_files: string[] } | null = null
  for (const line of lines) {
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/)
    const nameMatch = line.match(/^\s+name:\s*(.+)$/)
    const fileMatch = line.match(/^\s+-\s+(e2e\/.+|api\/.+)$/)
    if (idMatch) {
      if (current) features.push(current)
      current = { id: idMatch[1].trim(), name: '', test_files: [] }
    } else if (current && nameMatch) {
      current.name = nameMatch[1].trim()
    } else if (current && fileMatch) {
      current.test_files.push(fileMatch[1].trim())
    }
  }
  if (current) features.push(current)
  return features
}

function main(): void {
  const raw = fs.readFileSync(INVENTORY_PATH, 'utf8')
  const features = parseInventory(raw)
  if (features.length === 0) {
    console.error('feature-inventory.yml must have at least one feature with id, name, test_files')
    process.exit(1)
  }

  const missing: string[] = []
  for (const f of features) {
    const files = f.test_files
    if (!files || files.length === 0) {
      missing.push(`${f.id} (${f.name})`)
    } else {
      const resolved = files.map((file) => path.join(ROOT, 'tests', file))
      const notFound = resolved.filter((p) => !fs.existsSync(p))
      if (notFound.length > 0) {
        missing.push(`${f.id}: missing files: ${notFound.join(', ')}`)
      }
    }
  }

  if (missing.length > 0) {
    console.error('Coverage map check failed. Features with no or missing test files:')
    missing.forEach((m) => console.error('  -', m))
    process.exit(1)
  }

  console.log(`Coverage map OK: ${features.length} features have test files.`)
}

main()
