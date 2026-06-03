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
    name: 'adminDashboardRoutes',
  },
  'branches.routes.js': { export: 'default', path: 'branches', name: 'branchesRoutes' },
  'warehouses.routes.js': { export: 'default', path: 'warehouses', name: 'warehousesRoutes' },
  'auth.routes.js': { export: 'authRoutes', path: 'auth', name: 'authRoutes' },
  'products.routes.js': { export: 'productsRoutes', path: 'products', name: 'productsRoutes' },
  'orders.routes.js': { export: 'ordersRoutes', path: 'orders', name: 'ordersRoutes' },
  'chat.routes.js': { export: 'chatRoutes', path: 'chat', name: 'chatRoutes' },
  'suppliers.routes.js': { export: 'suppliersRoutes', path: 'suppliers', name: 'suppliersRoutes' },
  'files.routes.js': { export: 'filesRoutes', path: 'files', name: 'filesRoutes' },
  'restaurants.routes.js': {
    export: 'restaurantsRoutes',
    path: 'restaurants',
    name: 'restaurantsRoutes',
  },
  'quick-lists.routes.js': {
    export: 'quickListsRoutes',
    path: 'quick-lists',
    name: 'quickListsRoutes',
  },
  'receiving.routes.js': { export: 'receivingRoutes', path: 'receiving', name: 'receivingRoutes' },
  'invoices.routes.js': { export: 'invoicesRoutes', path: 'invoices', name: 'invoicesRoutes' },
  'restaurant-finance.routes.js': {
    export: 'restaurantFinanceRoutes',
    path: 'restaurant-finance',
    name: 'restaurantFinanceRoutes',
  },
  'restaurant-inventory.routes.js': {
    export: 'restaurantInventoryRoutes',
    path: 'restaurant-inventory',
    name: 'restaurantInventoryRoutes',
  },
  'restaurant-onboarding.routes.js': {
    export: 'restaurantOnboardingRoutes',
    path: 'restaurant-onboarding',
    name: 'restaurantOnboardingRoutes',
  },
  'restaurant-pricing.routes.js': {
    export: 'restaurantPricingRoutes',
    path: 'restaurant-pricing',
    name: 'restaurantPricingRoutes',
  },
  'admin.routes.js': { export: 'adminRoutes', path: 'admin', name: 'adminRoutes' },
  'subscriptions.routes.js': {
    export: 'subscriptionsRoutes',
    path: 'subscriptions',
    name: 'subscriptionsRoutes',
  },
  'payments.routes.js': { export: 'paymentsRoutes', path: 'payments', name: 'paymentsRoutes' },
  'notifications.routes.js': {
    export: 'notificationsRoutes',
    path: 'notifications',
    name: 'notificationsRoutes',
  },
  'inventory.routes.js': { export: 'inventoryRoutes', path: 'inventory', name: 'inventoryRoutes' },
  'prices.routes.js': { export: 'pricesRoutes', path: 'prices', name: 'pricesRoutes' },
}

const testFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.routes.test.js'))

testFiles.forEach((testFile) => {
  const routeFile = testFile.replace('.test.js', '')
  const info = routeMap[routeFile]
  if (!info) {
    console.log(`Skipping ${testFile} - no route info`)
    return
  }

  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')
  let modified = false

  // Fix dynamic imports - replace await import() with static import
  if (info.export === 'default') {
    // Find and replace the import line
    const importPattern =
      /const\s+.*=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);[\s\S]*?app\.use\([^)]+\);?/
    const replacement = `import routesModule from './${routeFile}';\nconst ${info.name} = routesModule.default || routesModule.${info.name};\napp.use('/api/${info.path}', ${info.name});`

    if (importPattern.test(content)) {
      content = content.replace(importPattern, replacement)
      modified = true
    }

    // Also handle any remaining await import
    if (content.includes('await import')) {
      content = content.replace(
        /const\s+(\w+)\s+=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);/,
        `import routesModule from './${routeFile}';\nconst $1 = routesModule.default || routesModule.${info.name};`
      )
      modified = true
    }
  } else {
    // Named export
    const importPattern =
      /const\s+\{.*\}\s+=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);[\s\S]*?app\.use\([^)]+\);?/
    const replacement = `import { ${info.export} } from './${routeFile}';\napp.use('/api/${info.path}', ${info.export});`

    if (importPattern.test(content)) {
      content = content.replace(importPattern, replacement)
      modified = true
    }

    // Also handle any remaining await import
    if (content.includes('await import')) {
      content = content.replace(
        /const\s+\{.*\}\s+=\s+await\s+import\(['"]\.\/.*routes\.js['"]\);/,
        `import { ${info.export} } from './${routeFile}';`
      )
      modified = true
    }
  }

  // Fix route paths - replace /api/RouteName with /api/route-name
  const wrongPathPattern = new RegExp(
    `/api/${info.name
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\s+/g, '')}`,
    'gi'
  )
  if (wrongPathPattern.test(content)) {
    content = content.replace(wrongPathPattern, `/api/${info.path}`)
    modified = true
  }

  // Fix any other wrong paths
  const camelCasePath = `/api/${
    info.name.charAt(0).toLowerCase() +
    info.name
      .slice(1)
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
  }`
  if (content.includes(camelCasePath) && camelCasePath !== `/api/${info.path}`) {
    content = content.replace(
      new RegExp(camelCasePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      `/api/${info.path}`
    )
    modified = true
  }

  if (modified) {
    fs.writeFileSync(testPath, content)
    console.log(`Fixed ${testFile}`)
  } else {
    console.log(`No changes needed for ${testFile}`)
  }
})

console.log(`\nProcessed ${testFiles.length} test files`)
