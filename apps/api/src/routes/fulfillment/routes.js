import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRequestTenant,
  requirePermission,
} from '../../lib/rbac.js'
import { hasPermission } from '../../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { isFeatureEnabled, requireFeature } from '../../lib/subscription.js'
import { isMultiWarehouseFulfillmentActive } from '../../lib/warehouse-helpers.js'
import { z } from 'zod'
import {
  listDeliveryRoutes,
  getDeliveryRoute,
  createDeliveryRoute,
  updateDeliveryRoute,
  reorderRouteStops,
  reorderRouteStopsByOrder,
  setNextRouteStop,
  updateRouteStop,
  cancelDeliveryRoute,
  getDriverActiveRoute,
  addOrdersToPlannedRoute,
  removeOrderFromPlannedRoute,
  buildDriverRouteFromAssignments,
} from '../../services/delivery-routes.service.js'
import { getLinkedDriverId, isDriverOnlyPermissions } from '../../lib/driver-rbac.js'
import {
  getLatestLocationsForDrivers,
  isGpsTrackingEnabled,
} from '../../services/driver-location.service.js'
import {
  buildTrackingPayload,
  buildDriverLastSeenAlias,
} from '../../lib/delivery-tracking-payload.js'
import { rolloverAssignmentToNextDay } from '../../services/delivery-rollover.service.js'
import { invalidateUserAuthCaches } from '../../lib/access-cache.js'

import {
  resolveRouteReorderAccess,
  parseWarehouseFilter,
  warehouseFilterClause,
  mapStopStatus,
  resolveSupplierId,
  loadStopsForRoutes,
} from './fulfillment.helpers.js'

const router = express.Router()

router.get('/routes/today', async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const perms = req.tenantContext?.permissions ?? []
    if (!hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver delivery access required' },
        requestId: req.requestId,
      })
    }
    const driverId = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
        requestId: req.requestId,
      })
    }
    const route = await getDriverActiveRoute(supplierId, driverId)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/routes/active', async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const perms = req.tenantContext?.permissions ?? []
    if (!hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver delivery access required' },
        requestId: req.requestId,
      })
    }
    const driverId = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
        requestId: req.requestId,
      })
    }
    const route = await getDriverActiveRoute(supplierId, driverId)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const buildDriverRouteSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

router.post('/routes/build-from-assignments', async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const perms = req.tenantContext?.permissions ?? []
    if (!hasPermission(perms, P.DRIVER_DELIVERIES_MANAGE)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver delivery manage access required' },
        requestId: req.requestId,
      })
    }
    const driverId = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
        requestId: req.requestId,
      })
    }
    const body = buildDriverRouteSchema.parse(req.body ?? {})
    const route = await buildDriverRouteFromAssignments(supplierId, driverId, {
      date: body.date,
      userId: req.userData.id,
    })
    res.status(201).json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/routes/:id', async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const perms = req.tenantContext?.permissions ?? []
    let driverScope = null
    if (isDriverOnlyPermissions(perms)) {
      driverScope = await getLinkedDriverId(req.userData.id, supplierId)
      if (!driverScope) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
          requestId: req.requestId,
        })
      }
    }
    const route = await getDeliveryRoute(supplierId, req.params.id, {
      driverIdScope: driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const createRouteSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  driver_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  route_label: z.string().max(120).optional(),
  area: z.string().max(120).optional(),
})

router.post('/routes', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const body = createRouteSchema.parse(req.body ?? {})
    const route = await createDeliveryRoute({
      supplierId,
      orderIds: body.order_ids,
      driverId: body.driver_id,
      scheduledDate: body.scheduled_date,
      routeLabel: body.route_label,
      area: body.area,
      userId: req.userData.id,
    })
    res.status(201).json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const addRouteStopsSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
})

router.post(
  '/routes/:id/stops',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = addRouteStopsSchema.parse(req.body ?? {})
      const route = await addOrdersToPlannedRoute({
        supplierId,
        routeId: req.params.id,
        orderIds: body.order_ids,
        userId: req.userData?.id,
      })
      res.status(201).json({ ok: true, data: { route }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/routes/:id/stops/:orderId',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const route = await removeOrderFromPlannedRoute({
        supplierId,
        routeId: req.params.id,
        orderId: req.params.orderId,
      })
      res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.patch('/routes/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const body = z
      .object({
        route_label: z.string().max(120).optional(),
        area: z.string().max(120).optional(),
        scheduled_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        driver_id: z.string().uuid().optional(),
        status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      })
      .parse(req.body ?? {})
    const route = await updateDeliveryRoute(supplierId, req.params.id, {
      routeLabel: body.route_label,
      area: body.area,
      scheduledDate: body.scheduled_date,
      driverId: body.driver_id,
      status: body.status,
      userId: req.userData?.id,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.delete('/routes/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const route = await cancelDeliveryRoute(supplierId, req.params.id)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/routes/:id/stops/reorder', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = z.object({ stop_ids: z.array(z.string().uuid()).min(1) }).parse(req.body ?? {})
    const route = await reorderRouteStops(access.supplierId, req.params.id, body.stop_ids, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const reorderStopsByOrderSchema = z.object({
  stops: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        stopSequence: z.number().int().positive(),
      })
    )
    .min(1),
})

router.patch('/routes/:id/stops/reorder', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = reorderStopsByOrderSchema.parse(req.body ?? {})
    const route = await reorderRouteStopsByOrder(access.supplierId, req.params.id, body.stops, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/routes/:id/next-stop', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = z.object({ orderId: z.string().uuid() }).parse(req.body ?? {})
    const route = await setNextRouteStop(access.supplierId, req.params.id, body.orderId, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const stopStatusSchema = z.enum(['PLANNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'])

router.patch('/routes/:id/stops/:stopId', async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }
    const perms = req.tenantContext?.permissions ?? []
    const canManage =
      perms.includes('FULFILLMENT_MANAGE') ||
      perms.includes('DRIVER_DELIVERIES_MANAGE') ||
      isDriverOnlyPermissions(perms)
    if (!canManage) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }
    if (isDriverOnlyPermissions(perms) && !perms.includes('DRIVER_DELIVERIES_MANAGE')) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }
    const body = z
      .object({
        status: stopStatusSchema.optional(),
        notes: z.string().max(2000).optional(),
        failure_reason: z.string().max(500).optional(),
      })
      .parse(req.body ?? {})

    const route = await getDeliveryRoute(supplierId, req.params.id)
    if (isDriverOnlyPermissions(perms)) {
      const driverId = await getLinkedDriverId(req.userData.id, supplierId)
      if (route.driverId !== driverId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Not your route' },
          requestId: req.requestId,
        })
      }
    } else if (!perms.includes('FULFILLMENT_MANAGE')) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }

    const updated = await updateRouteStop(supplierId, req.params.id, req.params.stopId, {
      status: body.status,
      notes: body.notes,
      failureReason: body.failure_reason,
      userId: req.userData.id,
      permissions: perms,
    })
    res.json({ ok: true, data: { route: updated }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export default router
