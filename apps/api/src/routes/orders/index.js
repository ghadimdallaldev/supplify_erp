import express from 'express'
import { requireAuth, resolveTenantContext, requirePermission } from '../../lib/rbac.js'
import { ordersRouterMutationGuard } from '../../lib/route-permissions.js'
import { ordersDriverRoutes } from '../orders-driver.routes.js'
import listRouter from './list.js'
import warehousesRouter from './warehouses.js'
import detailRouter from './detail.js'
import createRouter from './create.js'
import updateRouter from './update.js'
import documentsRouter from './documents.js'
import { tenantFeatureGate } from '../../lib/tenant-feature-gate.js'

const router = express.Router()

router.use(ordersDriverRoutes)

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('ORDERS_VIEW'),
  ordersRouterMutationGuard
)

// Admin kill switches (default ON; see feature-keys.js).
router.use(tenantFeatureGate('order_management'))
const orderingGate = tenantFeatureGate('ordering')
function orderPlacementGate(req, res, next) {
  if (req.method === 'POST' && (req.path === '/' || req.path === '/manual')) {
    return orderingGate(req, res, next)
  }
  return next()
}
orderPlacementGate.featureKey = 'ordering'
router.use(orderPlacementGate)
router.use(/^\/[^/]+\/warehouses/, tenantFeatureGate('order_warehouse_dispatch'))
router.use(/^\/[^/]+\/packing-slip/, tenantFeatureGate('packing_slips'))
router.use(/^\/[^/]+\/remind$/, tenantFeatureGate('order_reminders'))

router.use(listRouter)
router.use(warehousesRouter)
router.use(detailRouter)
router.use(createRouter)
router.use(updateRouter)
router.use(documentsRouter)

export { router as ordersRoutes }
export { createInvoiceFromOrder } from './orders.helpers.js'
