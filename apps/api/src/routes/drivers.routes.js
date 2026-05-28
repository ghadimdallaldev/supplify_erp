import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getSupplierIdForRequest,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { requireFeature, isFeatureEnabled } from '../lib/subscription.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  linkDriverToUser,
  unlinkDriverUser,
  listUnlinkedDrivers,
  assertUserNotLinkedToOtherDriver,
} from '../lib/driver-user-link.js'

const router = express.Router()

const driverManagementFeature = requireFeature(
  'driver_management',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  driverManagementFeature
)

async function resolveSupplierId(req) {
  return (
    (await getSupplierIdForRequest(req)) ||
    (req.userData.role === 'ADMIN' ? req.query.supplier_id : null)
  )
}

const createDriverSchema = z.object({
  full_name: z.string().min(1).max(255),
  phone: z.string().max(50).optional().nullable(),
  vehicle_type: z.enum(['motorcycle', 'van', 'truck', 'car', 'other']).optional().nullable(),
  vehicle_plate: z.string().max(50).optional().nullable(),
  warehouse_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
})

const updateDriverSchema = createDriverSchema.partial().extend({
  is_active: z.boolean().optional(),
})

function mapDriver(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    warehouse_id: row.warehouse_id,
    full_name: row.full_name,
    phone: row.phone,
    vehicle_type: row.vehicle_type,
    vehicle_plate: row.vehicle_plate,
    notes: row.notes,
    is_active: row.is_active,
    warehouse_name: row.warehouse_name ?? null,
    user_id: row.user_id ?? null,
    linked_user_email: row.linked_user_email ?? null,
    linked_user_name: row.linked_user_name ?? null,
  }
}

router.get('/unlinked', requirePermission('FULFILLMENT_VIEW'), async (req, res) => {
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
    const drivers = await listUnlinkedDrivers(supplierId)
    res.json({
      ok: true,
      data: { drivers },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List unlinked drivers error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list unlinked drivers' },
      requestId: req.requestId,
    })
  }
})

router.get('/', requirePermission('FULFILLMENT_VIEW'), async (req, res) => {
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

    const warehouseId = req.query.warehouse_id
    const activeOnly = req.query.active !== 'false'
    const params = [supplierId]
    let sql = `
      SELECT d.*, w.name AS warehouse_name,
             u.email AS linked_user_email, u.display_name AS linked_user_name
      FROM drivers d
      LEFT JOIN warehouse w ON w.id = d.warehouse_id
      LEFT JOIN app_user u ON u.id = d.user_id
      WHERE d.supplier_id = $1
    `
    if (activeOnly) sql += ` AND d.is_active = true`
    if (warehouseId) {
      params.push(warehouseId)
      sql += ` AND d.warehouse_id = $${params.length}`
    }
    sql += ` ORDER BY d.full_name`

    const { rows } = await query(sql, params)
    res.json({
      ok: true,
      data: { drivers: rows.map(mapDriver) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List drivers error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list drivers' },
      requestId: req.requestId,
    })
  }
})

