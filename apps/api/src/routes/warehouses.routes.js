import express from 'express'
const router = express.Router()
import {
  requireAuth,
  requireRole,
  getSupplierIdForRequest,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkWarehouseLimit, createAuditLog } from '../lib/plan-enforcement.js'

router.use(requireAuth, resolveTenantContext, requirePermission('WAREHOUSES_VIEW'))

/**
 * GET /api/warehouses
 * Get all warehouses for authenticated supplier
 */
router.get('/', requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const supplierId =
      (await getSupplierIdForRequest(req)) ||
      (req.userData.role === 'ADMIN' ? req.query.supplier_id : null)

    if (!supplierId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Supplier ID required' },
        requestId: req.requestId,
      })
    }

    // Support both supplier_id (0005) and tenant_id (0023) column names
    const { rows: colRows } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouse' AND column_name IN ('supplier_id', 'tenant_id') LIMIT 1`
    )
    const supplierCol = colRows[0]?.column_name || 'supplier_id'
    const { rows: warehouses } = await query(
      `SELECT * FROM warehouse WHERE ${supplierCol} = $1 ORDER BY created_at DESC`,
      [supplierId]
    )

    res.json({
      ok: true,
      data: { warehouses },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get warehouses error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get warehouses' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/warehouses
 * Create a new warehouse
 */
router.post('/', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])

    if (suppliers.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const supplierId = suppliers[0].id

    // Check plan limits
    const limitCheck = await checkWarehouseLimit(supplierId)

    if (!limitCheck.allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'WAREHOUSE_LIMIT_REACHED',
          message: limitCheck.reason,
          details: {
            currentPlan: limitCheck.currentPlan,
            requiredPlan: limitCheck.requiredPlan,
            limit: limitCheck.limit,
            current: limitCheck.current,
          },
        },
        requestId: req.requestId,
      })
    }

    // Create warehouse
    const { name, code, address, capacity, contact_name, contact_email, contact_phone } = req.body

    const { rows: colRows } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouse' AND column_name IN ('supplier_id', 'tenant_id') LIMIT 1`
    )
    const supplierCol = colRows[0]?.column_name || 'supplier_id'
    const { rows: newWarehouse } = await query(
      `INSERT INTO warehouse (${supplierCol}, name, code, address, capacity, contact_name, contact_email, contact_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        supplierId,
        name,
        code || null,
        address || null,
        capacity || null,
        contact_name || null,
        contact_email || null,
        contact_phone || null,
      ]
    )

    // Create audit log
    await createAuditLog('CREATE_WAREHOUSE', {
      entityType: 'WAREHOUSE',
      entityId: newWarehouse[0].id,
      description: `Created warehouse: ${name}`,
      changes: { name, code, address },
    })

    res.status(201).json({
      ok: true,
      data: { warehouse: newWarehouse[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Create warehouse error:', error)

    if (error.code === '23505') {
      // Unique violation
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'DUPLICATE', message: 'Warehouse with this code already exists' },
        requestId: req.requestId,
      })
    }

    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to create warehouse' },
      requestId: req.requestId,
    })
  }
})

/**
 * PUT /api/warehouses/:id
 * Update a warehouse
 */
router.put('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const warehouseId = req.params.id
    const { name, address, capacity, contact_name, contact_email, contact_phone, is_active } =
      req.body

    const { rows: updatedWarehouse } = await query(
      `
      UPDATE warehouse 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          capacity = COALESCE($3, capacity),
          contact_name = COALESCE($4, contact_name),
          contact_email = COALESCE($5, contact_email),
          contact_phone = COALESCE($6, contact_phone),
          is_active = COALESCE($7, is_active),
          updated_at = now()
      WHERE id = $8
      RETURNING *
    `,
      [name, address, capacity, contact_name, contact_email, contact_phone, is_active, warehouseId]
    )

    if (updatedWarehouse.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Warehouse not found' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: { warehouse: updatedWarehouse[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Update warehouse error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update warehouse' },
      requestId: req.requestId,
    })
  }
})

/**
 * DELETE /api/warehouses/:id
 * Delete a warehouse
 */
router.delete('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const warehouseId = req.params.id

    const { rows: deletedWarehouse } = await query(
      `
      DELETE FROM warehouse WHERE id = $1 RETURNING *
    `,
      [warehouseId]
    )

    if (deletedWarehouse.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Warehouse not found' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: { warehouse: deletedWarehouse[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Delete warehouse error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete warehouse' },
      requestId: req.requestId,
    })
  }
})

export default router
