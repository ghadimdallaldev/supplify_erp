#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, '../src/routes')

const testFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.routes.test.js'))

// Mock implementations that need to be defined before route imports
const mockSetup = `
vi.mock('../lib/db.js');
vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.userData = req.userData || { id: 'user-1', role: 'RESTAURANT', email: 'test@example.com' };
    next();
  }),
  requireRole: vi.fn(() => (req, res, next) => next()),
  requireOwnership: vi.fn(() => (req, res, next) => next()),
  upsertUser: vi.fn(),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
}));
vi.mock('../lib/subscription.js');
vi.mock('../lib/logger.js');
vi.mock('../middlewares/errorHandler.js');
`

testFiles.forEach((testFile) => {
  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')

  // Check if mocks are already at the top
  if (content.includes("vi.mock('../lib/rbac.js', () => ({")) {
    console.log(`Skipping ${testFile} - already has proper mocks`)
    return
  }

  // Find where imports start
  const importMatch = content.match(/^(import\s+.*?;?\s*?\n)+/m)
  if (!importMatch) {
    console.log(`Skipping ${testFile} - no imports found`)
    return
  }

  // Find where route import happens
  const routeImportMatch = content.match(/import\s+.*?from\s+['"]\.\/.*\.routes\.js['"];?\s*/)
  if (!routeImportMatch) {
    console.log(`Skipping ${testFile} - no route import found`)
    return
  }

  // Split content at route import
  const routeImportIndex = content.indexOf(routeImportMatch[0])
  const beforeRouteImport = content.substring(0, routeImportIndex)
  const afterRouteImport = content.substring(routeImportIndex)

  // Find last vi.mock before route import
  const lastMockMatch = beforeRouteImport.match(/(vi\.mock\([^;]+;?\s*)+/g)

  // If we have mocks, replace them, otherwise add them
  if (lastMockMatch) {
    const lastMock = lastMockMatch[lastMockMatch.length - 1]
    const lastMockIndex = beforeRouteImport.lastIndexOf(lastMock)
    const beforeMocks = beforeRouteImport.substring(0, lastMockIndex)
    const afterMocks = beforeRouteImport.substring(lastMockIndex + lastMock.length)

    // Replace old mocks with new ones
    content = beforeMocks + mockSetup + afterMocks + afterRouteImport
  } else {
    // Add mocks right after imports but before route import
    const importsEnd = beforeRouteImport.match(/(import\s+.*?;?\s*?\n)+/)?.[0]
    if (importsEnd) {
      const importsEndIndex = beforeRouteImport.indexOf(importsEnd) + importsEnd.length
      const beforeImports = beforeRouteImport.substring(0, importsEndIndex)
      const afterImports = beforeRouteImport.substring(importsEndIndex)

      content = beforeImports + mockSetup + '\n' + afterImports + afterRouteImport
    }
  }

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${testFile}`)
})

console.log(`\nProcessed ${testFiles.length} test files`)
