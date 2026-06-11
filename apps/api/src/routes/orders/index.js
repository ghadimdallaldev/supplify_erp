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
