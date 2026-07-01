import express from 'express'
import {
  requireAuth,
  requireRole,
  getRestaurantIdForRequest,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { ordersCreateMutationGuard } from '../lib/route-permissions.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { executeScheduledOrders } from '../services/scheduled-orders.service.js'
import {
  suggestQuickListItems,
  applyQuickListSuggestions,
} from '../services/quick-list-ai.service.js'
import { hasQuickListCapability } from '../lib/quick-list-tier.js'
import {
  checkLimit,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  buildFeatureNotAvailablePayload,
  requireFeature,
  isQuickListAutomationEnabled,
  resolveEffectivePlanFeatures,
} from '../lib/subscription.js'
import { z } from 'zod'
import { mapQuickListRow } from '../lib/quick-list-schedule.js'

const router = express.Router()

const quickListsFeatureGate = requireFeature(
  'quick_lists',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

// Validation schemas
const createQuickListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        supplierId: z.string().uuid(),
        quantity: z.number().positive(),
        notes: z.string().optional(),
      })
    )
    .optional()
    .default([]),
})

const updateQuickListSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional().nullable(),
})

const scheduleQuickListSchema = z
  .object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY']),
    daysOfWeek: z.array(z.string()).optional(), // ['MONDAY', 'WEDNESDAY', 'FRIDAY']
    preferredTime: z.string().optional(), // HH:MM format
    autoCreateOrder: z.boolean().default(true),
    useAiQuantities: z.boolean().optional(),
    nextExecutionDate: z.string().optional(), // YYYY-MM-DD
  })
  .refine(
    (data) => {
      // Validate daysOfWeek based on frequency
      if (data.frequency === 'WEEKLY' && data.daysOfWeek) {
        if (data.daysOfWeek.length > 1) {
          return false
        }
      }
      if (data.frequency === 'WEEKLY_3X' && data.daysOfWeek) {
        if (data.daysOfWeek.length > 3) {
          return false
        }
      }
      return true
    },
    (data) => {
      if (data.frequency === 'WEEKLY' && data.daysOfWeek && data.daysOfWeek.length > 1) {
        return { message: 'Once per week frequency allows only one day to be selected' }
      }
      if (data.frequency === 'WEEKLY_3X' && data.daysOfWeek && data.daysOfWeek.length > 3) {
        return { message: 'Three times per week frequency allows only up to 3 days to be selected' }
      }
      return { message: 'Invalid number of days selected for the chosen frequency' }
    }
  )

const addItemSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
  defaultUnit: z.string().optional(),
})

const quickListListSchema = z.object({
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 50
      return Math.min(Math.max(parsed, 1), 100)
    })
    .default('50'),
  offset: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      return Number.isFinite(n) && n >= 0 ? n : 0
    })
    .default('0'),
  includeItems: z
    .string()
    .transform((val) => val !== 'false')
    .default('true'),
})

async function respondLimitExceeded(req, res, limitCheck, limitKey, restaurantId) {
  const [subscription, recommendedPlans] = await Promise.all([
    getTenantSubscription(restaurantId, 'RESTAURANT'),
    getRecommendedPlanNames('RESTAURANT'),
  ])
  const err = buildLimitExceededPayload(
    limitCheck,
    limitKey,
    subscription?.plan_name || subscription?.plan_display_name,
    recommendedPlans,
    undefined,
    'RESTAURANT'
  )
  return res.status(403).json({
    ok: false,
    data: null,
    error: err,
    requestId: req.requestId,
  })
}

async function assertCanAddQuickListItems(restaurantId, additionalCount = 1) {
  const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'quick_list_items')
  if (limitCheck.isUnlimited || limitCheck.limit == null) return
  if (limitCheck.current + additionalCount > limitCheck.limit) {
    const err = new Error('Quick list item limit exceeded')
    err.code = 'LIMIT_EXCEEDED'
    err.limitCheck = limitCheck
    err.limitKey = 'quick_list_items'
    throw err
  }
}

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('ORDERS_VIEW'),
  quickListsFeatureGate,
  ordersCreateMutationGuard
)

