import express from 'express'
import {
  requireAuth,
  requireRole,
  getRestaurantIdForRequest,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import {
  requireFeature,
  checkLimit,
  buildLimitExceededPayload,
  getTenantSubscription,
  getRecommendedPlanNames,
} from '../lib/subscription.js'
import { isFeatureEnabledForTenant } from '../lib/feature-flags.js'
import { query, withTransaction } from '../lib/db.js'
import { startStage, mark } from '../middlewares/request-timing.js'
import { logger } from '../lib/logger.js'
import { ForbiddenError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import {
  listExpiryLots,
  getExpirySummary,
  createExpiryLot,
  updateExpiryLot,
  archiveExpiryLot,
  getExpirySettings,
  updateExpirySettings,
  runExpiryReminderCheck,
} from '../services/inventory-expiry.service.js'
import {
  listRestaurantReminders,
  recomputeCadencePatterns,
} from '../services/reorder-cadence.service.js'
import {
  getReorderAssistance,
  suppressReorderSuggestion,
  applyReorderAssistance,
} from '../services/restaurant-reorder-assistance.service.js'
import {
  getCachedForecasts,
  refreshRestaurantForecasts,
  markReorderForecastDirty,
} from '../services/reorder-forecast-cache.service.js'
import {
  resolveSmartReorderCapabilities,
  hasSmartReorderCapability,
} from '../lib/smart-reorder-tier.js'
import { explainReorderSuggestions, parseReorderIntent } from '../services/reorder-ai.service.js'

const router = express.Router()

async function getSmartReorderFeatureValue(req) {
  const tenant = req.tenantContext
  if (!tenant?.tenantId) return false
  const sub = await getTenantSubscription(tenant.tenantId, tenant.tenantType)
  return sub?.features?.smart_reorder
}

const inventoryManagementGate = requireFeature(
  'inventory_management',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(
  requireAuth,
  resolveTenantContext,
  inventoryManagementGate,
  requirePermission('INVENTORY_VIEW')
)

// Validation schemas
const adjustInventorySchema = z.object({
  adjustmentType: z.enum(['WASTAGE', 'SPOILAGE', 'COUNT_CORRECTION', 'OTHER']),
  quantity: z.number().positive(),
  reason: z.string().optional(),
  unitCost: z.number().optional(),
  wasteCategory: z
    .enum(['OVER_PRODUCTION', 'SPOILAGE', 'BREAKAGE', 'EXPIRED', 'OVERPORTIONING', 'OTHER'])
    .optional(),
})

const updateInventorySchema = z.object({
  quantity: z.number().min(0).optional(),
  lowStockThreshold: z.number().positive().optional(),
})

// Get restaurant inventory with products
router.get('/', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  startStage(req, 'handler')
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    const { rows } = await query(
      `
      WITH usage AS (
        SELECT
          restaurant_id,
          product_id,
          AVG(ABS(quantity)) FILTER (WHERE type = 'SUBTRACT') AS avg_daily_usage
        FROM inventory_movement_log
        WHERE restaurant_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY restaurant_id, product_id
      )
      SELECT
        ri.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.unit AS product_unit,
        p.category AS product_category_legacy,
        pc.name AS product_category,
        p.supplier_id,
        s.name AS supplier_name,
        COALESCE(ri.low_stock_threshold, 0) AS low_stock_threshold,
        b.name AS branch_name,
        COALESCE(u.avg_daily_usage, 0) AS avg_daily_usage,
        CASE
          WHEN COALESCE(u.avg_daily_usage, 0) > 0
          THEN ROUND(ri.quantity / NULLIF(u.avg_daily_usage, 0))
          ELSE NULL
        END AS days_of_stock,
        CASE
          WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN
            GREATEST(
              COALESCE(u.avg_daily_usage, ri.low_stock_threshold * 2) * 21,
              ri.low_stock_threshold * 2 - ri.quantity
            )
          ELSE NULL
        END AS suggested_reorder_qty
      FROM restaurant_inventory ri
      JOIN product p ON p.id = ri.product_id
      LEFT JOIN product_category pc ON pc.id = p.category_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN branch b ON b.id = ri.branch_id
      LEFT JOIN usage u
        ON u.restaurant_id = ri.restaurant_id AND u.product_id = ri.product_id
      WHERE ri.restaurant_id = $1
      ORDER BY ri.updated_at DESC, ri.created_at DESC
    `,
      [restaurantId],
      req
    )

    mark(req, 'handler')
    res.json({
      ok: true,
      data: { inventory: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    mark(req, 'handler')
    logger.error({
      message: 'Get restaurant inventory error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get all inventory movement history
router.get('/history', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }
    const { limit = '100' } = req.query

    const { rows } = await query(
      `
      SELECT 
        iml.*,
        p.name as product_name,
        p.sku as product_sku
      FROM inventory_movement_log iml
      JOIN product p ON p.id = iml.product_id
      WHERE iml.restaurant_id = $1
      ORDER BY iml.created_at DESC
      LIMIT $2
    `,
      [restaurantId, limit]
    )

    res.json({
      ok: true,
      data: { history: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get inventory history error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory history',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get inventory history for a specific product
router.get(
  '/history/:productId',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { productId } = req.params

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      const { rows } = await query(
        `
      SELECT 
        iml.*
      FROM inventory_movement_log iml
      WHERE iml.restaurant_id = $1 AND iml.product_id = $2
      ORDER BY iml.created_at DESC
      LIMIT 100
    `,
        [restaurantId, productId]
      )

      res.json({
        ok: true,
        data: { history: rows },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get inventory history error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get history',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Adjust inventory (for wastage, spoilage, etc.)
router.post(
  '/adjust',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_EDIT'),
  async (req, res) => {
    try {
      const { productId, ...data } = req.body
      const adjustmentData = adjustInventorySchema.parse(data)

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      if (
        adjustmentData.adjustmentType === 'WASTAGE' ||
        adjustmentData.adjustmentType === 'SPOILAGE'
      ) {
        const wasteEnabled = await isFeatureEnabledForTenant(
          restaurantId,
          'RESTAURANT',
          'waste_tracking'
        )
        if (!wasteEnabled) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FEATURE_DISABLED',
              message: 'Waste tracking is not included in your current plan',
            },
            requestId: req.requestId,
          })
        }
      }

      const result = await withTransaction(async (client) => {
        // Get current inventory
        const { rows: inventory } = await client.query(
          `
        SELECT quantity FROM restaurant_inventory
        WHERE restaurant_id = $1 AND product_id = $2
        FOR UPDATE
      `,
          [restaurantId, productId]
        )

        if (inventory.length === 0) {
          throw new NotFoundError('Product not found in inventory')
        }

        const balanceBefore = Number(inventory[0].quantity)
        const balanceAfter = Math.max(0, balanceBefore - adjustmentData.quantity)

        // Calculate unit cost and total cost if provided
        const unitCost = adjustmentData.unitCost || null
        const totalCost = unitCost ? unitCost * adjustmentData.quantity : null

        // Create adjustment record
        const {
          rows: [adjustment],
        } = await client.query(
          `
        INSERT INTO inventory_adjustment (
          restaurant_id, product_id, adjustment_type, quantity, reason, 
          unit_cost, total_cost, waste_category, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
          [
            restaurantId,
            productId,
            adjustmentData.adjustmentType,
            adjustmentData.quantity,
            adjustmentData.reason || null,
            unitCost,
            totalCost,
            adjustmentData.wasteCategory || null,
            req.userData.id,
          ]
        )

        // Update inventory
        await client.query(
          `
        UPDATE restaurant_inventory
        SET quantity = $1, updated_at = now()
        WHERE restaurant_id = $2 AND product_id = $3
      `,
          [balanceAfter, restaurantId, productId]
        )

        // Log movement
        await client.query(
          `
        INSERT INTO inventory_movement_log (
          restaurant_id, product_id, type, quantity, 
          balance_before, balance_after, reason,
          reference_id, reference_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
          [
            restaurantId,
            productId,
            adjustmentData.adjustmentType,
            -adjustmentData.quantity,
            balanceBefore,
            balanceAfter,
            adjustmentData.reason || null,
            adjustment.id,
            'ADJUSTMENT',
          ]
        )

        return adjustment
      })

      await markReorderForecastDirty(restaurantId, {
        productId,
        reason: 'inventory_adjustment',
      })

      logger.info('Inventory adjusted', {
        productId,
        adjustmentType: adjustmentData.adjustmentType,
        quantity: adjustmentData.quantity,
        actor: req.userData.id,
      })

      res.status(201).json({
        ok: true,
        data: { adjustment: result },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Adjust inventory error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to adjust inventory',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Manually add inventory
router.post(
  '/add',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_EDIT'),
  async (req, res) => {
    try {
      const { productId, quantity, reason } = req.body

      if (!quantity || quantity <= 0) {
        throw new ValidationError('Quantity must be positive')
      }

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      // Enforce restaurant_inventory_skus limit when adding a new tracked SKU
      const { rows: existingSku } = await query(
        `SELECT 1 FROM restaurant_inventory WHERE restaurant_id = $1 AND product_id = $2 LIMIT 1`,
        [restaurantId, productId]
      )
      if (existingSku.length === 0) {
        const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'restaurant_inventory_skus')
        if (limitCheck.isOverLimit && !limitCheck.isUnlimited) {
          const [subscription, recommendedPlans] = await Promise.all([
            getTenantSubscription(restaurantId, 'RESTAURANT'),
            getRecommendedPlanNames('RESTAURANT'),
          ])
          const err = buildLimitExceededPayload(
            limitCheck,
            'restaurant_inventory_skus',
            subscription?.plan_name || subscription?.plan_display_name,
            recommendedPlans,
            'Restaurant inventory SKU limit reached for your plan'
          )
          return res.status(403).json({
            ok: false,
            data: null,
            error: err,
            requestId: req.requestId,
          })
        }
      }

      await withTransaction(async (client) => {
        // Get or create inventory
        const { rows: inventory } = await client.query(
          `
        SELECT quantity FROM restaurant_inventory
        WHERE restaurant_id = $1 AND product_id = $2
      `,
          [restaurantId, productId]
        )

        const balanceBefore = inventory.length > 0 ? Number(inventory[0].quantity) : 0
        const balanceAfter = balanceBefore + quantity

        if (inventory.length > 0) {
          await client.query(
            `
          UPDATE restaurant_inventory
          SET quantity = $1, updated_at = now()
          WHERE restaurant_id = $2 AND product_id = $3
        `,
            [balanceAfter, restaurantId, productId]
          )
        } else {
          await client.query(
            `
          INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, updated_at)
          VALUES ($1, $2, $3, now())
        `,
            [restaurantId, productId, quantity]
          )
        }

        // Log movement
        await client.query(
          `
        INSERT INTO inventory_movement_log (
          restaurant_id, product_id, type, quantity, 
          balance_before, balance_after, reason, reference_type
        ) VALUES ($1, $2, 'ADD', $3, $4, $5, $6, 'MANUAL_ADD')
      `,
          [restaurantId, productId, quantity, balanceBefore, balanceAfter, reason || null]
        )
      })

      await markReorderForecastDirty(restaurantId, {
        productId,
        reason: 'inventory_add',
      })

      logger.info('Inventory added', {
        productId,
        quantity,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { message: 'Inventory updated successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Add inventory error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to add inventory',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

/**
 * GET /api/restaurant-inventory/reorder-suggestions
 *
 * Compute smart reorder suggestions for restaurant inventory based on:
 * - Historical usage rates (1/3/7/10/30/60/90 days)
 * - Average consumption between restocks
 * - Usage trends and seasonality detection
 * - Supplier lead times
 * - Last order size and frequency
 *
 * Returns items that need reordering with suggested quantities and urgency levels
 */
router.get(
  '/reorder-suggestions',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      // Get inventory with comprehensive usage analysis
      const { rows } = await query(
        `
      WITH usage_stats AS (
        -- Calculate usage rates for different time periods
        SELECT 
          iml.product_id,
          iml.restaurant_id,
          -- Last 1 day usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '1 day'
          ), 0) as usage_1day,
          -- Last 3 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '3 days'
          ), 0) as usage_3day,
          -- Last 7 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '7 days'
          ), 0) as usage_7day,
          -- Last 10 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '10 days'
          ), 0) as usage_10day,
          -- Last 30 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '30 days'
          ), 0) as usage_30day,
          -- Last 60 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '60 days'
          ), 0) as usage_60day,
          -- Last 90 days usage
          COALESCE((
            SELECT SUM(ABS(iml2.quantity))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'SUBTRACT'
              AND iml2.created_at >= NOW() - INTERVAL '90 days'
          ), 0) as usage_90day,
          -- Average daily usage over last 30 days
          COALESCE((
            SELECT AVG(daily_usage)
            FROM (
              SELECT DATE(iml2.created_at) as usage_date, 
                     SUM(ABS(iml2.quantity)) as daily_usage
              FROM inventory_movement_log iml2
              WHERE iml2.restaurant_id = iml.restaurant_id 
                AND iml2.product_id = iml.product_id
                AND iml2.type = 'SUBTRACT'
                AND iml2.created_at >= NOW() - INTERVAL '30 days'
              GROUP BY DATE(iml2.created_at)
            ) daily
          ), 0) as avg_daily_usage_30day,
          -- Calculate restock frequency (average days between ADD movements)
          COALESCE((
            SELECT AVG(days_diff)
            FROM (
              SELECT EXTRACT(DAY FROM (prev_date - next_date)) as days_diff
              FROM (
                SELECT created_at as prev_date,
                       LAG(created_at) OVER (ORDER BY created_at) as next_date
                FROM inventory_movement_log
                WHERE restaurant_id = iml.restaurant_id 
                  AND product_id = iml.product_id
                  AND type = 'ADD'
                  AND created_at >= NOW() - INTERVAL '90 days'
              ) restock_sequence
              WHERE next_date IS NOT NULL
            ) diffs
          ), 30) as avg_days_between_restocks,
          -- Last order quantity (from most recent ADD movement)
          (
            SELECT iml2.quantity
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'ADD'
            ORDER BY iml2.created_at DESC
            LIMIT 1
          ) as last_order_qty,
          -- Days since last restock
          COALESCE((
            SELECT EXTRACT(DAY FROM NOW() - MAX(iml2.created_at))
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'ADD'
          ), 999) as days_since_last_restock,
          -- Count restocks in last 90 days
          COALESCE((
            SELECT COUNT(*)
            FROM inventory_movement_log iml2
            WHERE iml2.restaurant_id = iml.restaurant_id 
              AND iml2.product_id = iml.product_id
              AND iml2.type = 'ADD'
              AND iml2.created_at >= NOW() - INTERVAL '90 days'
          ), 0) as restock_count_90day,
          -- Calculate usage trend (comparing recent vs older usage)
          CASE 
            WHEN COALESCE((
              SELECT SUM(ABS(iml2.quantity))
              FROM inventory_movement_log iml2
              WHERE iml2.restaurant_id = iml.restaurant_id 
                AND iml2.product_id = iml.product_id
                AND iml2.type = 'SUBTRACT'
                AND iml2.created_at >= NOW() - INTERVAL '15 days'
            ), 0) > 0 AND COALESCE((
              SELECT SUM(ABS(iml2.quantity))
              FROM inventory_movement_log iml2
              WHERE iml2.restaurant_id = iml.restaurant_id 
                AND iml2.product_id = iml.product_id
                AND iml2.type = 'SUBTRACT'
                AND iml2.created_at >= NOW() - INTERVAL '30 days'
                AND iml2.created_at < NOW() - INTERVAL '15 days'
            ), 0) > 0
            THEN (
              COALESCE((
                SELECT SUM(ABS(iml2.quantity))
                FROM inventory_movement_log iml2
                WHERE iml2.restaurant_id = iml.restaurant_id 
                  AND iml2.product_id = iml.product_id
                  AND iml2.type = 'SUBTRACT'
                  AND iml2.created_at >= NOW() - INTERVAL '15 days'
              ), 0) / 
              COALESCE((
                SELECT SUM(ABS(iml2.quantity))
                FROM inventory_movement_log iml2
                WHERE iml2.restaurant_id = iml.restaurant_id 
                  AND iml2.product_id = iml.product_id
                  AND iml2.type = 'SUBTRACT'
                  AND iml2.created_at >= NOW() - INTERVAL '30 days'
                  AND iml2.created_at < NOW() - INTERVAL '15 days'
              ), 0)
            ) - 1
            ELSE 0
          END as usage_trend
        FROM inventory_movement_log iml
        WHERE iml.restaurant_id = $1
        GROUP BY iml.product_id, iml.restaurant_id
      ),
      order_stats AS (
        -- Get historical order data
        SELECT 
          oi.product_id,
          oi.order_id,
          co.restaurant_id,
          co.placed_at,
          oi.quantity as order_qty,
          ROW_NUMBER() OVER (PARTITION BY oi.product_id ORDER BY co.placed_at DESC) as rn
        FROM order_item oi
        JOIN customer_order co ON co.id = oi.order_id
        WHERE co.restaurant_id = $1
          AND co.placed_at IS NOT NULL
      )
      SELECT 
        ri.id,
        ri.restaurant_id,
        ri.product_id,
        ri.quantity as current_qty,
        ri.low_stock_threshold,
        ri.branch_id,
        p.name as product_name,
        p.sku as product_sku,
        p.unit as product_unit,
        s.name as supplier_name,
        s.id as supplier_id,
        pis.lead_time_days,
        pis.moq,
        pis.order_multiple,
        b.name as branch_name,
        COALESCE(us.usage_1day, 0) as usage_1day,
        COALESCE(us.usage_3day, 0) as usage_3day,
        COALESCE(us.usage_7day, 0) as usage_7day,
        COALESCE(us.usage_10day, 0) as usage_10day,
        COALESCE(us.usage_30day, 0) as usage_30day,
        COALESCE(us.usage_60day, 0) as usage_60day,
        COALESCE(us.usage_90day, 0) as usage_90day,
        COALESCE(us.avg_daily_usage_30day, 0) as avg_daily_usage_30day,
        COALESCE(us.avg_days_between_restocks, 30) as avg_days_between_restocks,
        COALESCE(us.last_order_qty, 0) as last_order_qty,
        COALESCE(us.days_since_last_restock, 0) as days_since_last_restock,
        COALESCE(us.restock_count_90day, 0) as restock_count_90day,
        COALESCE(us.usage_trend, 0) as usage_trend,
        COALESCE(os.order_qty, 0) as last_order_item_qty,
        -- Calculate days of stock remaining
        CASE 
          WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 
          THEN ri.quantity / NULLIF(us.avg_daily_usage_30day, 0)
          ELSE NULL
        END as days_of_stock_remaining,
        -- Smart reorder suggestion logic
        CASE 
          -- If already below low stock threshold, urgent reorder
          WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN
            GREATEST(
              us.avg_daily_usage_30day * (COALESCE(pis.lead_time_days, 7) + 14), -- Usage during lead time + 2 weeks buffer
              us.last_order_qty,
              pis.moq
            )
          -- If projected to run out soon (less than lead time + buffer)
          WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 
            AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 14) THEN
            GREATEST(
              us.avg_daily_usage_30day * (COALESCE(pis.lead_time_days, 7) + 14) - ri.quantity,
              us.last_order_qty * 0.8,
              pis.moq
            )
          ELSE NULL
        END as suggested_reorder_qty,
        -- Determine urgency level
        CASE 
          WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 'URGENT'
          WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 
            AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 7) THEN 'HIGH'
          WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 
            AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 21) THEN 'MEDIUM'
          ELSE 'LOW'
        END as urgency_level,
        -- Calculate confidence score based on data availability
        LEAST(100, 
          CASE WHEN us.usage_30day > 0 THEN 30 ELSE 0 END +
          CASE WHEN us.usage_60day > 0 THEN 30 ELSE 0 END +
          CASE WHEN us.restock_count_90day >= 2 THEN 20 ELSE 0 END +
          CASE WHEN us.last_order_qty > 0 THEN 20 ELSE 0 END
        ) as confidence_score
      FROM restaurant_inventory ri
      JOIN product p ON p.id = ri.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
      LEFT JOIN branch b ON b.id = ri.branch_id
      LEFT JOIN usage_stats us ON us.product_id = ri.product_id AND us.restaurant_id = ri.restaurant_id
      LEFT JOIN order_stats os ON os.product_id = ri.product_id AND os.rn = 1
      WHERE ri.restaurant_id = $1
        AND ri.quantity < COALESCE(ri.low_stock_threshold * 3, 999999) -- Only show items that might need reordering
      ORDER BY 
        CASE 
          WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 1
          WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 
            AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 14) THEN 2
          ELSE 3
        END,
        ri.quantity ASC
    `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: { suggestions: rows },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.warn('Reorder suggestions unavailable, returning empty set:', error.message)
      return res.json({
        ok: true,
        data: { suggestions: [] },
        error: null,
        requestId: req.requestId,
      })
    }
  }
)

// Get waste analytics for the restaurant
const wasteTrackingGate = requireFeature(
  'waste_tracking',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.get(
  '/waste-analytics',
  requireRole(['RESTAURANT', 'ADMIN']),
  wasteTrackingGate,
  async (req, res) => {
    try {
      const periodRaw = parseInt(String(req.query.period || '30'), 10)
      const period = Number.isFinite(periodRaw) ? Math.min(Math.max(periodRaw, 7), 90) : 30

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      // Get waste analytics
      const { rows: analytics } = await query(
        `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku as product_sku,
        p.unit as product_unit,
        s.name as supplier_name,
        COUNT(ia.id) as waste_incidents,
        SUM(CASE WHEN ia.adjustment_type = 'WASTAGE' THEN ia.quantity ELSE 0 END) as total_wastage,
        SUM(CASE WHEN ia.adjustment_type = 'SPOILAGE' THEN ia.quantity ELSE 0 END) as total_spoilage,
        SUM(ia.quantity) as total_waste_qty,
        COALESCE(SUM(ia.total_cost), 
          SUM(ia.unit_cost * ia.quantity)) as total_waste_cost,
        COALESCE(
          (SUM(CASE WHEN ia.adjustment_type = 'WASTAGE' THEN ia.total_cost ELSE 0 END) +
           SUM(ia.unit_cost * CASE WHEN ia.adjustment_type = 'WASTAGE' THEN ia.quantity ELSE 0 END)),
          0
        ) as wastage_cost,
        COALESCE(
          (SUM(CASE WHEN ia.adjustment_type = 'SPOILAGE' THEN ia.total_cost ELSE 0 END) +
           SUM(ia.unit_cost * CASE WHEN ia.adjustment_type = 'SPOILAGE' THEN ia.quantity ELSE 0 END)),
          0
        ) as spoilage_cost,
        -- Average waste per incident
        COALESCE(AVG(ia.quantity), 0) as avg_waste_per_incident,
        -- Category breakdown
        jsonb_object_agg(
          ia.waste_category,
          COALESCE(ia.quantity, 0)
        ) FILTER (WHERE ia.waste_category IS NOT NULL) as category_breakdown,
        -- First and last incident
        MIN(ia.created_at) as first_incident,
        MAX(ia.created_at) as last_incident,
        -- Current stock
        ri.quantity as current_stock
      FROM inventory_adjustment ia
      JOIN product p ON p.id = ia.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN restaurant_inventory ri ON ri.restaurant_id = ia.restaurant_id 
        AND ri.product_id = ia.product_id
      WHERE ia.restaurant_id = $1
        AND ia.adjustment_type IN ('WASTAGE', 'SPOILAGE')
        AND ia.created_at >= NOW() - ($2::int * INTERVAL '1 day')
      GROUP BY p.id, p.name, p.sku, p.unit, s.name, ri.quantity
      HAVING SUM(ia.quantity) > 0
      ORDER BY total_waste_cost DESC NULLS LAST, total_waste_qty DESC
      LIMIT 50
    `,
        [restaurantId, period]
      )

      // Get summary totals
      const { rows: summary } = await query(
        `
      SELECT 
        COUNT(*) as total_incidents,
        SUM(quantity) as total_waste_qty,
        COALESCE(SUM(total_cost), SUM(unit_cost * quantity)) as total_waste_cost,
        COUNT(DISTINCT product_id) as products_affected,
        SUM(CASE WHEN adjustment_type = 'WASTAGE' THEN quantity ELSE 0 END) as total_wastage_qty,
        SUM(CASE WHEN adjustment_type = 'SPOILAGE' THEN quantity ELSE 0 END) as total_spoilage_qty
      FROM inventory_adjustment
      WHERE restaurant_id = $1
        AND adjustment_type IN ('WASTAGE', 'SPOILAGE')
        AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
    `,
        [restaurantId, period]
      )

      // Get waste trend (last 7 days daily breakdown)
      const { rows: trend } = await query(
        `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as incidents,
        SUM(quantity) as waste_qty,
        COALESCE(SUM(total_cost), SUM(unit_cost * quantity)) as waste_cost
      FROM inventory_adjustment
      WHERE restaurant_id = $1
        AND adjustment_type IN ('WASTAGE', 'SPOILAGE')
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: {
          analytics,
          summary: summary[0] || {},
          trend,
          period: parseInt(period),
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get waste analytics error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get waste analytics',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

const expiryLotSchema = z.object({
  itemName: z.string().min(1),
  productId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  orderItemId: z.string().uuid().optional().nullable(),
  productSku: z.string().optional().nullable(),
  quantity: z.number().min(0).optional(),
  unit: z.string().optional(),
  batchLotNumber: z.string().optional().nullable(),
  receivedDate: z.string().optional().nullable(),
  expiryDate: z.string().min(1),
  storageLocation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

router.get('/expiry', requireRole(['RESTAURANT', 'ADMIN']), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) throw new ValidationError('Restaurant not found')
    const data = await listExpiryLots(restaurantId, {
      status: req.query.status,
      supplierId: req.query.supplier_id || req.query.supplierId,
      storageLocation: req.query.storage_location || req.query.storageLocation,
      categoryId: req.query.category_id || req.query.categoryId,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/expiry/summary', requireRole(['RESTAURANT', 'ADMIN']), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) throw new ValidationError('Restaurant not found')
    const summary = await getExpirySummary(restaurantId)
    res.json({ ok: true, data: { summary }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/expiry/settings', requireRole(['RESTAURANT', 'ADMIN']), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) throw new ValidationError('Restaurant not found')
    const settings = await getExpirySettings(restaurantId)
    res.json({ ok: true, data: { settings }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch(
  '/expiry/settings',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const settings = await updateExpirySettings(restaurantId, {
        expiringSoonDays: req.body.expiringSoonDays ?? req.body.expiring_soon_days,
      })
      res.json({ ok: true, data: { settings }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/expiry',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const body = expiryLotSchema.parse(req.body)
      const lot = await createExpiryLot(restaurantId, body)
      res.status(201).json({ ok: true, data: { lot }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/expiry/:lotId',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const lot = await updateExpiryLot(restaurantId, req.params.lotId, req.body)
      res.json({ ok: true, data: { lot }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/expiry/:lotId',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const result = await archiveExpiryLot(restaurantId, req.params.lotId)
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/expiry/check-reminders',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const { runManualCronJob, CRON_JOBS } = await import('../lib/cron-runner.js')
      const { result } = await runManualCronJob(CRON_JOBS.OPERATIONAL_REMINDERS, () =>
        runExpiryReminderCheck({ restaurantId })
      )
      res.json({ ok: true, data: result ?? {}, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/reorder-reminders',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const reminders = await listRestaurantReminders(restaurantId)
      res.json({ ok: true, data: { reminders }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-cadence/recompute',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const result = await recomputeCadencePatterns({ restaurantId })
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const suppressSchema = z.object({
  scopeType: z.enum(['product', 'cadence', 'supplier_product']),
  scopeId: z.string().min(1),
  action: z.enum(['snooze', 'not_needed']),
  snoozeDays: z.number().int().min(1).max(90).optional(),
})

router.get(
  '/reorder-assistance',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const smartReorderFeatureValue = await getSmartReorderFeatureValue(req)
      const branchId = req.query.branchId ? String(req.query.branchId) : null
      const data = await getReorderAssistance(restaurantId, {
        smartReorderFeatureValue,
        branchId,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/reorder-forecasts',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const featureValue = await getSmartReorderFeatureValue(req)
      const caps = resolveSmartReorderCapabilities(featureValue)
      if (!caps.capabilities.forecast) {
        return res.json({
          ok: true,
          data: { forecasts: [], smartReorder: caps },
          error: null,
          requestId: req.requestId,
        })
      }
      const branchId = req.query.branchId ? String(req.query.branchId) : null
      const forecasts = await getCachedForecasts(restaurantId, { branchId })
      res.json({
        ok: true,
        data: { forecasts, smartReorder: caps },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-forecasts/refresh',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const featureValue = await getSmartReorderFeatureValue(req)
      const branchId = req.body?.branchId ?? req.query?.branchId ?? null
      const result = await refreshRestaurantForecasts(restaurantId, {
        featureValue,
        branchId: branchId ? String(branchId) : null,
        force: true,
      })
      const forecasts = await getCachedForecasts(restaurantId, {
        branchId: branchId ? String(branchId) : null,
      })
      res.json({
        ok: true,
        data: { ...result, forecasts },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

const reorderExplainSchema = z.object({
  branchId: z.string().uuid().optional(),
})

const reorderAskSchema = z.object({
  query: z.string().min(1).max(500),
  branchId: z.string().uuid().optional(),
})

const reorderApplySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        supplierId: z.string().uuid().optional(),
      })
    )
    .min(1)
    .max(50),
  branchId: z.string().uuid().optional(),
})

router.post(
  '/reorder-assistance/explain',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const smartReorderFeatureValue = await getSmartReorderFeatureValue(req)
      if (!hasSmartReorderCapability(smartReorderFeatureValue, 'forecast')) {
        throw new ForbiddenError('AI reorder explanations require Gold or Platinum smart reorder')
      }
      const body = reorderExplainSchema.parse(req.body ?? {})
      const data = await explainReorderSuggestions(restaurantId, {
        smartReorderFeatureValue,
        branchId: body.branchId ?? null,
        userId: req.user?.id,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-assistance/ask',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const smartReorderFeatureValue = await getSmartReorderFeatureValue(req)
      if (!hasSmartReorderCapability(smartReorderFeatureValue, 'seasonality')) {
        throw new ForbiddenError('Natural-language reorder ask requires Platinum smart reorder')
      }
      const body = reorderAskSchema.parse(req.body)
      const data = await parseReorderIntent(restaurantId, {
        query: body.query,
        smartReorderFeatureValue,
        branchId: body.branchId ?? null,
        userId: req.user?.id,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-assistance/suppress',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const body = suppressSchema.parse(req.body)
      const result = await suppressReorderSuggestion(restaurantId, body)
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-assistance/apply',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVENTORY_MANAGE'),
  requireFeature(
    'smart_reorder',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const body = reorderApplySchema.parse(req.body ?? {})
      const smartReorderFeatureValue = await getSmartReorderFeatureValue(req)
      const data = await applyReorderAssistance(restaurantId, {
        items: body.items,
        branchId: body.branchId ?? null,
        smartReorderFeatureValue,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as restaurantInventoryRoutes }