router.post('/', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
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

    const body = createDriverSchema.parse(req.body)
    if (body.user_id) {
      await assertUserNotLinkedToOtherDriver(body.user_id, supplierId)
    }
    if (body.warehouse_id) {
      const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
      if (multiActive) {
        const { rows: wh } = await query(`SELECT id FROM warehouse WHERE id = $1`, [
          body.warehouse_id,
        ])
        if (!wh.length) throw new ValidationError('Warehouse not found')
      }
    }

    const { rows } = await query(
      `INSERT INTO drivers (
         supplier_id, warehouse_id, full_name, phone, vehicle_type, vehicle_plate, notes, user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        supplierId,
        body.warehouse_id ?? null,
        body.full_name,
        body.phone ?? null,
        body.vehicle_type ?? null,
        body.vehicle_plate ?? null,
        body.notes ?? null,
        body.user_id ?? null,
      ]
    )

    res.status(201).json({
      ok: true,
      data: { driver: mapDriver(rows[0]) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Create driver error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to create driver' },
      requestId: req.requestId,
    })
  }
})

router.patch('/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
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

    const body = updateDriverSchema.parse(req.body)
    const { rows: existing } = await query(
      `SELECT * FROM drivers WHERE id = $1 AND supplier_id = $2`,
      [req.params.id, supplierId]
    )
    if (!existing.length) throw new NotFoundError('Driver not found')

    if (body.is_active === false) {
      const { rows: active } = await query(
        `SELECT da.id, o.id AS order_id
         FROM driver_assignments da
         JOIN customer_order o ON o.id = da.order_id
         WHERE da.driver_id = $1 AND da.status IN ('assigned', 'picked_up', 'out_for_delivery')`,
        [req.params.id]
      )
      if (active.length) {
        return res.status(409).json({
          ok: false,
          data: { activeDeliveries: active },
          error: {
            name: 'ACTIVE_DELIVERIES',
            message: `Driver has ${active.length} active deliveries. Reassign before deactivating.`,
          },
          requestId: req.requestId,
        })
      }
    }

    const fields = []
    const values = []
    let i = 1
    const setField = (col, val) => {
      if (val !== undefined) {
        fields.push(`${col} = $${i++}`)
        values.push(val)
      }
    }
    setField('full_name', body.full_name)
    setField('phone', body.phone)
    setField('vehicle_type', body.vehicle_type)
    setField('vehicle_plate', body.vehicle_plate)
    setField('warehouse_id', body.warehouse_id)
    setField('notes', body.notes)
    setField('is_active', body.is_active)

    if (body.user_id !== undefined) {
      if (body.user_id === null) {
        setField('user_id', null)
      } else {
        await linkDriverToUser({
          driverId: req.params.id,
          userId: body.user_id,
          supplierId,
        })
      }
    }

    if (!fields.length && body.user_id === undefined) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
        requestId: req.requestId,
      })
    }

    fields.push('updated_at = now()')
    values.push(req.params.id, supplierId)

    let driverRow
    if (fields.length) {
      const { rows } = await query(
        `UPDATE drivers SET ${fields.join(', ')}
         WHERE id = $${i++} AND supplier_id = $${i}
         RETURNING *`,
        values
      )
      driverRow = rows[0]
    } else {
      driverRow = existing[0]
    }

    const { rows: enriched } = await query(
      `
      SELECT d.*, w.name AS warehouse_name,
             u.email AS linked_user_email, u.display_name AS linked_user_name
      FROM drivers d
      LEFT JOIN warehouse w ON w.id = d.warehouse_id
      LEFT JOIN app_user u ON u.id = d.user_id
      WHERE d.id = $1
      `,
      [driverRow.id]
    )

    res.json({
      ok: true,
      data: { driver: mapDriver(enriched[0] || driverRow) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Update driver error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update driver' },
      requestId: req.requestId,
    })
  }
})

router.delete('/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
  req.body = { is_active: false }
  const supplierId = await resolveSupplierId(req)
  if (!supplierId) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Supplier not found' },
      requestId: req.requestId,
    })
  }

  const { rows: existing } = await query(
    `SELECT * FROM drivers WHERE id = $1 AND supplier_id = $2`,
    [req.params.id, supplierId]
  )
  if (!existing.length) {
    return res.status(404).json({
      ok: false,
      data: null,
      error: { name: 'NOT_FOUND', message: 'Driver not found' },
      requestId: req.requestId,
    })
  }

  const { rows: active } = await query(
    `SELECT da.id FROM driver_assignments da
     WHERE da.driver_id = $1 AND da.status IN ('assigned', 'picked_up', 'out_for_delivery')`,
    [req.params.id]
  )
  if (active.length) {
    return res.status(409).json({
      ok: false,
      data: { activeDeliveries: active },
      error: {
        name: 'ACTIVE_DELIVERIES',
        message: `Driver has ${active.length} active deliveries. Reassign before deactivating.`,
      },
      requestId: req.requestId,
    })
  }

  const { rows } = await query(
    `UPDATE drivers SET is_active = false, updated_at = now()
     WHERE id = $1 AND supplier_id = $2 RETURNING *`,
    [req.params.id, supplierId]
  )

  res.json({
    ok: true,
    data: { driver: mapDriver(rows[0]) },
    error: null,
    requestId: req.requestId,
  })
})

router.get('/:id/assignments', requirePermission('FULFILLMENT_VIEW'), async (req, res) => {
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

    const { rows: drivers } = await query(
      `SELECT id FROM drivers WHERE id = $1 AND supplier_id = $2`,
      [req.params.id, supplierId]
    )
    if (!drivers.length) throw new NotFoundError('Driver not found')

    const { rows } = await query(
      `
      SELECT da.*, r.name AS restaurant_name, o.total_amount
      FROM driver_assignments da
      JOIN customer_order o ON o.id = da.order_id
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE da.driver_id = $1 AND da.supplier_id = $2
      ORDER BY da.assigned_at DESC
      LIMIT 100
      `,
      [req.params.id, supplierId]
    )

    res.json({
      ok: true,
      data: {
        assignments: rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          status: row.status,
          assignedAt: row.assigned_at,
          deliveredAt: row.delivered_at,
          restaurantName: row.restaurant_name,
          totalAmount: parseFloat(row.total_amount) || 0,
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Driver assignments error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load assignments' },
      requestId: req.requestId,
    })
  }
})

export { router as driversRoutes }
