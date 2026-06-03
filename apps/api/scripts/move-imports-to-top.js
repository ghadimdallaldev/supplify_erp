#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, '../src/routes')

const routeMap = {
  'admin-dashboard.routes.js': {
    export: 'default',
    path: 'admin-dashboard',
    varName: 'adminDashboardRoutes',
  },
  'branches.routes.js': { export: 'default', path: 'branches', varName: 'branchesRoutes' },
  'warehouses.routes.js': { export: 'default', path: 'warehouses', varName: 'warehousesRoutes' },
  'auth.routes.js': { export: 'authRoutes', path: 'auth', varName: 'authRoutes' },
  'products.routes.js': { export: 'productsRoutes', path: 'products', varName: 'productsRoutes' },
  'orders.routes.js': { export: 'ordersRoutes', path: 'orders', varName: 'ordersRoutes' },
  'chat.routes.js': { export: 'chatRoutes', path: 'chat', varName: 'chatRoutes' },
  'suppliers.routes.js': {
    export: 'suppliersRoutes',
    path: 'suppliers',
    varName: 'suppliersRoutes',
  },
  'files.routes.js': { export: 'filesRoutes', path: 'files', varName: 'filesRoutes' },
  'restaurants.routes.js': {
    export: 'restaurantsRoutes',
    path: 'restaurants',
    varName: 'restaurantsRoutes',
  },
  'quick-lists.routes.js': {
    export: 'quickListsRoutes',
    path: 'quick-lists',
    varName: 'quickListsRoutes',
  },
  'receiving.routes.js': {
    export: 'receivingRoutes',
    path: 'receiving',
    varName: 'receivingRoutes',
  },
  'invoices.routes.js': { export: 'invoicesRoutes', path: 'invoices', varName: 'invoicesRoutes' },
  'restaurant-finance.routes.js': {
    export: 'restaurantFinanceRoutes',
    path: 'restaurant-finance',
    varName: 'restaurantFinanceRoutes',
  },
  'restaurant-inventory.routes.js': {
    export: 'restaurantInventoryRoutes',
    path: 'restaurant-inventory',
    varName: 'restaurantInventoryRoutes',
  },
  'restaurant-onboarding.routes.js': {
    export: 'restaurantOnboardingRoutes',
    path: 'restaurant-onboarding',
    varName: 'restaurantOnboardingRoutes',
  },
  'restaurant-pricing.routes.js': {
    export: 'restaurantPricingRoutes',
    path: 'restaurant-pricing',
    varName: 'restaurantPricingRoutes',
  },
  'admin.routes.js': { export: 'adminRoutes', path: 'admin', varName: 'adminRoutes' },
  'subscriptions.routes.js': {
    export: 'subscriptionsRoutes',
    path: 'subscriptions',
    varName: 'subscriptionsRoutes',
  },
  'payments.routes.js': { export: 'paymentsRoutes', path: 'payments', varName: 'paymentsRoutes' },
  'notifications.routes.js': {
    export: 'notificationsRoutes',
    path: 'notifications',
    varName: 'notificationsRoutes',
  },
  'inventory.routes.js': {
    export: 'inventoryRoutes',
    path: 'inventory',
    varName: 'inventoryRoutes',
  },
  'prices.routes.js': { export: 'pricesRoutes', path: 'prices', varName: 'pricesRoutes' },
}

const testFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.routes.test.js'))

testFiles.forEach((testFile) => {
  const routeFile = testFile.replace('.test.js', '')
  const info = routeMap[routeFile]
  if (!info) return

  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')

  // Find the route import line (anywhere in the file)
  let importLine = ''
  let appUseLine = ''

  if (info.export === 'default') {
    // Find default import
    const importMatch = content.match(/import\s+[\w]+\s+from\s+['"]\.\/.*routes\.js['"];?/)
    const constMatch = content.match(/const\s+[\w]+\s+=\s+[\w]+\.default.*;?/)
    const appUseMatch = content.match(/app\.use\(['"]\/api\/[^'"]+['"],\s*[\w]+\);?/)

    if (importMatch && constMatch && appUseMatch) {
      importLine = importMatch[0]
      const useVar = constMatch[0].match(/const\s+(\w+)/)?.[1]
      appUseLine = `const ${info.varName} = ${useVar || 'routesModule'}.default || ${useVar || 'routesModule'}.${info.varName};\napp.use('/api/${info.path}', ${info.varName});`

      // Remove old lines
      content = content.replace(importMatch[0] + '\n', '')
      content = content.replace(constMatch[0] + '\n', '')
      content = content.replace(appUseMatch[0] + '\n', '')

      // Add import at top (after other imports)
      const lastImportMatch = content.match(/(import[^;]+;[\s]*\n)+/)
      if (lastImportMatch) {
        const lastImport = lastImportMatch[0]
        content = content.replace(lastImport, lastImport + importLine + '\n')
        // Add app.use after app setup
        const appSetupMatch = content.match(/(app\.use\([^)]+\);[\s]*\n)+/)
        if (appSetupMatch) {
          const lastAppUse = appSetupMatch[0]
          content = content.replace(lastAppUse, lastAppUse + appUseLine + '\n')
        } else {
          // Add after app creation
          const appMatch = content.match(/(const app = express\(\);[\s]*\n)/)
          if (appMatch) {
            content = content.replace(appMatch[0], appMatch[0] + appUseLine + '\n')
          }
        }
      }
    }
  } else {
    // Named export
    const importMatch = content.match(
      /import\s+\{[\s]*[\w]+\s*\}\s+from\s+['"]\.\/.*routes\.js['"];?/
    )
    const appUseMatch = content.match(/app\.use\(['"]\/api\/[^'"]+['"],\s*[\w]+\);?/)

    if (importMatch && appUseMatch) {
      importLine = importMatch[0]
      appUseLine = `app.use('/api/${info.path}', ${info.export});`

      // Remove old lines
      content = content.replace(importMatch[0] + '\n', '')
      content = content.replace(appUseMatch[0] + '\n', '')

      // Add import at top
      const lastImportMatch = content.match(/(import[^;]+;[\s]*\n)+/)
      if (lastImportMatch) {
        const lastImport = lastImportMatch[0]
        content = content.replace(lastImport, lastImport + importLine + '\n')
        // Add app.use after app setup
        const appSetupMatch = content.match(/(app\.use\([^)]+\);[\s]*\n)+/)
        if (appSetupMatch) {
          const lastAppUse = appSetupMatch[0]
          content = content.replace(lastAppUse, lastAppUse + appUseLine + '\n')
        } else {
          // Add after app creation
          const appMatch = content.match(/(const app = express\(\);[\s]*\n)/)
          if (appMatch) {
            content = content.replace(appMatch[0], appMatch[0] + appUseLine + '\n')
          }
        }
      }
    }
  }

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${testFile}`)
})

console.log(`\nFixed ${testFiles.length} test files`)
