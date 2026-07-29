import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, getRequestTenant } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { getLinkedDriverId } from '../lib/driver-rbac.js'
import { hasPermission } from '../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'
import {
  getActiveTrackingSession,
  startTrackingSession,
  ingestTrackingLocations,
  heartbeatTrackingSession,
  stopTrackingSession,
} from '../services/driver-tracking-session.service.js'

const router = express.Router()
router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requireFeature(
    'fulfillment',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType || 'SUPPLIER'
  )
)

async function driverContext(req) {
  const tenant = await getRequestTenant(req)
  const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
  if (!supplierId) throw new ValidationError('Supplier tenant context is required')
  const driverId = await getLinkedDriverId(req.userData.id, supplierId)
  if (!driverId) throw new ValidationError('Driver profile not linked')
  return { supplierId, driverId }
}

function requireDriverPermission(req, manage = false) {
  const permissions = req.tenantContext?.permissions ?? []
  const key = manage ? P.DRIVER_DELIVERIES_MANAGE : P.DRIVER_DELIVERIES_VIEW
  if (!hasPermission(permissions, key))
    throw new ForbiddenError('Driver tracking permission required')
}

const startSchema = z.object({ routeId: z.string().uuid().nullable().optional() })
const pointSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  recordedAt: z.string().datetime(),
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().nullable().optional(),
  altitudeMeters: z.number().nullable().optional(),
  speedMps: z.number().nullable().optional(),
  headingDegrees: z.number().nullable().optional(),
  batteryPercent: z.number().min(0).max(100).nullable().optional(),
  isMocked: z.boolean().optional(),
  networkState: z.enum(['online', 'offline']).optional(),
  source: z.string().max(30).optional(),
})
const batchSchema = z.object({ points: z.array(pointSchema).min(1) })
const heartbeatSchema = z
  .object({
    gpsState: z.string().max(40).optional(),
    networkState: z.enum(['online', 'offline']).optional(),
    batteryPercent: z.number().min(0).max(100).nullable().optional(),
  })
  .optional()
const stopSchema = z.object({ reason: z.string().min(1).max(40).optional() })

router.post('/tracking-sessions', async (req, res, next) => {
  try {
    requireDriverPermission(req, true)
    const context = await driverContext(req)
    const body = startSchema.parse(req.body ?? {})
    const data = await startTrackingSession({
      ...context,
      routeId: body.routeId ?? null,
      userId: req.userData.id,
    })
    res
      .status(data.session ? 201 : 200)
      .json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.get('/tracking-sessions/active', async (req, res, next) => {
  try {
    requireDriverPermission(req)
    const context = await driverContext(req)
    const session = await getActiveTrackingSession(context)
    res.json({ ok: true, data: { session }, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.post('/tracking-sessions/:sessionId/locations', async (req, res, next) => {
  try {
    requireDriverPermission(req, true)
    const context = await driverContext(req)
    const point = pointSchema.parse(req.body)
    const data = await ingestTrackingLocations({
      ...context,
      sessionId: req.params.sessionId,
      points: [point],
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.post('/tracking-sessions/:sessionId/locations/batch', async (req, res, next) => {
  try {
    requireDriverPermission(req, true)
    const context = await driverContext(req)
    const body = batchSchema.parse(req.body)
    const data = await ingestTrackingLocations({
      ...context,
      sessionId: req.params.sessionId,
      points: body.points,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.post('/tracking-sessions/:sessionId/heartbeat', async (req, res, next) => {
  try {
    requireDriverPermission(req, true)
    const context = await driverContext(req)
    const state = heartbeatSchema.parse(req.body ?? {}) ?? {}
    const session = await heartbeatTrackingSession({
      ...context,
      sessionId: req.params.sessionId,
      state,
    })
    res.json({ ok: true, data: { session }, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.post('/tracking-sessions/:sessionId/stop', async (req, res, next) => {
  try {
    requireDriverPermission(req, true)
    const context = await driverContext(req)
    const body = stopSchema.parse(req.body ?? {})
    const session = await stopTrackingSession({
      ...context,
      sessionId: req.params.sessionId,
      reason: body.reason,
    })
    res.json({ ok: true, data: { session }, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

export { router as driverTrackingRoutes }
