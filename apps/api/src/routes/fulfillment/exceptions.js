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

router.get('/exceptions', async (req, res) => {
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

    const statusFilter = req.query.status
    const typeFilter = req.query.type
    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const exceptionParams = [supplierId, ...whFilter.params]
    let paramIdx = exceptionParams.length + 1
    let extraClause = ''

    if (statusFilter) {
      extraClause += ` AND fe.status = $${paramIdx++}`
      exceptionParams.push(statusFilter)
    }
    if (typeFilter) {
      extraClause += ` AND fe.type = $${paramIdx++}`
      exceptionParams.push(typeFilter)
    }
    if (whFilter.warehouseId) {
      extraClause += ` AND fe.warehouse_id = $${paramIdx++}`
      exceptionParams.push(whFilter.warehouseId)
    }

    const { rows } = await query(
      `
      SELECT
        fe.id,
        fe.order_id,
        fe.type,
        fe.status,
        fe.description,
        fe.resolution_notes,
        fe.created_at,
        fe.resolved_at,
        r.name AS restaurant_name
      FROM fulfillment_exceptions fe
      LEFT JOIN customer_order o ON o.id = fe.order_id
      LEFT JOIN restaurant r ON r.id = o.restaurant_id
      WHERE fe.supplier_id = $1${extraClause}
      ORDER BY fe.created_at DESC
      LIMIT 200
      `,
      exceptionParams
    )

    const openCount = rows.filter((r) => r.status === 'open').length

    res.json({
      ok: true,
      data: {
        openCount,
        exceptions: rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          orderLabel: row.order_id ? row.order_id.slice(0, 8).toUpperCase() : '—',
          restaurantName: row.restaurant_name,
          exceptionType: row.type,
          status: row.status,
          description: row.description,
          resolutionNotes: row.resolution_notes,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment exceptions error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery exceptions' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/exceptions/:id/resolve',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
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
      const body = z.object({ resolution_notes: z.string().optional() }).parse(req.body ?? {})
      const { rows } = await query(
        `UPDATE fulfillment_exceptions
         SET status = 'resolved',
             resolution_notes = COALESCE($1, resolution_notes),
             resolved_by = $2,
             resolved_at = now(),
             updated_at = now()
         WHERE id = $3 AND supplier_id = $4
         RETURNING *`,
        [body.resolution_notes ?? null, req.userData.id, req.params.id, supplierId]
      )
      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Exception not found' },
          requestId: req.requestId,
        })
      }
      res.json({
        ok: true,
        data: { exception: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Resolve fulfillment exception error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to resolve exception' },
        requestId: req.requestId,
      })
    }
  }
)

router.post('/exceptions/:id/ignore', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
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
    const { rows } = await query(
      `UPDATE fulfillment_exceptions
         SET status = 'ignored', resolved_by = $1, resolved_at = now(), updated_at = now()
         WHERE id = $2 AND supplier_id = $3
         RETURNING *`,
      [req.userData.id, req.params.id, supplierId]
    )
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Exception not found' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { exception: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Ignore fulfillment exception error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to ignore exception' },
      requestId: req.requestId,
    })
  }
})

export default router
