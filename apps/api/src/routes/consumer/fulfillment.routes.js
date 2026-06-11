import express from 'express'
import { z } from 'zod'
import { query } from '../../lib/db.js'
import {
  requireAuth,
  resolveTenantContext,
  requirePermission,
  requireRole,
} from '../../lib/rbac.js'
import { requireRestaurantId } from '../../lib/tenant-resolve.js'
import { logger } from '../../lib/logger.js'
import {
  getFulfillmentOptions,
  resolveRestaurantBySlug,
} from '../../services/consumer-menu.service.js'

function jsonOk(res, data) {
  res.json({ ok: true, data, error: null, requestId: res.req.requestId })
}

function jsonError(res, status, name, message) {
  res.status(status).json({
    ok: false,
    data: null,
    error: { name, message },
    requestId: res.req.requestId,
  })
}

const branchQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
})

const fulfillmentConfigSchema = z.object({
  deliveryEnabled: z.boolean().optional(),
  takeawayEnabled: z.boolean().optional(),
  dineInEnabled: z.boolean().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  estimatedPrepMinutes: z.number().int().positive().optional(),
})

const deliveryZoneCreateSchema = z.object({
  name: z.string().min(1),
  postcodePrefix: z.string().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
})

const deliveryZoneUpdateSchema = deliveryZoneCreateSchema.partial()

async function assertBranchForRestaurant(branchId, restaurantId) {
  const { rows } = await query(
    `SELECT id FROM branch WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [branchId, restaurantId]
  )
  if (!rows.length) {
    return null
  }
  return rows[0]
}

async function assertDeliveryZoneForRestaurant(zoneId, restaurantId) {
  const { rows } = await query(
    `
    SELECT dz.*
    FROM delivery_zone dz
    JOIN branch b ON b.id = dz.branch_id
    WHERE dz.id = $1 AND b.tenant_id = $2
    `,
    [zoneId, restaurantId]
  )
  return rows[0] || null
}

/** Public: GET /api/public/consumer/:restaurantSlug/fulfillment-options */
export const consumerFulfillmentPublicRoutes = express.Router({ mergeParams: true })

consumerFulfillmentPublicRoutes.get('/', async (req, res) => {
  try {
    const { branchId } = branchQuerySchema.parse(req.query)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }
    const options = await getFulfillmentOptions(restaurant.id, branchId || null)
    jsonOk(res, { restaurant, ...options })
  } catch (error) {
    logger.error('Public fulfillment options fetch failed', { error: error.message })
    jsonError(res, 500, 'FULFILLMENT_OPTIONS_ERROR', 'Unable to load fulfillment options')
  }
})

/** Admin: GET/PATCH /api/consumer/fulfillment */
export const consumerFulfillmentAdminRoutes = express.Router()

consumerFulfillmentAdminRoutes.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('SETTINGS_VIEW'),
  requireRole(['RESTAURANT', 'ADMIN'])
)

consumerFulfillmentAdminRoutes.get('/', async (req, res) => {
  try {
    const { branchId } = branchQuerySchema.parse(req.query)
    const restaurantId = await requireRestaurantId(req)
    const options = await getFulfillmentOptions(restaurantId, branchId || null)
    jsonOk(res, options)
  } catch (error) {
    logger.error('Admin fulfillment options fetch failed', { error: error.message })
    jsonError(res, 500, 'FULFILLMENT_OPTIONS_ERROR', 'Unable to load fulfillment options')
  }
})

consumerFulfillmentAdminRoutes.patch(
  '/:branchId',
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const body = fulfillmentConfigSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const branchId = req.params.branchId

      const branch = await assertBranchForRestaurant(branchId, restaurantId)
      if (!branch) {
        return jsonError(res, 404, 'BRANCH_NOT_FOUND', 'Branch not found')
      }

      const { rows } = await query(
        `
      INSERT INTO branch_fulfillment_config (
        branch_id, delivery_enabled, takeaway_enabled, dine_in_enabled,
        min_order_amount, delivery_fee, estimated_prep_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (branch_id) DO UPDATE SET
        delivery_enabled = COALESCE($2, branch_fulfillment_config.delivery_enabled),
        takeaway_enabled = COALESCE($3, branch_fulfillment_config.takeaway_enabled),
        dine_in_enabled = COALESCE($4, branch_fulfillment_config.dine_in_enabled),
        min_order_amount = COALESCE($5, branch_fulfillment_config.min_order_amount),
        delivery_fee = COALESCE($6, branch_fulfillment_config.delivery_fee),
        estimated_prep_minutes = COALESCE($7, branch_fulfillment_config.estimated_prep_minutes),
        updated_at = now()
      RETURNING *
      `,
        [
          branchId,
          body.deliveryEnabled ?? false,
          body.takeawayEnabled ?? true,
          body.dineInEnabled ?? true,
          body.minOrderAmount ?? 0,
          body.deliveryFee ?? 0,
          body.estimatedPrepMinutes ?? 30,
        ]
      )

      jsonOk(res, { config: rows[0] })
    } catch (error) {
      logger.error('Update fulfillment config failed', { error: error.message })
      jsonError(res, 400, 'UPDATE_FULFILLMENT_ERROR', error.message || 'Unable to update config')
    }
  }
)

consumerFulfillmentAdminRoutes.post(
  '/:branchId/zones',
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const body = deliveryZoneCreateSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const branchId = req.params.branchId

      const branch = await assertBranchForRestaurant(branchId, restaurantId)
      if (!branch) {
        return jsonError(res, 404, 'BRANCH_NOT_FOUND', 'Branch not found')
      }

      const { rows } = await query(
        `
        INSERT INTO delivery_zone (
          branch_id, name, postcode_prefix, delivery_fee, min_order_amount, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
          branchId,
          body.name.trim(),
          body.postcodePrefix?.trim() || null,
          body.deliveryFee ?? 0,
          body.minOrderAmount ?? 0,
          body.isActive ?? true,
        ]
      )

      jsonOk(res, { zone: rows[0] })
    } catch (error) {
      logger.error('Create delivery zone failed', { error: error.message })
      jsonError(res, 400, 'CREATE_ZONE_ERROR', error.message || 'Unable to create zone')
    }
  }
)

