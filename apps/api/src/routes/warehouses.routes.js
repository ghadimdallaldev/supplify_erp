import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'
import { updateWarehouseStock } from '../services/warehouse-stock-adjustment.service.js'
import { deactivateSupplierWarehouse } from '../services/warehouse-lifecycle.service.js'
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
import { hasPermission } from '../lib/permissions.js'
import { rolesIncludeOwner } from '../lib/tenant-roles.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkWarehouseLimit, createAuditLog } from '../lib/plan-enforcement.js'
import { requireFeature } from '../lib/subscription.js'
import { CatalogError, sendCatalogError } from '../lib/catalog-errors.js'
import { validateRoutingRuleTarget } from '../services/catalog-targets.service.js'
import { routingProductColumnsSql } from '../services/warehouseRouting.js'
import {
  getWarehouseSupplierColumn,
  getWarehouseOwnerInsertSpec,
  isDefaultWarehouse,
  ensureDefaultWarehouseForPaidSupplier,
} from '../lib/warehouse-helpers.js'
import { buildSimulationFromPayload } from '../services/warehouseRouting.js'
import { seedMissingWarehouseInventoryForSupplier } from '../services/supplier-stock.service.js'
import { syncLegacyMirrorFromWarehouse } from '../services/supplier-order-stock.service.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { normalizeZoneCoverage } from '../lib/delivery-zone-input.js'
import { withTransaction } from '../lib/db.js'

