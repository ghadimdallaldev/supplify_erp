import { Router } from 'express'
import { requireAuth, requireRole, resolveAdminContext } from '../../lib/rbac.js'
import { adminDashboardPermissionGuard, requireAnyPermission } from '../../lib/route-permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import overviewRouter from './overview.js'
import plansRouter from './plans.js'
import subscriptionsRouter from './subscriptions.js'
import auditRouter from './audit.js'
import tenantsRouter from './tenants.js'
import limitsRouter from './limits.js'
import healthRouter from './health.js'
import financeRouter from './finance.js'
import featuresRouter from './features.js'

const router = Router()

router.use(
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requireAnyPermission(
    P.ADMIN_ACCESS,
    P.ADMIN_TENANTS,
    P.ADMIN_PLANS,
    P.ADMIN_FINANCE,
    P.ADMIN_SUPPORT,
    P.ADMIN_GROWTH
  ),
  adminDashboardPermissionGuard
)

router.use(overviewRouter)
router.use(plansRouter)
router.use(subscriptionsRouter)
router.use(auditRouter)
router.use(tenantsRouter)
router.use(limitsRouter)
router.use(healthRouter)
router.use(financeRouter)
router.use(featuresRouter)

export default router
