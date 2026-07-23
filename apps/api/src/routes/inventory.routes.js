import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import { notifySupplierLowStock, notifyOutOfStock } from '../services/notification.service.js'
import { requireFeature } from '../lib/subscription.js'
import {
  computeSupplierStockFlags,
  DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD,
} from '../lib/supplier-stock-status.js'
import {
  listSupplierStockDisplay,
  supplierUsesWarehouseInventory,
} from '../services/supplier-stock.service.js'
import { syncWarehouseMirrorFromLegacy } from '../services/supplier-order-stock.service.js'

const router = express.Router()

const inventoryManagementGate = requireFeature(
  'inventory_management',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, requirePermission('INVENTORY_VIEW'))

const inventoryListSchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
})

// Get all inventory for current supplier
router.get('/', requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const params = inventoryListSchema.parse(req.query)
    let inventoryQuery = `
      SELECT 
        i.product_id as id,
        i.product_id,
        i.warehouse_id,
        i.available_qty,
        i.reserved_qty,
        i.updated_at,
        p.name as product_name,
        p.sku,
        p.supplier_id,
        s.name as supplier_name,
        COALESCE(pis.low_stock_threshold, ${DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD}) as low_stock_threshold,
        w.name as warehouse_name,
        w.code as warehouse_code
      FROM inventory i
      JOIN product p ON p.id = i.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      LEFT JOIN warehouse w ON w.id = i.warehouse_id
    `

    const countQueryBase = `
      SELECT COUNT(*)::int AS total
      FROM inventory i
      JOIN product p ON p.id = i.product_id
      JOIN supplier s ON s.id = p.supplier_id
    `

    const queryParams = []
    let whereClause = ''

    // For suppliers, only show their active workspace products
    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.json({
          ok: true,
          data: {
            inventory: [],
            pagination: { total: 0, limit: params.limit, offset: params.offset },
          },
          error: null,
          requestId: req.requestId,
        })
      }
      whereClause = ` WHERE p.supplier_id = $1`
      queryParams.push(supplierId)
    }

    inventoryQuery += `${whereClause} ORDER BY p.name LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`
    const listParams = [...queryParams, params.limit, params.offset]

    logger.debug('Executing inventory query')
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(inventoryQuery, listParams),
      query(`${countQueryBase}${whereClause}`, queryParams),
    ])

    // When warehouse inventory is the SoT, overlay aggregated warehouse qty onto legacy rows.
    // Missing WH rows mean 0 available (do not fall back to legacy — that caused false "in stock").
    let warehouseQtyByProduct = null
    if (req.userData.role === 'SUPPLIER' && queryParams[0]) {
      const supplierId = queryParams[0]
      if (await supplierUsesWarehouseInventory(supplierId)) {
        const stockRows = await listSupplierStockDisplay(supplierId, {
          productIds: rows.map((r) => r.product_id),
        })
        warehouseQtyByProduct = new Map(
          stockRows.map((r) => [
            r.product_id,
            {
              available_qty: Number(r.available_qty || 0),
              reserved_qty: Number(r.reserved_qty || 0),
              source: r.source,
            },
          ])
        )
      }
    }

    // Format the data for frontend
    const formattedInventory = rows.map((row) => {
      const overlay = warehouseQtyByProduct?.get(row.product_id)
      const availableQty = warehouseQtyByProduct
        ? Number(overlay?.available_qty ?? 0)
        : row.available_qty
      const reservedQty = warehouseQtyByProduct
        ? Number(overlay?.reserved_qty ?? 0)
        : row.reserved_qty
      const flags = computeSupplierStockFlags(availableQty, row.low_stock_threshold)
      return {
        ...row,
        available_qty: availableQty,
        reserved_qty: reservedQty,
        stock_source:
          overlay?.source || (warehouseQtyByProduct ? 'warehouse_inventory' : 'inventory'),
        low_stock_threshold: flags.lowStockThreshold,
        isLowStock: flags.isLowStock,
        isOutOfStock: flags.isOutOfStock,
        isInStock: flags.isInStock,
        stockStatus: flags.stockStatus,
      }
    })

    res.json({
      ok: true,
      data: {
        inventory: formattedInventory,
        pagination: {
          total: countRows[0]?.total ?? 0,
          limit: params.limit,
          offset: params.offset,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get inventory list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Validation schemas
const inventoryUpdateSchema = z.object({
  availableQty: z.number().min(0),
})

const adjustmentSchema = z.object({
  adjustmentType: z.enum(['IN', 'OUT']),
  quantity: z.number().positive(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  warehouseId: z.string().uuid().optional(),
})

const warehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
})

const inventorySettingsSchema = z.object({
  moq: z.number().positive().default(1),
  orderMultiple: z.number().positive().default(1),
  leadTimeDays: z.number().int().min(0).default(0),
  deliveryWindows: z
    .array(
      z.object({
        day: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      })
    )
    .optional(),
  lowStockThreshold: z.number().default(10),
  backorderAllowed: z.boolean().default(false),
  backorderEtaDays: z.number().int().min(0).optional(),
})

// Helper: Check if supplier workspace owns the product
async function checkProductOwnership(productId, supplierId) {
  const { rows } = await query(`SELECT p.* FROM product p WHERE p.id = $1`, [productId])

  if (rows.length === 0) {
    throw new NotFoundError('Product not found')
  }

  if (supplierId && rows[0].supplier_id !== supplierId) {
    throw new ValidationError('You can only manage inventory for your own products')
  }

  return rows[0]
}

// Get inventory for a product
router.get('/product/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params

    const { rows } = await query(
      `
      SELECT 
        i.*, 
        p.name as product_name, 
        p.sku,
        p.supplier_id,
        s.name as supplier_name,
        pis.moq,
        pis.order_multiple,
        pis.lead_time_days,
        pis.delivery_windows,
        pis.low_stock_threshold,
        pis.backorder_allowed,
        pis.backorder_eta_days,
        w.name as warehouse_name,
        w.code as warehouse_code
      FROM inventory i
      JOIN product p ON p.id = i.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      LEFT JOIN warehouse w ON w.id = i.warehouse_id
      WHERE i.product_id = $1
    `,
      [productId]
    )

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Inventory not found for this product',
        },
        requestId: req.requestId,
      })
    }

    const inventory = rows[0]

    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId || inventory.supplier_id !== supplierId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Inventory not found for this product',
          },
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Inventory not found for this product',
          },
          requestId: req.requestId,
        })
      }
      const { rows: connected } = await query(
        `
        SELECT 1
        FROM supplier_follow sf
        WHERE sf.supplier_id = $1
          AND sf.restaurant_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM supplier_blocklist sb
            WHERE sb.supplier_id = $1 AND sb.restaurant_id = $2
          )
        LIMIT 1
      `,
        [inventory.supplier_id, restaurantId]
      )
      if (!connected.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Inventory not found for this product',
          },
          requestId: req.requestId,
        })
      }
    }

    res.json({
      ok: true,
      data: { inventory },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get inventory error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory',
      },
      requestId: req.requestId,
    })
  }
})

