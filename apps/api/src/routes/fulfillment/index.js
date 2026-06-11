import express from 'express'
import { requireAuth, requireRole, resolveTenantContext } from '../../lib/rbac.js'
import { fulfillmentFeature, requireFulfillmentAccess } from './fulfillment.helpers.js'
import boardRouter from './board.js'
import exceptionsRouter from './exceptions.js'
import routesRouter from './routes.js'

const router = express.Router()

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  fulfillmentFeature,
  requireFulfillmentAccess
)

router.use(boardRouter)
router.use(exceptionsRouter)
router.use(routesRouter)

export { router as fulfillmentRoutes }