// Get all quick lists for restaurant
router.get('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const listParams = quickListListSchema.parse(req.query)
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    const supplierFilter = req.query.supplier_id || req.query.supplierId
    const branchFilter = req.query.branch_id || req.query.branchId
    const params = [restaurantId]
    let where = 'ql.restaurant_id = $1'
    if (supplierFilter) {
      params.push(supplierFilter)
      where += ` AND (ql.supplier_id = $${params.length} OR EXISTS (
        SELECT 1 FROM quick_list_item qli2 WHERE qli2.quick_list_id = ql.id AND qli2.supplier_id = $${params.length}
      ))`
    }
    if (branchFilter) {
      params.push(branchFilter)
      where += ` AND ql.branch_id = $${params.length}`
    }

    const countParams = [...params]
    params.push(listParams.limit, listParams.offset)

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `
      SELECT 
        ql.*,
        (SELECT COUNT(*)::int FROM quick_list_item qli WHERE qli.quick_list_id = ql.id) AS item_count
      FROM quick_list ql
      WHERE ${where}
      ORDER BY ql.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
        params
      ),
      query(
        `
      SELECT COUNT(*)::int AS total
      FROM quick_list ql
      WHERE ${where}
    `,
        countParams
      ),
    ])

    let itemsByListId = new Map()
    if (listParams.includeItems) {
      const listIds = rows.map((list) => list.id)
      if (listIds.length > 0) {
        const { rows: allItems } = await query(
          `
        SELECT 
          qli.*,
          p.name as product_name,
          p.sku as product_sku,
          p.unit as product_unit,
          pr.amount as product_price,
          s.name as supplier_name
        FROM quick_list_item qli
        JOIN product p ON p.id = qli.product_id
        JOIN supplier s ON s.id = qli.supplier_id
        LEFT JOIN LATERAL (
          SELECT amount
          FROM price
          WHERE price.product_id = p.id
            AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
          ORDER BY valid_from DESC
          LIMIT 1
        ) pr ON true
        WHERE qli.quick_list_id = ANY($1::uuid[])
        ORDER BY qli.quick_list_id, p.name
      `,
          [listIds]
        )
        for (const item of allItems) {
          const bucket = itemsByListId.get(item.quick_list_id) || []
          bucket.push(item)
          itemsByListId.set(item.quick_list_id, bucket)
        }
      }
    }

    const quickListsWithItems = rows.map((list) => ({
      ...mapQuickListRow(list),
      ...(listParams.includeItems ? { items: itemsByListId.get(list.id) || [] } : {}),
    }))

    res.json({
      ok: true,
      data: {
        quickLists: quickListsWithItems,
        pagination: {
          total: parseInt(countRows[0]?.total ?? 0, 10),
          limit: listParams.limit,
          offset: listParams.offset,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get quick lists error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick lists',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get quick list by ID with items
router.get('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params

    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    // Get quick list
    const { rows: lists } = await query(
      `
      SELECT * FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `,
      [id, restaurantId]
    )

    if (lists.length === 0) {
      throw new NotFoundError('Quick list not found')
    }

    const quickList = mapQuickListRow(lists[0])

    // Get items
    const { rows: items } = await query(
      `
      SELECT 
        qli.*,
        p.name as product_name,
        p.sku as product_sku,
        p.unit as product_unit,
        pr.amount as product_price,
        s.name as supplier_name
      FROM quick_list_item qli
      JOIN product p ON p.id = qli.product_id
      JOIN supplier s ON s.id = qli.supplier_id
      LEFT JOIN LATERAL (
        SELECT amount
        FROM price
        WHERE price.product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      WHERE qli.quick_list_id = $1
      ORDER BY p.name
    `,
      [id]
    )

    res.json({
      ok: true,
      data: {
        quickList: {
          ...quickList,
          items: items || [],
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get quick list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Create quick list
router.post('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const data = createQuickListSchema.parse(req.body)

    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    const listLimit = await checkLimit(restaurantId, 'RESTAURANT', 'quick_lists')
    if (!listLimit.isUnlimited && listLimit.limit != null && listLimit.current >= listLimit.limit) {
      return respondLimitExceeded(req, res, listLimit, 'quick_lists', restaurantId)
    }

    const itemsToCreate = data.items || []
    if (itemsToCreate.length > 0) {
      await assertCanAddQuickListItems(restaurantId, itemsToCreate.length)
    }

    const result = await withTransaction(async (client) => {
      // Create quick list
      const {
        rows: [quickList],
      } = await client.query(
        `
        INSERT INTO quick_list (restaurant_id, supplier_id, branch_id, name, description)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          restaurantId,
          data.supplierId || null,
          data.branchId || null,
          data.name,
          data.description || null,
        ]
      )

      // Verify all products belong to their suppliers in one query, then bulk insert items.
      const items = []
      if (itemsToCreate.length > 0) {
        const productIds = itemsToCreate.map((i) => i.productId)
        const supplierIds = [...new Set(itemsToCreate.map((i) => i.supplierId))]
        const { rows: validProducts } = await client.query(
          `SELECT id, supplier_id FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = ANY($2::uuid[])`,
          [productIds, supplierIds]
        )
        const validSet = new Set(validProducts.map((p) => `${p.id}:${p.supplier_id}`))
        for (const item of itemsToCreate) {
          if (!validSet.has(`${item.productId}:${item.supplierId}`)) {
            throw new ValidationError(
              `Product ${item.productId} does not belong to supplier ${item.supplierId}`
            )
          }
        }

        const { rows: insertedItems } = await client.query(
          `
          INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity, notes, default_unit)
          SELECT $1, t.product_id, t.supplier_id, t.quantity, t.notes, t.default_unit
          FROM unnest($2::uuid[], $3::uuid[], $4::numeric[], $5::text[], $6::text[])
            AS t(product_id, supplier_id, quantity, notes, default_unit)
          ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            notes = EXCLUDED.notes,
            updated_at = now()
          RETURNING *
        `,
          [
            quickList.id,
            itemsToCreate.map((i) => i.productId),
            itemsToCreate.map((i) => i.supplierId),
            itemsToCreate.map((i) => i.quantity),
            itemsToCreate.map((i) => i.notes || null),
            itemsToCreate.map((i) => i.defaultUnit || null),
          ]
        )
        items.push(...insertedItems)
      }

      return { ...quickList, items }
    })

    logger.info('Quick list created', {
      quickListId: result.id,
      restaurantId,
      itemCount: result.items.length,
      actor: req.userData.id,
    })

    res.status(201).json({
      ok: true,
      data: { quickList: result },
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
          message: 'Invalid quick list data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error?.code === 'LIMIT_EXCEEDED' && error.limitCheck) {
      const restaurantId = await getRestaurantIdForRequest(req).catch(() => null)
      if (restaurantId) {
        return respondLimitExceeded(req, res, error.limitCheck, error.limitKey, restaurantId)
      }
    }

    logger.error({
      message: 'Create quick list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create quick list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Update quick list
router.patch('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const data = updateQuickListSchema.parse(req.body)

    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (data.name) {
      updateFields.push(`name = $${paramIndex}`)
      updateValues.push(data.name)
      paramIndex++
    }

    if (data.description !== undefined) {
      updateFields.push(`description = $${paramIndex}`)
      updateValues.push(data.description)
      paramIndex++
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No fields to update',
        },
        requestId: req.requestId,
      })
    }

    updateFields.push(`updated_at = now()`)
    updateValues.push(id, restaurantId)

    const { rows } = await query(
      `
      UPDATE quick_list 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND restaurant_id = $${paramIndex + 1}
      RETURNING *
    `,
      updateValues
    )

    if (rows.length === 0) {
      throw new NotFoundError('Quick list not found')
    }

    logger.info('Quick list updated', {
      quickListId: id,
      actor: req.userData.id,
    })

    res.json({
      ok: true,
      data: { quickList: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Update quick list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update quick list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Delete quick list
router.delete('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params

    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    const { rows } = await query(
      `
      DELETE FROM quick_list 
      WHERE id = $1 AND restaurant_id = $2
      RETURNING *
    `,
      [id, restaurantId]
    )

    if (rows.length === 0) {
      throw new NotFoundError('Quick list not found')
    }

    logger.info('Quick list deleted', {
      quickListId: id,
      actor: req.userData.id,
    })

    res.json({
      ok: true,
      data: { quickList: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Delete quick list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to delete quick list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Add item to quick list
router.post('/:id/items', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const data = addItemSchema.parse(req.body)

    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new ValidationError('Restaurant not found')
    }

    // Verify quick list belongs to restaurant
    const { rows: lists } = await query(
      `
      SELECT id FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `,
      [id, restaurantId]
    )

    if (lists.length === 0) {
      throw new NotFoundError('Quick list not found')
    }

    // Verify product belongs to supplier
    const { rows: products } = await query(
      `
      SELECT id FROM product WHERE id = $1 AND supplier_id = $2
    `,
      [data.productId, data.supplierId]
    )

    if (products.length === 0) {
      throw new ValidationError('Product does not belong to supplier')
    }

    const { rows: existingItem } = await query(
      `SELECT id FROM quick_list_item WHERE quick_list_id = $1 AND product_id = $2`,
      [id, data.productId]
    )
    if (existingItem.length === 0) {
      await assertCanAddQuickListItems(restaurantId, 1)
    }

    const { rows } = await query(
      `
      INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity, notes, default_unit)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        notes = EXCLUDED.notes,
        default_unit = EXCLUDED.default_unit,
        updated_at = now()
      RETURNING *
    `,
      [
        id,
        data.productId,
        data.supplierId,
        data.quantity,
        data.notes || null,
        data.defaultUnit || null,
      ]
    )

    logger.info('Item added to quick list', {
      quickListId: id,
      productId: data.productId,
      actor: req.userData.id,
    })

    res.status(201).json({
      ok: true,
      data: { item: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error?.code === 'LIMIT_EXCEEDED' && error.limitCheck) {
      const restaurantId = await getRestaurantIdForRequest(req).catch(() => null)
      if (restaurantId) {
        return respondLimitExceeded(req, res, error.limitCheck, error.limitKey, restaurantId)
      }
    }
    logger.error({
      message: 'Add item to quick list error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to add item to quick list',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Delete item from quick list
router.delete(
  '/:id/items/:itemId',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id, itemId } = req.params

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      // Verify quick list belongs to restaurant
      const { rows: lists } = await query(
        `
      SELECT id FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `,
        [id, restaurantId]
      )

      if (lists.length === 0) {
        throw new NotFoundError('Quick list not found')
      }

      const { rows } = await query(
        `
      DELETE FROM quick_list_item 
      WHERE id = $1 AND quick_list_id = $2
      RETURNING *
    `,
        [itemId, id]
      )

      if (rows.length === 0) {
        throw new NotFoundError('Item not found')
      }

      logger.info('Item removed from quick list', {
        quickListId: id,
        itemId,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { item: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Remove item from quick list error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to remove item from quick list',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Schedule a quick list for recurring orders
router.post(
  '/:id/schedule',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params
      const scheduleData = scheduleQuickListSchema.parse(req.body)

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      const subscription = await getTenantSubscription(restaurantId, 'RESTAURANT')
      const planFeatures = await resolveEffectivePlanFeatures(subscription)
      if (!isQuickListAutomationEnabled(planFeatures?.quick_lists)) {
        const recommendedPlans = await getRecommendedPlanNames('RESTAURANT')
        return res.status(403).json({
          ok: false,
          data: null,
          error: buildFeatureNotAvailablePayload(
            'quick_lists',
            subscription?.plan_name || subscription?.plan_display_name,
            'Silver',
            recommendedPlans,
            undefined,
            'RESTAURANT'
          ),
          requestId: req.requestId,
        })
      }

      // Verify quick list belongs to restaurant
      const { rows: lists } = await query(
        `
      SELECT * FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `,
        [id, restaurantId]
      )

      if (lists.length === 0) {
        throw new NotFoundError('Quick list not found')
      }

      const quickList = lists[0]

      const useAiQuantities = scheduleData.useAiQuantities === true
      if (
        useAiQuantities &&
        !hasQuickListCapability(planFeatures?.quick_lists, 'aiQuantityAdjust')
      ) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: buildFeatureNotAvailablePayload(
            'quick_lists',
            subscription?.plan_name || subscription?.plan_display_name,
            'Platinum',
            await getRecommendedPlanNames('RESTAURANT'),
            undefined,
            'RESTAURANT'
          ),
          requestId: req.requestId,
        })
      }

      if (!quickList.is_scheduled) {
        const scheduleLimit = await checkLimit(restaurantId, 'RESTAURANT', 'scheduled_quick_lists')
        if (
          !scheduleLimit.isUnlimited &&
          scheduleLimit.limit != null &&
          scheduleLimit.current + 1 > scheduleLimit.limit
        ) {
          return respondLimitExceeded(
            req,
            res,
            scheduleLimit,
            'scheduled_quick_lists',
            restaurantId
          )
        }
      }

      // Daily order limits are enforced when the schedule runs (see scheduled-orders.service),
      // not when saving schedule settings — the next run may be on a future day.

      // Calculate next execution date if not provided
      let nextExecutionDate = scheduleData.nextExecutionDate
      if (!nextExecutionDate) {
        const today = new Date()
        // Use local date to avoid timezone issues
        const year = today.getFullYear()
        const month = today.getMonth()
        const day = today.getDate()

        switch (scheduleData.frequency) {
          case 'DAILY': {
            // Tomorrow in local timezone
            const tomorrow = new Date(year, month, day + 1)
            nextExecutionDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
            break
          }
          case 'WEEKLY': {
            // Next week in local timezone
            const nextWeek = new Date(year, month, day + 7)
            nextExecutionDate = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`
            break
          }
          case 'WEEKLY_3X': {
            // 3 times per week - find the next scheduled day within the week
            const dayNames = [
              'SUNDAY',
              'MONDAY',
              'TUESDAY',
              'WEDNESDAY',
              'THURSDAY',
              'FRIDAY',
              'SATURDAY',
            ]
            const currentDay = today.getDay()
            const scheduledDays = scheduleData.daysOfWeek || []

            // Find the next scheduled day
            let foundDay = false
            for (let i = 1; i <= 7; i++) {
              const nextDay = (currentDay + i) % 7
              const nextDayName = dayNames[nextDay]
              if (scheduledDays.includes(nextDayName)) {
                const nextScheduledDate = new Date(year, month, day + i)
                nextExecutionDate = `${nextScheduledDate.getFullYear()}-${String(nextScheduledDate.getMonth() + 1).padStart(2, '0')}-${String(nextScheduledDate.getDate()).padStart(2, '0')}`
                foundDay = true
                break
              }
            }

            // If no day found, default to next week
            if (!foundDay) {
              const defaultNextWeek = new Date(year, month, day + 7)
              nextExecutionDate = `${defaultNextWeek.getFullYear()}-${String(defaultNextWeek.getMonth() + 1).padStart(2, '0')}-${String(defaultNextWeek.getDate()).padStart(2, '0')}`
            }
            break
          }
          case 'BIWEEKLY': {
            // Two weeks in local timezone
            const twoWeeks = new Date(year, month, day + 14)
            nextExecutionDate = `${twoWeeks.getFullYear()}-${String(twoWeeks.getMonth() + 1).padStart(2, '0')}-${String(twoWeeks.getDate()).padStart(2, '0')}`
            break
          }
          case 'MONTHLY': {
            // Next month in local timezone
            const nextMonth = new Date(year, month + 1, day)
            nextExecutionDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`
            break
          }
        }
      }

      // Update quick list with schedule
      const { rows } = await query(
        `
      UPDATE quick_list
      SET 
        is_scheduled = true,
        frequency = $1,
        days_of_week = $2,
        preferred_time = $3,
        auto_create_order = $4,
        use_ai_quantities = $5,
        next_execution_date = $6,
        status = 'ACTIVE',
        updated_at = now()
      WHERE id = $7 AND restaurant_id = $8
      RETURNING *
    `,
        [
          scheduleData.frequency,
          scheduleData.daysOfWeek ? JSON.stringify(scheduleData.daysOfWeek) : null,
          scheduleData.preferredTime || null,
          scheduleData.autoCreateOrder,
          useAiQuantities,
          nextExecutionDate,
          id,
          restaurantId,
        ]
      )

      logger.info('Quick list scheduled', {
        quickListId: id,
        frequency: scheduleData.frequency,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { quickList: rows[0] },
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

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid schedule data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error({
        message: 'Schedule quick list error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to schedule quick list',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Unschedule a quick list
router.delete(
  '/:id/schedule',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        throw new ValidationError('Restaurant not found')
      }

      const { rows } = await query(
        `
      UPDATE quick_list
      SET 
        is_scheduled = false,
        frequency = NULL,
        days_of_week = NULL,
        preferred_time = NULL,
        next_execution_date = NULL,
        status = 'PAUSED',
        updated_at = now()
      WHERE id = $1 AND restaurant_id = $2
      RETURNING *
    `,
        [id, restaurantId]
      )

      if (rows.length === 0) {
        throw new NotFoundError('Quick list not found')
      }

      logger.info('Quick list unscheduled', {
        quickListId: id,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { quickList: rows[0] },
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

      logger.error({
        message: 'Unschedule quick list error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to unschedule quick list',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

const aiSuggestApplySchema = z.object({
  proposals: z
    .array(
      z.object({
        action: z.enum(['add', 'update']),
        productId: z.string().uuid(),
        supplierId: z.string().uuid(),
        quantity: z.number().positive(),
      })
    )
    .min(1),
})

// Platinum: forecast-based item suggestions for a quick list
router.post(
  '/:id/ai-suggest',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const data = await suggestQuickListItems(restaurantId, req.params.id)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

// Platinum: apply selected suggestions to quick list items
router.post(
  '/:id/ai-suggest/apply',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  ordersCreateMutationGuard,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new ValidationError('Restaurant not found')
      const body = aiSuggestApplySchema.parse(req.body ?? {})
      const data = await applyQuickListSuggestions(restaurantId, req.params.id, body.proposals)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

// Manually execute scheduled orders (for testing or immediate execution)
router.post(
  '/execute-scheduled',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { runManualCronJob, CRON_JOBS } = await import('../lib/cron-runner.js')
      const { result } = await runManualCronJob(CRON_JOBS.SCHEDULED_ORDERS, () =>
        executeScheduledOrders()
      )
      const jobResult = result ?? { executed: 0, errors: 0 }

      res.json({
        ok: true,
        data: {
          executed: jobResult.executed,
          errors: jobResult.errors,
          message: `Executed ${jobResult.executed} scheduled orders, ${jobResult.errors} errors`,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Execute scheduled orders error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to execute scheduled orders',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as quickListsRoutes }