consumerFulfillmentAdminRoutes.patch(
  '/zones/:zoneId',
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const body = deliveryZoneUpdateSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const zone = await assertDeliveryZoneForRestaurant(req.params.zoneId, restaurantId)
      if (!zone) {
        return jsonError(res, 404, 'ZONE_NOT_FOUND', 'Delivery zone not found')
      }

      const { rows } = await query(
        `
        UPDATE delivery_zone SET
          name = COALESCE($1, name),
          postcode_prefix = COALESCE($2, postcode_prefix),
          delivery_fee = COALESCE($3, delivery_fee),
          min_order_amount = COALESCE($4, min_order_amount),
          is_active = COALESCE($5, is_active),
          updated_at = now()
        WHERE id = $6
        RETURNING *
        `,
        [
          body.name?.trim() ?? null,
          body.postcodePrefix !== undefined ? body.postcodePrefix?.trim() || null : null,
          body.deliveryFee ?? null,
          body.minOrderAmount ?? null,
          body.isActive ?? null,
          req.params.zoneId,
        ]
      )

      jsonOk(res, { zone: rows[0] })
    } catch (error) {
      logger.error('Update delivery zone failed', { error: error.message })
      jsonError(res, 400, 'UPDATE_ZONE_ERROR', error.message || 'Unable to update zone')
    }
  }
)

consumerFulfillmentAdminRoutes.delete(
  '/zones/:zoneId',
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const zone = await assertDeliveryZoneForRestaurant(req.params.zoneId, restaurantId)
      if (!zone) {
        return jsonError(res, 404, 'ZONE_NOT_FOUND', 'Delivery zone not found')
      }

      await query(`DELETE FROM delivery_zone WHERE id = $1`, [req.params.zoneId])
      jsonOk(res, { deleted: true })
    } catch (error) {
      logger.error('Delete delivery zone failed', { error: error.message })
      jsonError(res, 400, 'DELETE_ZONE_ERROR', error.message || 'Unable to delete zone')
    }
  }
)
