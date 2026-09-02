import express from 'express'
const router = express.Router()
import {
  requireAuth,
  requireRole,
  getSupplierIdForRequest,
  resolveTenantContext,
  resolveAdminContext,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkWarehouseLimit, createAuditLog } from '../lib/plan-enforcement.js'
import { requireFeature } from '../lib/subscription.js'
import {
  getWarehouseSupplierColumn,
  getWarehouseOwnerInsertSpec,
  isDefaultWarehouse,
  ensureDefaultWarehouseForPaidSupplier,
} from '../lib/warehouse-helpers.js'
import { buildSimulationFromPayload } from '../services/warehouseRouting.js'
import {
  seedMissingWarehouseInventoryForSupplier,
  transferWarehouseInventory,
} from '../services/supplier-stock.service.js'
import { syncLegacyMirrorFromWarehouse } from '../services/supplier-order-stock.service.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { withTransaction } from '../lib/db.js'
import { getEffectiveTenant } from '../lib/impersonation.js'
import { writeAuditLog } from '../lib/audit.js'

const warehousesFeature = requireFeature(
  'warehouses',
  (req) =>
    req.tenantContext?.tenantId || (req.userData?.role === 'ADMIN' ? req.query.supplier_id : null),
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

const multiWarehouseFeature = requireFeature(
  'multi_warehouse',
  (req) =>
    req.tenantContext?.tenantId || (req.userData?.role === 'ADMIN' ? req.query.supplier_id : null),
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

router.use(requireAuth, resolveTenantContext, resolveAdminContext)

async function resolveSupplierId(req) {
  const requestedSupplierId =
    typeof req.query.supplier_id === 'string' ? req.query.supplier_id.trim() : null
  const effective = getEffectiveTenant(req)

  if (requestedSupplierId) {
    if (effective) {
      return effective.tenantType === 'SUPPLIER' && effective.tenantId === requestedSupplierId
        ? requestedSupplierId
        : null
    }
    const adminPermissions = req.adminContext?.permissions || []
    if (
      req.userData?.role === 'ADMIN' &&
      (adminPermissions.includes('ADMIN_TENANTS') || adminPermissions.includes('ADMIN_ACCESS'))
    ) {
      await writeAuditLog(req, {
        action_type: 'admin.tenant_override',
        tenant_type: 'SUPPLIER',
        tenant_id: requestedSupplierId,
        payload_json: { resource_type: 'SUPPLIER', source: 'supplier_id_query' },
      })
      return requestedSupplierId
    }
  }

  return getSupplierIdForRequest(req)
}

async function getWarehouseForSupplier(warehouseId, supplierId) {
  const supplierCol = await getWarehouseSupplierColumn()
  const { rows } = await query(`SELECT * FROM warehouse WHERE id = $1 AND ${supplierCol} = $2`, [
    warehouseId,
    supplierId,
  ])
  return rows[0] ?? null
}

/**
 * GET /api/warehouses
 */
router.get(
  '/',
  warehousesFeature,
  requirePermission('WAREHOUSES_VIEW'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'BAD_REQUEST', message: 'Supplier ID required' },
          requestId: req.requestId,
        })
      }

      await ensureDefaultWarehouseForPaidSupplier(supplierId)

      const supplierCol = await getWarehouseSupplierColumn()
      const { rows: warehouses } = await query(
        `SELECT w.*,
          (SELECT COUNT(DISTINCT wi.product_id)::int FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS product_count,
          (SELECT COALESCE(SUM(wi.quantity_on_hand * COALESCE(pr.amount, 0)), 0)
           FROM warehouse_inventory wi
           LEFT JOIN LATERAL (
             SELECT amount FROM price WHERE product_id = wi.product_id
             ORDER BY valid_from DESC LIMIT 1
           ) pr ON true
           WHERE wi.warehouse_id = w.id) AS stock_value
         FROM warehouse w
         WHERE w.${supplierCol} = $1
         ORDER BY w.is_default DESC NULLS LAST, w.created_at DESC`,
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
  }
)

