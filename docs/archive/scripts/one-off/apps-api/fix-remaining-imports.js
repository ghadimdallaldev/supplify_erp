#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const routesDir = path.join(__dirname, '../src/routes')

// Map of test file names to their actual route exports
const fixes = [
  {
    file: 'admin-dashboard.routes.test.js',
    export: 'default',
    path: 'admin-dashboard',
    varName: 'adminDashboardRoutes',
  },
  {
    file: 'branches.routes.test.js',
    export: 'default',
    path: 'branches',
    varName: 'branchesRoutes',
  },
  {
    file: 'warehouses.routes.test.js',
    export: 'default',
    path: 'warehouses',
    varName: 'warehousesRoutes',
  },
  { file: 'admin.routes.test.js', export: 'adminRoutes', path: 'admin', varName: 'adminRoutes' },
  { file: 'chat.routes.test.js', export: 'chatRoutes', path: 'chat', varName: 'chatRoutes' },
  { file: 'files.routes.test.js', export: 'filesRoutes', path: 'files', varName: 'filesRoutes' },
  {
    file: 'inventory.routes.test.js',
    export: 'inventoryRoutes',
    path: 'inventory',
    varName: 'inventoryRoutes',
  },
  {
    file: 'invoices.routes.test.js',
    export: 'invoicesRoutes',
    path: 'invoices',
    varName: 'invoicesRoutes',
  },
  {
    file: 'notifications.routes.test.js',
    export: 'notificationsRoutes',
    path: 'notifications',
    varName: 'notificationsRoutes',
  },
  {
    file: 'orders.routes.test.js',
    export: 'ordersRoutes',
    path: 'orders',
    varName: 'ordersRoutes',
  },
  {
    file: 'payments.routes.test.js',
    export: 'paymentsRoutes',
    path: 'payments',
    varName: 'paymentsRoutes',
  },
  {
    file: 'prices.routes.test.js',
    export: 'pricesRoutes',
    path: 'prices',
    varName: 'pricesRoutes',
  },
  {
    file: 'quick-lists.routes.test.js',
    export: 'quickListsRoutes',
    path: 'quick-lists',
    varName: 'quickListsRoutes',
  },
  {
    file: 'receiving.routes.test.js',
    export: 'receivingRoutes',
    path: 'receiving',
    varName: 'receivingRoutes',
  },
  {
    file: 'restaurant-finance.routes.test.js',
    export: 'restaurantFinanceRoutes',
    path: 'restaurant-finance',
    varName: 'restaurantFinanceRoutes',
  },
  {
    file: 'restaurant-inventory.routes.test.js',
    export: 'restaurantInventoryRoutes',
    path: 'restaurant-inventory',
    varName: 'restaurantInventoryRoutes',
  },
  {
    file: 'restaurant-onboarding.routes.test.js',
    export: 'restaurantOnboardingRoutes',
    path: 'restaurant-onboarding',
    varName: 'restaurantOnboardingRoutes',
  },
  {
    file: 'restaurant-pricing.routes.test.js',
    export: 'restaurantPricingRoutes',
    path: 'restaurant-pricing',
    varName: 'restaurantPricingRoutes',
  },
  {
    file: 'restaurants.routes.test.js',
    export: 'restaurantsRoutes',
    path: 'restaurants',
    varName: 'restaurantsRoutes',
  },
  {
    file: 'subscriptions.routes.test.js',
    export: 'subscriptionsRoutes',
    path: 'subscriptions',
    varName: 'subscriptionsRoutes',
  },
  {
    file: 'suppliers.routes.test.js',
    export: 'suppliersRoutes',
    path: 'suppliers',
    varName: 'suppliersRoutes',
  },
  {
    file: 'warehouses.routes.test.js',
    export: 'default',
    path: 'warehouses',
    varName: 'warehousesRoutes',
  },
]

fixes.forEach(({ file, export: exp, path: routePath, varName }) => {
  const testPath = path.join(routesDir, file)
  if (!fs.existsSync(testPath)) {
    console.log(`Skipping ${file} - not found`)
    return
  }

  let content = fs.readFileSync(testPath, 'utf8')
  const routeFile = file.replace('.test.js', '')

  // Find and replace the await import line
  if (exp === 'default') {
    // Default export
    const pattern =
      /const\s+\{?\s*[\w]+\s*\}?\s*=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);[\s\S]*?app\.use\([^)]+\);?/
    const replacement = `import routesModule from './${routeFile}';\nconst ${varName} = routesModule.default || routesModule.${varName};\napp.use('/api/${routePath}', ${varName});`

    if (pattern.test(content)) {
      content = content.replace(pattern, replacement)
    } else {
      // Try simpler pattern
      content = content.replace(
        /const\s+\{?\s*[\w]+\s*\}?\s*=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);/,
        `import routesModule from './${routeFile}';\nconst ${varName} = routesModule.default || routesModule.${varName};`
      )
      // Fix app.use line separately
      content = content.replace(
        /app\.use\(['"]\/api\/[^'"]+['"],\s*[\w]+\);?/,
        `app.use('/api/${routePath}', ${varName});`
      )
    }
  } else {
    // Named export
    const pattern =
      /const\s+\{[\s\w]+\}\s+=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);[\s\S]*?app\.use\([^)]+\);?/
    const replacement = `import { ${exp} } from './${routeFile}';\napp.use('/api/${routePath}', ${exp});`

    if (pattern.test(content)) {
      content = content.replace(pattern, replacement)
    } else {
      // Try simpler pattern
      content = content.replace(
        /const\s+\{[\s\w]+\}\s+=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);/,
        `import { ${exp} } from './${routeFile}';`
      )
      // Fix app.use line separately
      content = content.replace(
        /app\.use\(['"]\/api\/[^'"]+['"],\s*[\w]+\);?/,
        `app.use('/api/${routePath}', ${exp});`
      )
    }
  }

  // Move import to top of file (after other imports)
  const importMatch = content.match(/import\s+.*from\s+['"]\.\/.*routes\.js['"];/)
  if (importMatch) {
    const importLine = importMatch[0]
    // Remove from current location
    content = content.replace(importLine + '\n', '')
    // Find last import statement
    const lastImportMatch = content.match(/(import[^;]+;[\s]*\n)+/)
    if (lastImportMatch) {
      const lastImport = lastImportMatch[0]
      content = content.replace(lastImport, lastImport + importLine + '\n')
    }
  }

  fs.writeFileSync(testPath, content)
  console.log(`Fixed ${file}`)
})

console.log(`\nFixed ${fixes.length} test files`)
