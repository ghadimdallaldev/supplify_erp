#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, '../src/routes')

const testFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.routes.test.js'))

testFiles.forEach((testFile) => {
  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')
  let changed = false

  // Ensure db.js mock exports query function
  if (
    content.includes("vi.mock('../lib/db.js');") &&
    !content.includes("vi.mock('../lib/db.js', () =>")
  ) {
    content = content.replace(
      /vi\.mock\('\.\.\/lib\/db\.js'\);?/g,
      `vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: {},
}));`
    )
    changed = true
  }

  // Replace db.query = vi.fn() with proper vi.mocked(query) pattern
  const dbQueryPattern = /db\.query\s*=\s*vi\.fn\(\)/g
  if (dbQueryPattern.test(content)) {
    // Replace in test functions
    content = content.replace(
      /it\(['"][^'"]+['"],\s*async\s*\(\)\s*=>\s*\{[\s\S]*?db\.query\s*=\s*vi\.fn\(\)/g,
      (match) => {
        if (match.includes('const { query } = await import')) {
          return match // Already has proper import
        }
        return match.replace(
          /db\.query\s*=\s*vi\.fn\(\)/,
          `const { query } = await import('../lib/db.js');
    vi.mocked(query)`
        )
      }
    )
    changed = true
  }

  // Replace db.query chained calls
  content = content.replace(
    /db\.query\s*=\s*vi\.fn\(\)\s*\.mockResolvedValue/g,
    `const { query } = await import('../lib/db.js');
    vi.mocked(query).mockResolvedValue`
  )

  content = content.replace(
    /db\.query\s*=\s*vi\.fn\(\)\s*\.mockResolvedValueOnce/g,
    `const { query } = await import('../lib/db.js');
    vi.mocked(query).mockResolvedValueOnce`
  )

  content = content.replace(
    /db\.query\s*=\s*vi\.fn\(\)\s*\.mockRejectedValue/g,
    `const { query } = await import('../lib/db.js');
    vi.mocked(query).mockRejectedValue`
  )

  if (changed) {
    fs.writeFileSync(testPath, content)
    console.log(`Fixed ${testFile}`)
  } else {
    console.log(`Skipped ${testFile} - no changes needed`)
  }
})

console.log(`\nProcessed ${testFiles.length} test files`)