// Routing rules (register before /:id)
router.get(
  '/routing/rules',
  multiWarehouseFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'BAD_REQUEST', message: 'Supplier ID required' },
          requestId: req.requestId,
        })
      }
      const { rows } = await query(
        `SELECT r.*, w.name AS warehouse_name
         FROM warehouse_routing_rule r
         JOIN warehouse w ON w.id = r.warehouse_id
         WHERE r.supplier_id = $1
         ORDER BY r.priority ASC, r.created_at ASC`,
        [supplierId]
      )
      res.json({ ok: true, data: { rules: rows }, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('List routing rules error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to list routing rules' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/routing/rules',
  multiWarehouseFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const {
        warehouse_id,
        priority = 1,
        rule_type,
        product_id,
        category_id,
        zone_id,
        is_active = true,
      } = req.body

      const wh = await getWarehouseForSupplier(warehouse_id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      const { rows } = await query(
        `INSERT INTO warehouse_routing_rule (
          supplier_id, warehouse_id, priority, rule_type, product_id, category_id, zone_id, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          supplierId,
          warehouse_id,
          priority,
          rule_type,
          product_id ?? null,
          category_id ?? null,
          zone_id ?? null,
          is_active,
        ]
      )
      res
        .status(201)
        .json({ ok: true, data: { rule: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Create routing rule error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to create routing rule' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/routing/rules/:id',
  multiWarehouseFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const { priority, rule_type, warehouse_id, product_id, category_id, zone_id, is_active } =
        req.body
      const { rows } = await query(
        `UPDATE warehouse_routing_rule SET
          priority = COALESCE($1, priority),
          rule_type = COALESCE($2, rule_type),
          warehouse_id = COALESCE($3, warehouse_id),
          product_id = COALESCE($4, product_id),
          category_id = COALESCE($5, category_id),
          zone_id = COALESCE($6, zone_id),
          is_active = COALESCE($7, is_active)
         WHERE id = $8 AND supplier_id = $9
         RETURNING *`,
        [
          priority,
          rule_type,
          warehouse_id,
          product_id,
          category_id,
          zone_id,
          is_active,
          req.params.id,
          supplierId,
        ]
      )
      if (!rows.length) throw new NotFoundError('Rule not found')
      res.json({ ok: true, data: { rule: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update routing rule' },
        requestId: req.requestId,
      })
    }
  }
)

router.delete(
  '/routing/rules/:id',
  multiWarehouseFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const { rowCount } = await query(
        `DELETE FROM warehouse_routing_rule WHERE id = $1 AND supplier_id = $2`,
        [req.params.id, supplierId]
      )
      if (!rowCount) throw new NotFoundError('Rule not found')
      res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to delete routing rule' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/routing/simulate',
  multiWarehouseFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const { items = [], restaurant_id: restaurantId } = req.body

      const supplierCol = await getWarehouseSupplierColumn()
      const { rows: warehouses } = await query(
        `SELECT * FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE`,
        [supplierId]
      )
      const { rows: rules } = await query(
        `SELECT * FROM warehouse_routing_rule WHERE supplier_id = $1 AND is_active = TRUE ORDER BY priority`,
        [supplierId]
      )

      let restaurantPostalCode = null
      if (restaurantId) {
        const { rows: rRows } = await query(`SELECT address_json FROM restaurant WHERE id = $1`, [
          restaurantId,
        ])
        const addr = rRows[0]?.address_json
        restaurantPostalCode = addr?.postalCode ?? addr?.zip ?? null
      }

      const productIds = items.map((i) => i.product_id ?? i.productId).filter(Boolean)
      const { rows: stockRows } = productIds.length
        ? await query(
            `SELECT warehouse_id, product_id, quantity_available FROM warehouse_inventory WHERE product_id = ANY($1)`,
            [productIds]
          )
        : { rows: [] }

      const { rows: zones } = await query(
        `SELECT dz.* FROM delivery_zone dz
         JOIN warehouse w ON w.id = dz.warehouse_id
         WHERE w.${supplierCol} = $1 AND dz.is_active = TRUE`,
        [supplierId]
      )

      const { rows: products } = productIds.length
        ? await query(`SELECT id, category_id FROM product WHERE id = ANY($1)`, [productIds])
        : { rows: [] }
      const catMap = new Map(products.map((p) => [p.id, p.category_id]))

      const enrichedItems = items.map((item) => ({
        product_id: item.product_id ?? item.productId,
        quantity: item.quantity,
        category_id: catMap.get(item.product_id ?? item.productId) ?? item.category_id,
      }))

      const preview = buildSimulationFromPayload({
        items: enrichedItems,
        rules,
        warehouses,
        warehouseStock: stockRows,
        zones,
        restaurantPostalCode,
      })

      res.json({ ok: true, data: { preview }, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('Simulate routing error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to simulate routing' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireAuth,
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const limitCheck = await checkWarehouseLimit(supplierId)
      if (!limitCheck.allowed) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'WAREHOUSE_LIMIT_REACHED',
            message: limitCheck.reason,
            details: limitCheck,
          },
          requestId: req.requestId,
        })
      }

      const {
        name,
        code,
        address,
        capacity,
        contact_name,
        contact_email,
        contact_phone,
        type = 'standard',
        capacity_sqm,
        operating_hours,
        notes,
      } = req.body

      if (!name?.trim()) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Warehouse name is required' },
          requestId: req.requestId,
        })
      }

      const owner = await getWarehouseOwnerInsertSpec()
      const { rows: existing } = await query(
        `SELECT id FROM warehouse WHERE ${owner.filterColumn} = $1 AND is_active = TRUE`,
        [supplierId]
      )
      const isFirst = existing.length === 0
      const warehouseCode =
        (typeof code === 'string' && code.trim()) ||
        `WH-${String(Date.now()).slice(-8).toUpperCase()}`

      const addressValue =
        address == null || address === ''
          ? null
          : typeof address === 'string'
            ? { line1: address }
            : address

      const { rows: newWarehouse } = await query(
        `INSERT INTO warehouse (
          ${owner.columns}, name, code, address, capacity, contact_name, contact_email, contact_phone,
          type, capacity_sqm, operating_hours, notes, is_default, is_main, is_active
        ) VALUES (${owner.placeholders}, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, TRUE)
        RETURNING *`,
        [
          supplierId,
          name.trim(),
          warehouseCode,
          addressValue,
          capacity || null,
          contact_name || null,
          contact_email || null,
          contact_phone || null,
          type,
          capacity_sqm ?? null,
          operating_hours ?? null,
          notes ?? null,
          isFirst,
        ]
      )

      if (isFirst) {
        await query(`UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2`, [
          newWarehouse[0].id,
          supplierId,
        ])
        await seedMissingWarehouseInventoryForSupplier(supplierId, newWarehouse[0].id)
      }

      await createAuditLog('CREATE_WAREHOUSE', {
        entityType: 'WAREHOUSE',
        entityId: newWarehouse[0].id,
        description: `Created warehouse: ${name}`,
        changes: { name, code },
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
  }
)

router.patch(
  '/:id',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const warehouseId = req.params.id
      const wh = await getWarehouseForSupplier(warehouseId, supplierId)
      if (!wh && req.userData.role !== 'ADMIN') {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Warehouse not found' },
          requestId: req.requestId,
        })
      }

      const {
        name,
        address,
        capacity,
        contact_name,
        contact_email,
        contact_phone,
        is_active,
        type,
        capacity_sqm,
        operating_hours,
        notes,
        code,
      } = req.body

      const { rows } = await query(
        `UPDATE warehouse SET
          name = COALESCE($1, name),
          address = COALESCE($2, address),
          capacity = COALESCE($3, capacity),
          contact_name = COALESCE($4, contact_name),
          contact_email = COALESCE($5, contact_email),
          contact_phone = COALESCE($6, contact_phone),
          is_active = COALESCE($7, is_active),
          type = COALESCE($8, type),
          capacity_sqm = COALESCE($9, capacity_sqm),
          operating_hours = COALESCE($10, operating_hours),
          notes = COALESCE($11, notes),
          code = COALESCE($12, code),
          updated_at = now()
         WHERE id = $13 RETURNING *`,
        [
          name,
          address,
          capacity,
          contact_name,
          contact_email,
          contact_phone,
          is_active,
          type,
          capacity_sqm,
          operating_hours,
          notes,
          code,
          warehouseId,
        ]
      )

      res.json({ ok: true, data: { warehouse: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('Update warehouse error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update warehouse' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/set-default',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const warehouseId = req.params.id
      const supplierCol = await getWarehouseSupplierColumn()

      const warehouse = await withTransaction(async (client) => {
        await client.query(
          `UPDATE warehouse SET is_default = FALSE, is_main = FALSE WHERE ${supplierCol} = $1`,
          [supplierId]
        )
        const { rows } = await client.query(
          `UPDATE warehouse SET is_default = TRUE, is_main = TRUE, updated_at = now()
           WHERE id = $1 AND ${supplierCol} = $2 RETURNING *`,
          [warehouseId, supplierId]
        )
        if (!rows.length) throw new NotFoundError('Warehouse not found')
        await client.query(`UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2`, [
          warehouseId,
          supplierId,
        ])
        await seedMissingWarehouseInventoryForSupplier(supplierId, warehouseId, { client })
        return rows[0]
      })

      res.json({ ok: true, data: { warehouse }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to set default warehouse' },
        requestId: req.requestId,
      })
    }
  }
)

router.delete(
  '/:id',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const warehouseId = req.params.id
      const supplierCol = await getWarehouseSupplierColumn()

      const wh = await getWarehouseForSupplier(warehouseId, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      if (isDefaultWarehouse(wh)) {
        const { rows: others } = await query(
          `SELECT id FROM warehouse WHERE ${supplierCol} = $1 AND id != $2 AND is_active = TRUE`,
          [supplierId, warehouseId]
        )
        if (others.length > 0) {
          return res.status(409).json({
            ok: false,
            data: null,
            error: {
              name: 'DEFAULT_WAREHOUSE',
              message: 'Set another warehouse as default before deactivating this one',
            },
            requestId: req.requestId,
          })
        }
      }

      const { rows: pending } = await query(
        `SELECT id FROM order_warehouse_assignment
         WHERE warehouse_id = $1 AND status IN ('pending', 'picking', 'packed') LIMIT 1`,
        [warehouseId]
      )
      if (pending.length) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: {
            name: 'PENDING_ASSIGNMENTS',
            message: 'Cannot deactivate warehouse with pending order assignments',
          },
          requestId: req.requestId,
        })
      }

      const warehouse = await withTransaction(async (client) => {
        const { rows: others } = await client.query(
          `SELECT id FROM warehouse
           WHERE ${supplierCol} = $1 AND id != $2 AND is_active = TRUE
           ORDER BY is_default DESC NULLS LAST, is_main DESC NULLS LAST, created_at ASC`,
          [supplierId, warehouseId]
        )
        const targetId = others[0]?.id
        if (targetId) {
          await transferWarehouseInventory(client, warehouseId, targetId)
          await client.query(
            `UPDATE supplier SET default_warehouse_id = COALESCE(default_warehouse_id, $1)
             WHERE id = $2 AND (default_warehouse_id IS NULL OR default_warehouse_id = $3)`,
            [targetId, supplierId, warehouseId]
          )
        }

        const { rows } = await client.query(
          `UPDATE warehouse SET is_active = FALSE, updated_at = now() WHERE id = $1 RETURNING *`,
          [warehouseId]
        )
        return rows[0]
      })

      res.json({ ok: true, data: { warehouse }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to deactivate warehouse' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/:id/inventory',
  warehousesFeature,
  requirePermission('WAREHOUSES_VIEW'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
      const offset = parseInt(req.query.offset, 10) || 0
      const wh = await getWarehouseForSupplier(req.params.id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      const { rows } = await query(
        `SELECT wi.*, p.name AS product_name, p.sku
         FROM warehouse_inventory wi
         JOIN product p ON p.id = wi.product_id
         WHERE wi.warehouse_id = $1
         ORDER BY p.name
         LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset]
      )
      res.json({ ok: true, data: { inventory: rows }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to get inventory' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/:id/inventory/:productId',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const wh = await getWarehouseForSupplier(req.params.id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      const {
        quantity_available,
        quantity_reserved,
        quantity_on_hand,
        reorder_point,
        reorder_quantity,
      } = req.body

      const { rows } = await query(
        `INSERT INTO warehouse_inventory (
          warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand,
          reorder_point, reorder_quantity, last_counted_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
        ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
          quantity_available = COALESCE($3, warehouse_inventory.quantity_available),
          quantity_reserved = COALESCE($4, warehouse_inventory.quantity_reserved),
          quantity_on_hand = COALESCE($5, warehouse_inventory.quantity_on_hand),
          reorder_point = COALESCE($6, warehouse_inventory.reorder_point),
          reorder_quantity = COALESCE($7, warehouse_inventory.reorder_quantity),
          last_counted_at = now(),
          updated_at = now()
        RETURNING *`,
        [
          req.params.id,
          req.params.productId,
          quantity_available ?? 0,
          quantity_reserved ?? 0,
          quantity_on_hand ?? 0,
          reorder_point ?? null,
          reorder_quantity ?? null,
        ]
      )

      await syncLegacyMirrorFromWarehouse(query, {
        supplierId,
        productId: req.params.productId,
      })

      res.json({ ok: true, data: { inventory: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update inventory' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/:id/orders',
  warehousesFeature,
  requirePermission('WAREHOUSES_VIEW'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const wh = await getWarehouseForSupplier(req.params.id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      const { rows } = await query(
        `SELECT owa.*, co.id AS order_id, co.status AS order_status, co.total_amount,
                r.name AS restaurant_name
         FROM order_warehouse_assignment owa
         JOIN customer_order co ON co.id = owa.order_id
         JOIN restaurant r ON r.id = co.restaurant_id
         WHERE owa.warehouse_id = $1 AND owa.status NOT IN ('delivered', 'failed')
         ORDER BY owa.assigned_at DESC
         LIMIT 100`,
        [req.params.id]
      )
      res.json({ ok: true, data: { orders: rows }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to get warehouse orders' },
        requestId: req.requestId,
      })
    }
  }
)

// Delivery zones per warehouse
router.get(
  '/:id/zones',
  warehousesFeature,
  requirePermission('WAREHOUSES_VIEW'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const wh = await getWarehouseForSupplier(req.params.id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')
      const { rows } = await query(
        `SELECT * FROM delivery_zone WHERE warehouse_id = $1 ORDER BY name`,
        [req.params.id]
      )
      res.json({ ok: true, data: { zones: rows }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to list zones' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/zones',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const wh = await getWarehouseForSupplier(req.params.id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')

      const {
        name,
        zone_type = 'polygon',
        geometry,
        postal_codes,
        radius_km,
        center_lat,
        center_lng,
        min_order_amount,
        delivery_fee,
        estimated_delivery_hours,
        coverage_area_json,
      } = req.body

      const { rows } = await query(
        `INSERT INTO delivery_zone (
          supplier_id, warehouse_id, name, zone_type, geometry, postal_codes,
          radius_km, center_lat, center_lng, min_order_amount, delivery_fee,
          estimated_delivery_hours, coverage_area_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          supplierId,
          req.params.id,
          name,
          zone_type,
          geometry ?? null,
          postal_codes ?? null,
          radius_km ?? null,
          center_lat ?? null,
          center_lng ?? null,
          min_order_amount ?? 0,
          delivery_fee ?? 0,
          estimated_delivery_hours ?? null,
          coverage_area_json ?? geometry ?? null,
        ]
      )
      res
        .status(201)
        .json({ ok: true, data: { zone: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to create zone' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/:id/zones/:zoneId',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const {
        name,
        zone_type,
        geometry,
        postal_codes,
        min_order_amount,
        delivery_fee,
        estimated_delivery_hours,
        is_active,
      } = req.body
      const { rows } = await query(
        `UPDATE delivery_zone SET
          name = COALESCE($1, name),
          zone_type = COALESCE($2, zone_type),
          geometry = COALESCE($3, geometry),
          postal_codes = COALESCE($4, postal_codes),
          min_order_amount = COALESCE($5, min_order_amount),
          delivery_fee = COALESCE($6, delivery_fee),
          estimated_delivery_hours = COALESCE($7, estimated_delivery_hours),
          is_active = COALESCE($8, is_active),
          updated_at = now()
         WHERE id = $9 AND warehouse_id = $10 AND supplier_id = $11
         RETURNING *`,
        [
          name,
          zone_type,
          geometry,
          postal_codes,
          min_order_amount,
          delivery_fee,
          estimated_delivery_hours,
          is_active,
          req.params.zoneId,
          req.params.id,
          supplierId,
        ]
      )
      if (!rows.length) throw new NotFoundError('Zone not found')
      res.json({ ok: true, data: { zone: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update zone' },
        requestId: req.requestId,
      })
    }
  }
)

router.delete(
  '/:id/zones/:zoneId',
  warehousesFeature,
  requirePermission('WAREHOUSES_MANAGE'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const { rowCount } = await query(
        `DELETE FROM delivery_zone WHERE id = $1 AND warehouse_id = $2 AND supplier_id = $3`,
        [req.params.zoneId, req.params.id, supplierId]
      )
      if (!rowCount) throw new NotFoundError('Zone not found')
      res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to delete zone' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