// Update inventory (direct update without adjustment log)
router.patch(
  '/product/:productId',
  inventoryManagementGate,
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('INVENTORY_EDIT'),
  async (req, res) => {
    try {
      const { productId } = req.params
      const updateData = inventoryUpdateSchema.parse(req.body)

      // Verify product ownership for suppliers
      let supplierId = null
      if (req.userData.role === 'SUPPLIER') {
        supplierId = await getSupplierIdForRequest(req)
        await checkProductOwnership(productId, supplierId)
      } else if (req.userData.role === 'ADMIN') {
        const { rows: productRows } = await query(`SELECT supplier_id FROM product WHERE id = $1`, [
          productId,
        ])
        supplierId = productRows[0]?.supplier_id || null
      }

      // Update or insert inventory
      const { rows } = await query(
        `
      INSERT INTO inventory (product_id, available_qty, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (product_id) 
      DO UPDATE SET 
        available_qty = EXCLUDED.available_qty,
        updated_at = now()
      RETURNING *
    `,
        [productId, updateData.availableQty]
      )

      if (supplierId) {
        await syncWarehouseMirrorFromLegacy(query, {
          supplierId,
          productId,
          availableQty: updateData.availableQty,
          reservedQty: rows[0]?.reserved_qty || 0,
        })
      }

      logger.info('Inventory updated', {
        productId,
        availableQty: updateData.availableQty,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { inventory: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid inventory data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Update inventory error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to update inventory',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Create inventory adjustment (with reason tracking)
router.post(
  '/product/:productId/adjustment',
  inventoryManagementGate,
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('INVENTORY_EDIT'),
  async (req, res) => {
    try {
      const { productId } = req.params
      const adjustmentData = adjustmentSchema.parse(req.body)

      // Verify product ownership for suppliers
      let supplierId = null
      if (req.userData.role === 'SUPPLIER') {
        supplierId = await getSupplierIdForRequest(req)
        await checkProductOwnership(productId, supplierId)
      }

      // Start transaction
      await query('BEGIN')

      try {
        // Get current inventory
        const { rows: inventory } = await query('SELECT * FROM inventory WHERE product_id = $1', [
          productId,
        ])

        if (inventory.length === 0) {
          throw new NotFoundError('Inventory not found for this product')
        }

        if (!supplierId) {
          const { rows: productRows } = await query(
            `SELECT supplier_id FROM product WHERE id = $1`,
            [productId]
          )
          supplierId = productRows[0]?.supplier_id || null
        }

        const currentQty = parseFloat(inventory[0].available_qty)
        const adjustment =
          adjustmentData.adjustmentType === 'IN'
            ? adjustmentData.quantity
            : -adjustmentData.quantity
        const newQty = Math.max(0, currentQty + adjustment)

        // Update inventory
        const { rows: updatedInventory } = await query(
          `
        UPDATE inventory 
        SET available_qty = $1, updated_at = now()
        WHERE product_id = $2
        RETURNING *
      `,
          [newQty, productId]
        )

        if (supplierId) {
          await syncWarehouseMirrorFromLegacy(query, {
            supplierId,
            productId,
            availableQty: newQty,
            reservedQty: updatedInventory[0]?.reserved_qty || 0,
            warehouseId: adjustmentData.warehouseId || null,
          })
        }

        // Create adjustment record
        const { rows: adjustmentRecord } = await query(
          `
        INSERT INTO inventory_adjustment (
          product_id, warehouse_id, adjustment_type, quantity, reason, notes, actor_sub
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
          [
            productId,
            adjustmentData.warehouseId || null,
            adjustmentData.adjustmentType,
            adjustmentData.quantity,
            adjustmentData.reason,
            adjustmentData.notes || null,
            req.userSub,
          ]
        )

        // Check and create low stock alert
        const { rows: settings } = await query(
          'SELECT low_stock_threshold FROM product_inventory_settings WHERE product_id = $1',
          [productId]
        )

        const threshold = settings[0]?.low_stock_threshold ?? DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD
        if (computeSupplierStockFlags(newQty, threshold).isLowStock) {
          await query(
            `
          INSERT INTO inventory_alert (product_id, warehouse_id, alert_type, threshold_value, current_value)
          VALUES ($1, $2, 'LOW_STOCK', $3, $4)
          ON CONFLICT DO NOTHING
        `,
            [productId, adjustmentData.warehouseId || null, threshold, newQty]
          )
          const { rows: productNameRow } = await query('SELECT name FROM product WHERE id = $1', [
            productId,
          ])
          const productName = productNameRow[0]?.name || null
          notifySupplierLowStock({
            productId,
            warehouseId: adjustmentData.warehouseId || null,
            productName,
            threshold,
            currentValue: newQty,
          }).catch((err) => logger.warn('Low-stock notification failed', { err: err.message }))
        }

        if (newQty <= 0 && currentQty > 0) {
          const { rows: pRow } = await query('SELECT name FROM product WHERE id = $1', [productId])
          notifyOutOfStock({
            productId,
            warehouseId: adjustmentData.warehouseId || null,
            productName: pRow[0]?.name || null,
          }).catch((err) => logger.warn('Out-of-stock notification failed', { err: err.message }))
        }

        await query('COMMIT')

        logger.info('Inventory adjustment created', {
          productId,
          adjustmentType: adjustmentData.adjustmentType,
          quantity: adjustmentData.quantity,
          newQty,
          actor: req.userData.id,
        })

        res.status(201).json({
          ok: true,
          data: {
            inventory: updatedInventory[0],
            adjustment: adjustmentRecord[0],
          },
          error: null,
          requestId: req.requestId,
        })
      } catch (error) {
        await query('ROLLBACK')
        throw error
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid adjustment data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create adjustment error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create adjustment',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get adjustment history for a product
router.get('/product/:productId/adjustments', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params

    const { rows } = await query(
      `
      SELECT 
        ia.*,
        p.name as product_name,
        p.sku,
        w.name as warehouse_name
      FROM inventory_adjustment ia
      JOIN product p ON p.id = ia.product_id
      LEFT JOIN warehouse w ON w.id = ia.warehouse_id
      WHERE ia.product_id = $1
      ORDER BY ia.created_at DESC
      LIMIT 100
    `,
      [productId]
    )

    res.json({
      ok: true,
      data: { adjustments: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get adjustments error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get adjustments',
      },
      requestId: req.requestId,
    })
  }
})

// Manage product inventory settings
router.patch(
  '/product/:productId/settings',
  inventoryManagementGate,
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('INVENTORY_EDIT'),
  async (req, res) => {
    try {
      const { productId } = req.params
      const settings = inventorySettingsSchema.parse(req.body)

      // Verify product ownership for suppliers
      if (req.userData.role === 'SUPPLIER') {
        const supplierId = await getSupplierIdForRequest(req)
        await checkProductOwnership(productId, supplierId)
      }

      const { rows } = await query(
        `
      INSERT INTO product_inventory_settings (
        product_id, moq, order_multiple, lead_time_days, delivery_windows,
        low_stock_threshold, backorder_allowed, backorder_eta_days, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (product_id)
      DO UPDATE SET
        moq = EXCLUDED.moq,
        order_multiple = EXCLUDED.order_multiple,
        lead_time_days = EXCLUDED.lead_time_days,
        delivery_windows = EXCLUDED.delivery_windows,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        backorder_allowed = EXCLUDED.backorder_allowed,
        backorder_eta_days = EXCLUDED.backorder_eta_days,
        updated_at = now()
      RETURNING *
    `,
        [
          productId,
          settings.moq,
          settings.orderMultiple,
          settings.leadTimeDays,
          settings.deliveryWindows ? JSON.stringify(settings.deliveryWindows) : null,
          settings.lowStockThreshold,
          settings.backorderAllowed,
          settings.backorderEtaDays || null,
        ]
      )

      logger.info('Inventory settings updated', {
        productId,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { settings: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid settings data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Update settings error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to update settings',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get active inventory alerts for supplier
router.get('/alerts', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    let alertsQuery = `
      SELECT 
        ia.*,
        p.name as product_name,
        p.sku,
        p.supplier_id,
        s.contact_email,
        w.name as warehouse_name
      FROM inventory_alert ia
      JOIN product p ON p.id = ia.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN warehouse w ON w.id = ia.warehouse_id
      WHERE ia.is_acknowledged = false
    `

    const queryParams = []

    // For suppliers, only show their active workspace products
    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.json({
          ok: true,
          data: { alerts: [] },
          error: null,
          requestId: req.requestId,
        })
      }
      alertsQuery += ` AND p.supplier_id = $1`
      queryParams.push(supplierId)
    }

    alertsQuery += ` ORDER BY ia.created_at DESC LIMIT 50`

    const { rows } = await query(alertsQuery, queryParams)

    res.json({
      ok: true,
      data: { alerts: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get alerts error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get alerts',
      },
      requestId: req.requestId,
    })
  }
})

// Acknowledge an alert
router.patch(
  '/alerts/:alertId/acknowledge',
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const { alertId } = req.params

      // Verify ownership for suppliers
      if (req.userData.role === 'SUPPLIER') {
        const supplierId = await getSupplierIdForRequest(req)
        const { rows: alerts } = await query(
          `
        SELECT ia.*, p.supplier_id
        FROM inventory_alert ia
        JOIN product p ON p.id = ia.product_id
        WHERE ia.id = $1
      `,
          [alertId]
        )

        if (alerts.length === 0) {
          throw new NotFoundError('Alert not found')
        }

        if (!supplierId || alerts[0].supplier_id !== supplierId) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Access denied',
            },
            requestId: req.requestId,
          })
        }
      }

      const { rows } = await query(
        `
      UPDATE inventory_alert
      SET is_acknowledged = true,
          acknowledged_at = now(),
          acknowledged_by = $1
      WHERE id = $2
      RETURNING *
    `,
        [req.userSub, alertId]
      )

      if (rows.length === 0) {
        throw new NotFoundError('Alert not found')
      }

      res.json({
        ok: true,
        data: { alert: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Acknowledge alert error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to acknowledge alert',
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as inventoryRoutes }
