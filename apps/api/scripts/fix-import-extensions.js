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

  // Fix import statements - add .js extension if missing
  content = content.replace(/from\s+['"]\.\/([^'"]+)['"]/g, (match, p1) => {
    if (p1.endsWith('.js')) {
      return match // Already has .js
    }
    if (p1.includes('.routes')) {
      return `from './${p1}.js'`
    }
    return match
  })

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${testFile}`)
})

console.log(`\nFixed ${testFiles.length} test files`)
