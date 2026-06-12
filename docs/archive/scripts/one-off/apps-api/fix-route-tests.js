#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, '../src/routes')

const routeMap = {
  branches: 'branches',
  warehouses: 'warehouses',
  restaurants: 'restaurants',
  subscriptions: 'subscriptions',
  'restaurant-finance': 'restaurant-finance',
  'restaurant-inventory': 'restaurant-inventory',
  'restaurant-onboarding': 'restaurant-onboarding',
  'restaurant-pricing': 'restaurant-pricing',
  'quick-lists': 'quick-lists',
  receiving: 'receiving',
  inventory: 'inventory',
  prices: 'prices',
  'admin-dashboard': 'admin-dashboard',
}

const testFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.routes.test.js'))

testFiles.forEach((testFile) => {
  const routeFile = testFile.replace('.routes.test.js', '')
  const routePath = routeMap[routeFile] || routeFile

  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')

  // Fix req.user to req.userData
  content = content.replace(/req\.user\s*=/g, 'req.userData =')
  content = content.replace(/req\.user\s*\|\|/g, 'req.userData ||')
  content = content.replace(/req\.user\s*\)/g, 'req.userData)')
  content = content.replace(/req\.user\s*}/g, 'req.userData}')

  // Fix mockRequireAuth to set userData
  content = content.replace(
    /const mockRequireAuth = \(req, res, next\) => \{[\s\S]*?req\.user = req\.user \|\| \{ id: 'user-1', role: 'RESTAURANT' \};[\s\S]*?next\(\);[\s\S]*?\};/g,
    `const mockRequireAuth = async (req, res, next) => {
  req.userData = req.userData || { id: 'user-1', role: 'RESTAURANT' };
  next();
};`
  )

  // Fix URL paths (capitalized to lowercase)
  content = content.replace(
    new RegExp(`/api/${routePath.charAt(0).toUpperCase() + routePath.slice(1)}`, 'g'),
    `/api/${routePath}`
  )

  // Fix middleware setup
  content = content.replace(
    /app\.use\(\(req, res, next\) => \{[\s\S]*?req\.requestId = 'test-request-id';[\s\S]*?req\.user = \{ id: 'user-1', role: 'RESTAURANT' \};[\s\S]*?next\(\);[\s\S]*?\}\);/g,
    `app.use((req, res, next) => {
  req.requestId = 'test-request-id';
  req.userData = { id: 'user-1', role: 'RESTAURANT' };
  next();
});`
  )

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${testFile}`)
})

console.log(`\nFixed ${testFiles.length} test files`)
