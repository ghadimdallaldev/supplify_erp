import express from 'express'
import { requireAuth, resolveTenantContext, requirePermission } from '../../lib/rbac.js'
import { requirePlatformAppAccess } from '../../lib/staff-portal-auth.js'
import { staffMutationGuard } from '../../lib/route-permissions.js'
import { staffListCacheInvalidationMiddleware } from '../../lib/staff-list-cache.js'
import portalRouter from './portal.js'
import teamRouter from './team.js'
import scheduleRouter from './schedule.js'
import ptoRouter from './pto.js'
import announcementsRouter from './announcements.js'
import documentsRouter from './documents.js'
import reportsRouter from './reports.js'

const router = express.Router()

router.use(portalRouter)

router.use(
  requireAuth,
  requirePlatformAppAccess,
  resolveTenantContext,
  requirePermission('STAFF_VIEW'),
  staffMutationGuard,
  staffListCacheInvalidationMiddleware
)

router.use(teamRouter)
router.use(scheduleRouter)
router.use(ptoRouter)
router.use(announcementsRouter)
router.use(documentsRouter)
router.use(reportsRouter)

export { router as staffRoutes }
