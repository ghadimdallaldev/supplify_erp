/**
 * Fix relative import paths and duplicate router declarations in Wave 4 route splits.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROUTES_DIR = path.join(__dirname, '../src/routes')

const SUBDIRS = [
  'admin-dashboard',
  'staff',
  'orders',
  'promotions',
  'fulfillment',
  'chat',
  'suppliers',
]

function walk(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.name.endsWith('.js')) files.push(full)
  }
  return files
}

function fixImports(content) {
  return content
    .replace(/from '\.\.\/lib\//g, "from '../../lib/")
    .replace(/from '\.\.\/services\//g, "from '../../services/")
    .replace(/from '\.\.\/middlewares\//g, "from '../../middlewares/")
    .replace(/from '\.\.\/config\//g, "from '../../config/")
    .replace(/from '\.\/order-amendments\.routes\.js'/g, "from '../order-amendments.routes.js'")
    .replace(/from '\.\/orders-driver\.routes\.js'/g, "from '../orders-driver.routes.js'")
}

function removeDuplicateRouterDecl(content) {
  const lines = content.split('\n')
  const out = []
  let routerDeclCount = 0
  for (const line of lines) {
    if (/^const router = /.test(line)) {
      routerDeclCount++
      if (routerDeclCount > 1) continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function moveImportsBeforeRouter(content) {
  const lines = content.split('\n')
  const importLines = []
  const otherLines = []
  let seenRouter = false

  for (const line of lines) {
    if (/^import /.test(line)) {
      importLines.push(line)
      continue
    }
    if (/^const router = /.test(line)) {
      if (!seenRouter) {
        seenRouter = true
        otherLines.push(line)
      }
      continue
    }
    otherLines.push(line)
  }

  return [...importLines, '', ...otherLines.filter((l, i, arr) => !(i > 0 && l === '' && arr[i - 1] === ''))].join('\n')
}

for (const sub of SUBDIRS) {
  const dir = path.join(ROUTES_DIR, sub)
  if (!fs.existsSync(dir)) continue
  for (const file of walk(dir)) {
    let content = fs.readFileSync(file, 'utf8')
    content = fixImports(content)
    if (path.basename(file) === 'index.js') {
      content = removeDuplicateRouterDecl(content)
      content = moveImportsBeforeRouter(content)
    }
    fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n', 'utf8')
  }
}

// Slim down index files that don't need full headers
const chatIndex = `import express from 'express'
import supportRouter from './support.js'
import adminRouter from './admin.js'
import conversationsRouter from './conversations.js'

const router = express.Router()

router.use(supportRouter)
router.use(adminRouter)
router.use(conversationsRouter)

export { router as chatRoutes }
`
fs.writeFileSync(path.join(ROUTES_DIR, 'chat/index.js'), chatIndex)

const promotionsIndex = `import express from 'express'
import restaurantRouter from './restaurant.js'
import supplierRouter from './supplier.js'

const router = express.Router()

router.use(restaurantRouter)
router.use(supplierRouter)

export { router as promotionsRoutes }
export { loadActivePromotionsForSupplier } from '../../services/promotions.service.js'
`
fs.writeFileSync(path.join(ROUTES_DIR, 'promotions/index.js'), promotionsIndex)

const ordersIndex = `import express from 'express'
import {
  requireAuth,
  resolveTenantContext,
  requirePermission,
} from '../../lib/rbac.js'
import { ordersRouterMutationGuard } from '../../lib/route-permissions.js'
import { ordersDriverRoutes } from '../orders-driver.routes.js'
import listRouter from './list.js'
import warehousesRouter from './warehouses.js'
import detailRouter from './detail.js'
import createRouter from './create.js'
import updateRouter from './update.js'
import documentsRouter from './documents.js'

const router = express.Router()

router.use(ordersDriverRoutes)

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('ORDERS_VIEW'),
  ordersRouterMutationGuard
)

router.use(listRouter)
router.use(warehousesRouter)
router.use(detailRouter)
router.use(createRouter)
router.use(updateRouter)
router.use(documentsRouter)

export { router as ordersRoutes }
export { createInvoiceFromOrder } from './orders.helpers.js'
`
fs.writeFileSync(path.join(ROUTES_DIR, 'orders/index.js'), ordersIndex)

console.log('Fixed Wave 4 import paths and index files.')
