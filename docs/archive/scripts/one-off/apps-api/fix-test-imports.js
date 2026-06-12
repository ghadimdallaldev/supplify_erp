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
  if (!info) return

  const testPath = path.join(routesDir, testFile)
  let content = fs.readFileSync(testPath, 'utf8')

  // Replace dynamic imports with static imports
  if (info.export === 'default') {
    content = content.replace(
      /const .* = await import\(['"].*routes\.js['"]\);[\s\S]*?app\.use\([^;]+\);?/,
      `import routesModule from './${routeFile}';\nconst ${info.name} = routesModule.default || routesModule.${info.name};\napp.use('/api/${info.path}', ${info.name});`
    )
  } else {
    content = content.replace(
      /const \{ .* \} = await import\(['"].*routes\.js['"]\);[\s\S]*?app\.use\([^;]+\);?/,
      `import { ${info.export} } from './${routeFile}';\napp.use('/api/${info.path}', ${info.export});`
    )
  }

  // Also fix any remaining await import statements
  content = content.replace(/const .* = await import\(/g, 'import ')
  content = content.replace(/await import\(([^)]+)\)/g, 'import($1)')

  fs.writeFileSync(testPath, content)
  console.log(`Fixed imports in ${testFile}`)
})

console.log(`\nFixed ${testFiles.length} test files`)
