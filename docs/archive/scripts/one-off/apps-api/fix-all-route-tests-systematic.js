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

  // Fix db.query to use vi.mocked(query) pattern
  const dbQueryPattern = /db\.query\s*=\s*vi\.fn\(\)/g
  if (dbQueryPattern.test(content)) {
    // Replace db.query = vi.fn() patterns with proper mocked query
    content = content.replace(
      /const\s+app\s*=\s*express\(\);/g,
      `import * as db from '../lib/db.js';\nconst { query } = db;\nconst app = express();`
    )

    // Replace db.query = vi.fn() with vi.mocked(query)
    content = content.replace(
      /db\.query\s*=\s*vi\.fn\(\)/g,
      "const { query } = await import('../lib/db.js'); vi.mocked(query)"
    )

    // Replace db.query chained calls
    content = content.replace(
      /db\.query\s*=\s*vi\.fn\(\)/g,
      "const { query } = await import('../lib/db.js'); vi.mocked(query)"
    )
  }

  // Ensure userData has email for routes that need it
  content = content.replace(/req\.userData\s*=\s*\{[^}]*id:[^}]*\}/g, (match) => {
    if (!match.includes('email')) {
      return match.replace(/\{([^}]+)\}/, "{ $1, email: 'test@example.com' }")
    }
    return match
  })

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${testFile}`)
})

console.log(`\nProcessed ${testFiles.length} test files`)