const warehousesFeature = requireFeature(
  'warehouses',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

const multiWarehouseFeature = requireFeature(
  'multi_warehouse',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

router.use(requireAuth, resolveTenantContext, resolveAdminContext)

async function resolveSupplierId(req) {
  const requestedSupplierId =
    typeof req.query.supplier_id === 'string' ? req.query.supplier_id.trim() : null
  const fromRequest = await getSupplierIdForRequest(req)
  if (requestedSupplierId) {
    return fromRequest && fromRequest === requestedSupplierId ? requestedSupplierId : null
  }
  return fromRequest
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

      if (
        req.tenantContext?.warehouseAccess?.mode !== 'assigned' &&
        (rolesIncludeOwner(req.tenantContext?.roles) ||
          hasPermission(req.tenantContext?.permissions, 'WAREHOUSES_MANAGE'))
      ) {
        await ensureDefaultWarehouseForPaidSupplier(supplierId)
      }

      const supplierCol = await getWarehouseSupplierColumn()
      const { rows: warehouses } = await query(
        `SELECT w.*,
          (SELECT COUNT(DISTINCT wi.product_id)::int FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id AND EXISTS (SELECT 1 FROM product owned WHERE owned.id = wi.product_id AND owned.supplier_id = $1)) AS product_count,
          (SELECT COALESCE(SUM(wi.quantity_available), 0) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id AND EXISTS (SELECT 1 FROM product owned WHERE owned.id = wi.product_id AND owned.supplier_id = $1)) AS total_available_qty,
          (SELECT COALESCE(SUM(wi.quantity_reserved), 0) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id AND EXISTS (SELECT 1 FROM product owned WHERE owned.id = wi.product_id AND owned.supplier_id = $1)) AS total_reserved_qty,
          (SELECT COALESCE(SUM(wi.quantity_on_hand * COALESCE(pr.amount, 0)), 0)
           FROM warehouse_inventory wi
           LEFT JOIN LATERAL (
             SELECT amount FROM price WHERE product_id = wi.product_id
               AND valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())
             ORDER BY (CASE WHEN COALESCE(min_qty, 1) <= 1 THEN 0 ELSE 1 END), valid_from DESC
             LIMIT 1
           ) pr ON true
           WHERE wi.warehouse_id = w.id AND EXISTS (SELECT 1 FROM product owned WHERE owned.id = wi.product_id AND owned.supplier_id = $1)) AS stock_value,
          COALESCE((
            SELECT json_agg(row_to_json(inv) ORDER BY inv.product_name)
            FROM (
              SELECT
                wi.id,
                wi.product_id,
                p.name AS product_name,
                p.sku AS product_sku,
                wi.quantity_on_hand,
                wi.quantity_reserved,
                wi.quantity_available
              FROM warehouse_inventory wi
              JOIN product p ON p.id = wi.product_id
              WHERE wi.warehouse_id = w.id AND EXISTS (SELECT 1 FROM product owned WHERE owned.id = wi.product_id AND owned.supplier_id = $1)
              ORDER BY p.name
              LIMIT 50
            ) inv
          ), '[]'::json) AS inventory
         FROM warehouse w
         WHERE w.${supplierCol} = $1 AND ($2::uuid[] IS NULL OR w.id = ANY($2::uuid[]))
         ORDER BY w.is_default DESC NULLS LAST, w.created_at DESC`,
        [
          supplierId,
          req.tenantContext?.warehouseAccess?.mode === 'assigned'
            ? req.tenantContext.warehouseAccess.warehouseIds
            : null,
        ]
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
      const supplierCol = await getWarehouseSupplierColumn()
      const { rows } = await query(
        `SELECT r.*, w.name AS warehouse_name,
                pc.name AS category_name, pc.name_ar AS category_name_ar,
                sh.name AS shelf_name, sh.name_ar AS shelf_name_ar, sh.archived_at AS shelf_archived_at
         FROM warehouse_routing_rule r
         JOIN warehouse w ON w.id = r.warehouse_id AND w.${supplierCol} = r.supplier_id
         LEFT JOIN product_category pc ON pc.id = r.category_id
         LEFT JOIN supplier_shelf sh ON sh.id = r.shelf_id
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
      const { warehouse_id, priority = 1, rule_type, is_active = true } = req.body

      const wh = await getWarehouseForSupplier(warehouse_id, supplierId)
      if (!wh) throw new NotFoundError('Warehouse not found')
      // Products and shelves must be this branch's; categories leaf platform ones.
      const target = await validateRoutingRuleTarget({ query }, supplierId, req.body)

      const { rows } = await query(
        `INSERT INTO warehouse_routing_rule (
          supplier_id, warehouse_id, priority, rule_type, product_id, category_id, shelf_id,
          zone_id, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          supplierId,
          warehouse_id,
          priority,
          rule_type,
          target.product_id,
          target.category_id,
          target.shelf_id,
          target.zone_id,
          is_active,
        ]
      )
      res
        .status(201)
        .json({ ok: true, data: { rule: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof CatalogError) return sendCatalogError(req, res, error)
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
      const { priority, warehouse_id, is_active } = req.body
      if (warehouse_id) {
        const targetWarehouse = await getWarehouseForSupplier(warehouse_id, supplierId)
        if (!targetWarehouse) throw new NotFoundError('Warehouse not found')
      }
      const { rows: existingRows } = await query(
        `SELECT * FROM warehouse_routing_rule WHERE id = $1 AND supplier_id = $2`,
        [req.params.id, supplierId]
      )
      if (!existingRows.length) throw new NotFoundError('Rule not found')
      const merged = { ...existingRows[0] }
      for (const key of ['rule_type', 'product_id', 'category_id', 'shelf_id', 'zone_id']) {
        if (req.body[key] !== undefined && req.body[key] !== null) merged[key] = req.body[key]
      }
      const target = await validateRoutingRuleTarget({ query }, supplierId, merged)
      const { rows } = await query(
        `UPDATE warehouse_routing_rule SET
          priority = COALESCE($1, priority),
          rule_type = $2,
          warehouse_id = COALESCE($3, warehouse_id),
          product_id = $4,
          category_id = $5,
          shelf_id = $6,
          zone_id = $7,
          is_active = COALESCE($8, is_active)
         WHERE id = $9 AND supplier_id = $10
         RETURNING *`,
        [
          priority,
          merged.rule_type,
          warehouse_id,
          target.product_id,
          target.category_id,
          target.shelf_id,
          target.zone_id,
          is_active,
          req.params.id,
          supplierId,
        ]
      )
      if (!rows.length) throw new NotFoundError('Rule not found')
      res.json({ ok: true, data: { rule: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof CatalogError) return sendCatalogError(req, res, error)
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
      const { items = [], restaurant_id: restaurantId, postal_code: bodyPostal } = req.body
      if (
        !Array.isArray(items) ||
        items.length > 200 ||
        items.some(
          (item) =>
            !item ||
            typeof (item.product_id ?? item.productId) !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              item.product_id ?? item.productId
            ) ||
            typeof item.quantity !== 'number' ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0
        )
      )
        throw new ValidationError(
          'Provide up to 200 products with valid IDs and positive quantities'
        )

      const supplierCol = await getWarehouseSupplierColumn()
      const { rows: warehouses } = await query(
        `SELECT * FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE`,
        [supplierId]
      )
      const { rows: rules } = await query(
        `SELECT * FROM warehouse_routing_rule WHERE supplier_id = $1 AND is_active = TRUE ORDER BY priority`,
        [supplierId]
      )

      let restaurantPostalCode = bodyPostal || null
      let destination = null
      if (restaurantId) {
        const { rows: rRows } = await query(`SELECT address_json FROM restaurant WHERE id = $1`, [
          restaurantId,
        ])
        const addr = rRows[0]?.address_json
        destination = addr || null
        restaurantPostalCode = addr?.postalCode ?? addr?.zip ?? restaurantPostalCode
      }

      if (!items.length) {
        const defaultWh = warehouses.find((w) => w.is_default || w.is_main) || warehouses[0] || null
        return res.json({
          ok: true,
          data: {
            preview: defaultWh
              ? [
                  {
                    productId: null,
                    quantity: 0,
                    warehouseId: defaultWh.id,
                    warehouseName: defaultWh.name,
                    reason: 'default',
                  },
                ]
              : [],
            warehouseName: defaultWh?.name ?? null,
          },
          error: null,
          requestId: req.requestId,
        })
      }

      const productIds = items.map((i) => i.product_id ?? i.productId).filter(Boolean)
      const { rows: stockRows } = productIds.length
        ? await query(
            `SELECT wi.warehouse_id, wi.product_id, wi.quantity_available
             FROM warehouse_inventory wi
             JOIN warehouse w ON w.id = wi.warehouse_id
             WHERE wi.product_id = ANY($1) AND w.${supplierCol} = $2`,
            [productIds, supplierId]
          )
        : { rows: [] }

      const { rows: zones } = await query(
        `SELECT dz.* FROM delivery_zone dz
         JOIN warehouse w ON w.id = dz.warehouse_id
         WHERE w.${supplierCol} = $1 AND dz.is_active = TRUE`,
        [supplierId]
      )

      const { rows: products } = productIds.length
        ? await query(
            `SELECT ${routingProductColumnsSql('p')} FROM product p
             WHERE p.id = ANY($1) AND p.supplier_id = $2`,
            [productIds, supplierId]
          )
        : { rows: [] }
      const productById = new Map(products.map((p) => [p.id, p]))
      if (productById.size !== new Set(productIds).size)
        throw new ValidationError('Simulation products must belong to this supplier')

      const enrichedItems = items.map((item) => {
        const own = productById.get(item.product_id ?? item.productId)
        return {
          product_id: item.product_id ?? item.productId,
          quantity: item.quantity,
          category_id: own.category_id,
          shelf_ids: own.shelf_ids,
        }
      })

      const preview = buildSimulationFromPayload({
        items: enrichedItems,
        rules,
        warehouses,
        warehouseStock: stockRows,
        zones,
        restaurantPostalCode,
        destination,
      })

      res.json({ ok: true, data: { preview }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error.code === 'NO_SINGLE_FULFILLMENT_LOCATION')
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: error.code, message: error.message, details: error.details },
          requestId: req.requestId,
        })
      if (error instanceof ValidationError)
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
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

      const newWarehouse = await withTransaction(async (client) => {
        const billingId = await resolveOrgBillingTenantId(supplierId, 'SUPPLIER')
        await client.query(
          'SELECT id FROM supplier WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [[...new Set([billingId, supplierId])]]
        )
        const checked = await checkWarehouseLimit(supplierId)
        if (!checked.allowed)
          throw Object.assign(new ValidationError(checked.reason), {
            code: 'WAREHOUSE_LIMIT_REACHED',
            details: checked,
          })
        const owner = await getWarehouseOwnerInsertSpec((sql, params) => client.query(sql, params))
        const { rows: existing } = await client.query(
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

        const { rows: created } = await client.query(
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
          await client.query(`UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2`, [
            created[0].id,
            supplierId,
          ])
          await seedMissingWarehouseInventoryForSupplier(supplierId, created[0].id, { client })
        }

        return created
      })

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
      if (error.code === 'WAREHOUSE_LIMIT_REACHED')
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: error.code, message: error.message, details: error.details },
          requestId: req.requestId,
        })
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
  requirePermission('WAREHOUSES_EDIT'),
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const warehouseId = req.params.id
      const wh = await getWarehouseForSupplier(warehouseId, supplierId)
      if (!wh) {
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

      const deactivating = is_active === false && wh?.is_active !== false
      if (deactivating) {
        const perms = req.tenantContext?.permissions ?? []
        if (
          !rolesIncludeOwner(req.tenantContext?.roles) &&
          !hasPermission(perms, 'WAREHOUSES_MANAGE')
        ) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Missing permission: WAREHOUSES_MANAGE',
            },
            requestId: req.requestId,
          })
        }
        const warehouse = await withTransaction((client) =>
          deactivateSupplierWarehouse(client, {
            supplierId,
            warehouseId,
            actorId: req.userData.id,
            requestId: req.requestId,
            destinationWarehouseId: req.body.destination_warehouse_id,
            confirmTransfer: req.body.confirm_transfer,
          })
        )

        return res.json({
          ok: true,
          data: { warehouse },
          error: null,
          requestId: req.requestId,
        })
      }

      const supplierCol = await getWarehouseSupplierColumn()
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
         WHERE id = $13 AND ${supplierCol} = $14 RETURNING *`,
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
          supplierId,
        ]
      )

      res.json({ ok: true, data: { warehouse: rows[0] }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error.name === 'ConflictError' || error.name === 'ValidationError') {
        return res.status(error.name === 'ConflictError' ? 409 : 400).json({
          ok: false,
          data: null,
          error: {
            name:
              error.name === 'ConflictError' ? 'WAREHOUSE_LIFECYCLE_BLOCKED' : 'VALIDATION_ERROR',
            message: error.message,
            details: error.details,
          },
          requestId: req.requestId,
        })
      }
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
  requirePermission('WAREHOUSES_EDIT'),
  requireRole(['SUPPLIER']),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const warehouseId = req.params.id
      const supplierCol = await getWarehouseSupplierColumn()

      const warehouse = await withTransaction(async (client) => {
        await client.query('SELECT id FROM supplier WHERE id = $1 FOR UPDATE', [supplierId])
        await client.query(
          `UPDATE warehouse SET is_default = FALSE, is_main = FALSE WHERE ${supplierCol} = $1`,
          [supplierId]
        )
        const { rows } = await client.query(
          `UPDATE warehouse SET is_default = TRUE, is_main = TRUE, updated_at = now()
           WHERE id = $1 AND ${supplierCol} = $2 AND is_active = TRUE RETURNING *`,
          [warehouseId, supplierId]
        )
        if (!rows.length) throw new NotFoundError('Warehouse not found or inactive')
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
      const warehouse = await withTransaction((client) =>
        deactivateSupplierWarehouse(client, {
          supplierId,
          warehouseId,
          actorId: req.userData.id,
          requestId: req.requestId,
          destinationWarehouseId: req.body?.destination_warehouse_id,
          confirmTransfer: req.body?.confirm_transfer,
        })
      )

      res.json({ ok: true, data: { warehouse }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error.name === 'ConflictError' || error.name === 'ValidationError') {
        return res.status(error.name === 'ConflictError' ? 409 : 400).json({
          ok: false,
          data: null,
          error: {
            name:
              error.name === 'ConflictError' ? 'WAREHOUSE_LIFECYCLE_BLOCKED' : 'VALIDATION_ERROR',
            message: error.message,
            details: error.details,
          },
          requestId: req.requestId,
        })
      }
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
         JOIN product p ON p.id = wi.product_id AND p.supplier_id = $2
         WHERE wi.warehouse_id = $1
         ORDER BY p.name
         LIMIT $3 OFFSET $4`,
        [req.params.id, supplierId, limit, offset]
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

      const inventory = await withTransaction((client) =>
        updateWarehouseStock(client, {
          supplierId,
          warehouseId: req.params.id,
          productId: req.params.productId,
          patch: req.body,
          actorId: req.userData.id,
          requestId: req.requestId,
        })
      )
      res.json({ ok: true, data: { inventory }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof ValidationError)
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
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
  requirePermission('ORDERS_VIEW'),
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
         WHERE owa.warehouse_id = $1 AND owa.status NOT IN ('delivered', 'failed', 'superseded')
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

      const { name, min_order_amount, delivery_fee, estimated_delivery_hours } = req.body
      const coverage = normalizeZoneCoverage(req.body)
      if (!coverage) {
        throw new ValidationError('zone_type must be polygon, radius, or postal_codes')
      }

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
          coverage.zone_type,
          coverage.geometry,
          coverage.postal_codes,
          coverage.radius_km,
          coverage.center_lat,
          coverage.center_lng,
          min_order_amount ?? 0,
          delivery_fee ?? 0,
          estimated_delivery_hours ?? null,
          coverage.coverage_area_json,
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
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
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
      const { name, min_order_amount, delivery_fee, estimated_delivery_hours, is_active } = req.body
      const coverage = normalizeZoneCoverage(req.body)
      const { rows } = await query(
        `UPDATE delivery_zone SET
          name = COALESCE($1, name),
          zone_type = COALESCE($2, zone_type),
          geometry = CASE WHEN $2 = 'polygon' THEN COALESCE($3, geometry) WHEN $2 IS NOT NULL THEN NULL ELSE geometry END,
          postal_codes = CASE WHEN $2 = 'postal_codes' THEN $4 WHEN $2 IS NOT NULL THEN NULL ELSE postal_codes END,
          radius_km = CASE WHEN $2 = 'radius' THEN $5 WHEN $2 IS NOT NULL THEN NULL ELSE radius_km END,
          center_lat = CASE WHEN $2 = 'radius' THEN $6 WHEN $2 IS NOT NULL THEN NULL ELSE center_lat END,
          center_lng = CASE WHEN $2 = 'radius' THEN $7 WHEN $2 IS NOT NULL THEN NULL ELSE center_lng END,
          coverage_area_json = CASE WHEN $2 = 'polygon' THEN COALESCE($8, coverage_area_json) WHEN $2 IS NOT NULL THEN NULL ELSE coverage_area_json END,
          min_order_amount = COALESCE($9, min_order_amount),
          delivery_fee = COALESCE($10, delivery_fee),
          estimated_delivery_hours = COALESCE($11, estimated_delivery_hours),
          is_active = COALESCE($12, is_active),
          updated_at = now()
         WHERE id = $13 AND warehouse_id = $14 AND supplier_id = $15
         RETURNING *`,
        [
          name,
          coverage?.zone_type ?? null,
          coverage?.geometry ?? null,
          coverage?.postal_codes ?? null,
          coverage?.radius_km ?? null,
          coverage?.center_lat ?? null,
          coverage?.center_lng ?? null,
          coverage?.coverage_area_json ?? null,
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
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
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
