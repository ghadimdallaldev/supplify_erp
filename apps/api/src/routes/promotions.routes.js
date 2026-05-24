import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { loadActivePromotionsForSupplier } from '../services/promotions.service.js'
import {
  discoverDealsForRestaurant,
  loadDealDetailForRestaurant,
  recordDealInteraction,
  createDealPromotionCampaign,
  getDealAnalytics,
  enrichPromotionRow,
  getEligibleProductsForDeal,
  getActiveDealPromotion,
} from '../services/deal-promotions.service.js'
import { writeAuditLog } from '../lib/audit.js'
import {
  requireFeature,
  checkLimit,
  getTenantSubscription,
  buildLimitExceededPayload,
  getRecommendedPlanNames,
} from '../lib/subscription.js'

const router = express.Router()

const CTA_TYPES = ['order_now', 'use_coupon', 'message_supplier', 'view_products']

const promotionBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  type: z.enum([
    'percentage_discount',
    'fixed_discount',
    'free_shipping',
    'buy_x_get_y',
    'featured_listing',
  ]),
  discountValue: z.number().nonnegative().optional().nullable(),
  minOrderAmount: z.number().nonnegative().optional().nullable(),
  maxDiscountCap: z.number().nonnegative().optional().nullable(),
  buyQuantity: z.number().int().positive().optional().nullable(),
  getQuantity: z.number().int().positive().optional().nullable(),
  appliesTo: z.enum(['all', 'specific_products', 'specific_categories']).default('all'),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  isFeatured: z.boolean().optional(),
  productIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  restaurantIds: z.array(z.string().uuid()).optional(),
  imageUrl: z.string().url().optional().nullable(),
  couponCode: z.string().max(64).optional().nullable(),
  minOrderQuantity: z.number().int().positive().optional().nullable(),
  ctaType: z.enum(CTA_TYPES).optional(),
  targetRestaurantTypes: z.array(z.string()).optional(),
  targetAreas: z.array(z.string()).optional(),
  stockQuantity: z.number().int().positive().optional().nullable(),
  requiresAdminApproval: z.boolean().optional(),
})

const promoteBodySchema = z.object({
  pricingKey: z.string().optional(),
  budget: z.number().nonnegative().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
  targetAudience: z
    .object({
      all: z.boolean().optional(),
      restaurantTypes: z.array(z.string()).optional(),
      areas: z.array(z.string()).optional(),
    })
    .optional(),
})

const interactBodySchema = z.object({
  interactionType: z.enum(['view', 'click', 'order', 'coupon_used', 'message']),
  metadata: z.record(z.unknown()).optional(),
})

async function getSupplierId(req) {
  if (req.tenantContext?.tenantType === 'SUPPLIER' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Supplier not found')
  return rows[0].id
}

async function getRestaurantId(req) {
  if (req.tenantContext?.tenantType === 'RESTAURANT' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Restaurant not found')
  return rows[0].id
}

async function loadPromotionForSupplier(promotionId, supplierId) {
  const { rows } = await query(`SELECT * FROM promotions WHERE id = $1 AND supplier_id = $2`, [
    promotionId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Deal not found')
  return rows[0]
}

async function syncPromotionTargets(client, promotionId, productIds = [], categoryIds = []) {
  await client.query(`DELETE FROM promotion_targets WHERE promotion_id = $1`, [promotionId])
  for (const productId of productIds) {
    await client.query(`INSERT INTO promotion_targets (promotion_id, product_id) VALUES ($1, $2)`, [
      promotionId,
      productId,
    ])
  }
  for (const categoryId of categoryIds) {
    await client.query(
      `INSERT INTO promotion_targets (promotion_id, category_id) VALUES ($1, $2)`,
      [promotionId, categoryId]
    )
  }
}

async function syncRestaurantTargets(client, promotionId, restaurantIds = []) {
  await client.query(`DELETE FROM promotion_restaurant_targets WHERE promotion_id = $1`, [
    promotionId,
  ])
  for (const restaurantId of restaurantIds) {
    await client.query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id) VALUES ($1, $2)`,
      [promotionId, restaurantId]
    )
  }
}

function mapPromotionInsertFields(body) {
  return {
    name: body.name,
    description: body.description ?? null,
    type: body.type,
    discountValue: body.discountValue ?? null,
    minOrderAmount: body.minOrderAmount ?? null,
    maxDiscountCap: body.maxDiscountCap ?? null,
    buyQuantity: body.buyQuantity ?? null,
    getQuantity: body.getQuantity ?? null,
    appliesTo: body.appliesTo ?? 'all',
    startsAt: body.startsAt,
    endsAt: body.endsAt ?? null,
    usageLimit: body.usageLimit ?? null,
    isFeatured: body.isFeatured ?? false,
    imageUrl: body.imageUrl ?? null,
    couponCode: body.couponCode ?? null,
    minOrderQuantity: body.minOrderQuantity ?? null,
    ctaType: body.ctaType ?? 'order_now',
    targetRestaurantTypes: JSON.stringify(body.targetRestaurantTypes || []),
    targetAreas: JSON.stringify(body.targetAreas || []),
    stockQuantity: body.stockQuantity ?? null,
    requiresAdminApproval: body.requiresAdminApproval ?? false,
  }
}

const supplierDealsGate = requireFeature(
  'supplier_deals',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

async function respondSupplierLimitExceeded(req, res, limitCheck, limitKey, supplierId) {
  const [subscription, recommendedPlans] = await Promise.all([
    getTenantSubscription(supplierId, 'SUPPLIER'),
    getRecommendedPlanNames('SUPPLIER'),
  ])
  const err = buildLimitExceededPayload(
    limitCheck,
    limitKey,
    subscription?.plan_name || subscription?.plan_display_name,
    recommendedPlans
  )
  return res.status(403).json({
    ok: false,
    data: null,
    error: err,
    requestId: req.requestId,
  })
}

async function respondDealRedemptionLimitExceeded(req, res, limitCheck, restaurantId) {
  const [subscription, recommendedPlans] = await Promise.all([
    getTenantSubscription(restaurantId, 'RESTAURANT'),
    getRecommendedPlanNames('RESTAURANT'),
  ])
  const err = buildLimitExceededPayload(
    limitCheck,
    'deal_redemptions_per_day',
    subscription?.plan_name || subscription?.plan_display_name,
    recommendedPlans
  )
  return res.status(403).json({
    ok: false,
    data: null,
    error: err,
    requestId: req.requestId,
  })
}

router.get(
  '/active',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const { supplierId, categoryId, sort, expiringSoon } = req.query
      const promotions = await discoverDealsForRestaurant(restaurantId, {
        supplierId: supplierId || undefined,
        categoryId: categoryId || undefined,
        sort: sort || 'newest',
        expiringSoon: expiringSoon === 'true',
      })
      res.json({ ok: true, data: { promotions }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/pricing',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT * FROM promotion_pricing_config WHERE is_active = TRUE ORDER BY amount ASC`
      )
      res.json({ ok: true, data: { pricing: rows }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/admin/pending', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT p.*, s.name AS supplier_name
      FROM promotions p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE p.status = 'pending_approval'
      ORDER BY p.created_at ASC
      `
    )
    res.json({ ok: true, data: { deals: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/admin/:id/approve', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE promotions SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_approval' RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) throw new NotFoundError('Deal not found or not pending approval')
    res.json({ ok: true, data: { deal: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/admin/:id/reject', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE promotions SET status = 'draft', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_approval' RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) throw new NotFoundError('Deal not found or not pending approval')
    res.json({ ok: true, data: { deal: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/admin/pricing/:key', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const body = z
      .object({
        amount: z.number().nonnegative().optional(),
        durationDays: z.number().int().positive().optional().nullable(),
        isActive: z.boolean().optional(),
        displayName: z.string().optional(),
        description: z.string().optional().nullable(),
      })
      .parse(req.body)

    const fields = []
    const values = []
    let i = 1
    const map = {
      amount: 'amount',
      durationDays: 'duration_days',
      isActive: 'is_active',
      displayName: 'display_name',
      description: 'description',
    }
    for (const [key, col] of Object.entries(map)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = $${i++}`)
        values.push(body[key])
      }
    }
    if (!fields.length) throw new ValidationError('No fields to update')
    fields.push('updated_at = NOW()')
    values.push(req.params.key)
    const { rows } = await query(
      `UPDATE promotion_pricing_config SET ${fields.join(', ')} WHERE pricing_key = $${i} RETURNING *`,
      values
    )
    if (!rows.length) throw new NotFoundError('Pricing config not found')
    res.json({ ok: true, data: { pricing: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get(
  '/:id/detail',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const deal = await loadDealDetailForRestaurant(req.params.id, restaurantId)
      if (!deal) throw new NotFoundError('Deal not found or not available')
      const activePromo = await getActiveDealPromotion(query, deal.id)
      await recordDealInteraction({
        dealId: deal.id,
        restaurantId,
        supplierId: deal.supplier_id,
        interactionType: 'view',
        dealPromotionId: activePromo?.id || null,
      })
      res.json({ ok: true, data: { deal }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/interact',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const body = interactBodySchema.parse(req.body)
      const deal = await loadDealDetailForRestaurant(req.params.id, restaurantId)
      if (!deal) throw new NotFoundError('Deal not found or not available')
      const activePromo = await getActiveDealPromotion(query, deal.id)
      const interaction = await recordDealInteraction({
        dealId: deal.id,
        restaurantId,
        supplierId: deal.supplier_id,
        interactionType: body.interactionType,
        metadata: body.metadata || {},
        dealPromotionId: activePromo?.id || null,
      })
      res.json({ ok: true, data: { interaction }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/:id/eligible-products',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const deal = await loadDealDetailForRestaurant(req.params.id, restaurantId)
      if (!deal) throw new NotFoundError('Deal not found or not available')
      const products = await getEligibleProductsForDeal(deal.id, deal.supplier_id)
      res.json({
        ok: true,
        data: { products, dealId: deal.id, supplierId: deal.supplier_id },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/use-coupon',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const deal = await loadDealDetailForRestaurant(req.params.id, restaurantId)
      if (!deal) throw new NotFoundError('Deal not found or not available')
      if (!deal.coupon_code) throw new ValidationError('This deal has no coupon code')
      const redeemLimit = await checkLimit(restaurantId, 'RESTAURANT', 'deal_redemptions_per_day')
      if (redeemLimit.isOverLimit) {
        return respondDealRedemptionLimitExceeded(req, res, redeemLimit, restaurantId)
      }
      const activePromo = await getActiveDealPromotion(query, deal.id)
      await recordDealInteraction({
        dealId: deal.id,
        restaurantId,
        supplierId: deal.supplier_id,
        interactionType: 'coupon_used',
        metadata: { couponCode: deal.coupon_code },
        dealPromotionId: activePromo?.id || null,
      })
      res.json({
        ok: true,
        data: { couponCode: deal.coupon_code, dealId: deal.id, supplierId: deal.supplier_id },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/message',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const deal = await loadDealDetailForRestaurant(req.params.id, restaurantId)
      if (!deal) throw new NotFoundError('Deal not found or not available')

      const { rows: conversations } = await query(
        `SELECT * FROM conversation WHERE supplier_id = $1 AND restaurant_id = $2`,
        [deal.supplier_id, restaurantId]
      )

      let conversation
      if (!conversations.length) {
        const { rows: newConversations } = await query(
          `INSERT INTO conversation (supplier_id, restaurant_id) VALUES ($1, $2) RETURNING *`,
          [deal.supplier_id, restaurantId]
        )
        conversation = newConversations[0]
        await query(
          `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
           VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)`,
          [conversation.id, deal.supplier_id, restaurantId]
        )
      } else {
        conversation = conversations[0]
      }

      const initialMessage = `Hello, I am interested in your deal: ${deal.name}`
      const { rows: messages } = await query(
        `
        INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type)
        VALUES ($1, 'RESTAURANT', $2, $3, 'TEXT')
        RETURNING *
        `,
        [conversation.id, restaurantId, initialMessage]
      )

      const activePromo = await getActiveDealPromotion(query, deal.id)
      await recordDealInteraction({
        dealId: deal.id,
        restaurantId,
        supplierId: deal.supplier_id,
        interactionType: 'message',
        metadata: { conversationId: conversation.id, messageId: messages[0]?.id },
        dealPromotionId: activePromo?.id || null,
      })

      res.json({
        ok: true,
        data: { conversation, message: messages[0], initialMessage },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/:id/preview',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('CATALOG_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierId(req)
      const deal = await loadPromotionForSupplier(req.params.id, supplierId)
      const enriched = await enrichPromotionRow(deal)
      const { rows: targets } = await query(
        `
        SELECT pt.*, pr.name AS product_name, pc.name AS category_name
        FROM promotion_targets pt
        LEFT JOIN product pr ON pr.id = pt.product_id
        LEFT JOIN product_category pc ON pc.id = pt.category_id
        WHERE pt.promotion_id = $1
        `,
        [deal.id]
      )
      res.json({
        ok: true,
        data: { deal: { ...enriched, targets } },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

const promotionsWriteGate = requireFeature(
  'promotions',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('CATALOG_MANAGE'),
  promotionsWriteGate
)

router.get('/', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const { status } = req.query
    const params = [supplierId]
    let sql = `SELECT * FROM promotions WHERE supplier_id = $1`
    if (status) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    sql += ' ORDER BY created_at DESC'
    const { rows } = await query(sql, params)
    const promotions = await Promise.all(rows.map((r) => enrichPromotionRow(r)))
    res.json({ ok: true, data: { promotions }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const promotionLimit = await checkLimit(supplierId, 'SUPPLIER', 'promotions')
    if (promotionLimit.isOverLimit) {
      return respondSupplierLimitExceeded(req, res, promotionLimit, 'promotions', supplierId)
    }
    const body = promotionBodySchema.parse(req.body)
    const fields = mapPromotionInsertFields(body)
    const promotion = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `
        INSERT INTO promotions (
          supplier_id, name, description, type, discount_value, min_order_amount,
          max_discount_cap, buy_quantity, get_quantity, applies_to, starts_at, ends_at,
          usage_limit, is_featured, status, image_url, coupon_code, min_order_quantity,
          cta_type, target_restaurant_types, target_areas, stock_quantity, requires_admin_approval
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          CASE WHEN $22 THEN 'pending_approval' ELSE 'draft' END,
          $15,$16,$17,$18,$19,$20,$21,$22
        )
        RETURNING *
        `,
        [
          supplierId,
          fields.name,
          fields.description,
          fields.type,
          fields.discountValue,
          fields.minOrderAmount,
          fields.maxDiscountCap,
          fields.buyQuantity,
          fields.getQuantity,
          fields.appliesTo,
          fields.startsAt,
          fields.endsAt,
          fields.usageLimit,
          fields.isFeatured,
          fields.imageUrl,
          fields.couponCode,
          fields.minOrderQuantity,
          fields.ctaType,
          fields.targetRestaurantTypes,
          fields.targetAreas,
          fields.stockQuantity,
          fields.requiresAdminApproval,
        ]
      )
      const created = rows[0]
      if (body.appliesTo !== 'all') {
        await syncPromotionTargets(
          client,
          created.id,
          body.productIds || [],
          body.categoryIds || []
        )
      }
      if (body.restaurantIds?.length) {
        await syncRestaurantTargets(client, created.id, body.restaurantIds)
      }
      return created
    })
    await writeAuditLog(req, {
      action_type: 'promotion.created',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: promotion.id,
      payload_json: { resource_type: 'deal', name: promotion.name },
    })
    res.status(201).json({ ok: true, data: { promotion }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    const body = promotionBodySchema.partial().parse(req.body)

    if (existing.status === 'active' && body.discountValue !== undefined) {
      throw new ValidationError('Cannot change discount value on an active deal')
    }

    const promotion = await withTransaction(async (client) => {
      const fields = []
      const values = []
      let i = 1
      const map = {
        name: 'name',
        description: 'description',
        type: 'type',
        discountValue: 'discount_value',
        minOrderAmount: 'min_order_amount',
        maxDiscountCap: 'max_discount_cap',
        buyQuantity: 'buy_quantity',
        getQuantity: 'get_quantity',
        appliesTo: 'applies_to',
        startsAt: 'starts_at',
        endsAt: 'ends_at',
        usageLimit: 'usage_limit',
        isFeatured: 'is_featured',
        imageUrl: 'image_url',
        couponCode: 'coupon_code',
        minOrderQuantity: 'min_order_quantity',
        ctaType: 'cta_type',
        targetRestaurantTypes: 'target_restaurant_types',
        targetAreas: 'target_areas',
        stockQuantity: 'stock_quantity',
        requiresAdminApproval: 'requires_admin_approval',
      }
      for (const [key, col] of Object.entries(map)) {
        if (body[key] !== undefined) {
          fields.push(`${col} = $${i++}`)
          if (key === 'targetRestaurantTypes' || key === 'targetAreas') {
            values.push(JSON.stringify(body[key]))
          } else {
            values.push(body[key])
          }
        }
      }
      if (!fields.length && !body.productIds && !body.categoryIds && !body.restaurantIds) {
        return existing
      }
      let updated = existing
      if (fields.length) {
        fields.push('updated_at = NOW()')
        values.push(existing.id)
        const { rows } = await client.query(
          `UPDATE promotions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
          values
        )
        updated = rows[0]
      }
      if (body.productIds || body.categoryIds) {
        await syncPromotionTargets(
          client,
          updated.id,
          body.productIds || [],
          body.categoryIds || []
        )
      }
      if (body.restaurantIds) {
        await syncRestaurantTargets(client, updated.id, body.restaurantIds)
      }
      return updated
    })

    await writeAuditLog(req, {
      action_type: 'promotion.updated',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: promotion.id,
      payload_json: { resource_type: 'deal' },
    })
    res.json({ ok: true, data: { promotion }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/activate', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    const newStatus = existing.requires_admin_approval ? 'pending_approval' : 'active'
    const { rows } = await query(
      `UPDATE promotions SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, newStatus]
    )
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/pause', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows } = await query(
      `UPDATE promotions SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/resume', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows } = await query(
      `UPDATE promotions SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'paused' RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) throw new ValidationError('Deal is not paused')
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/promote', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const body = promoteBodySchema.parse(req.body)
    const campaign = await createDealPromotionCampaign({
      dealId: req.params.id,
      supplierId,
      pricingKey: body.pricingKey,
      budget: body.budget,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      targetAudience: body.targetAudience || { all: true },
      waivePayment: true,
    })
    await writeAuditLog(req, {
      action_type: 'deal.promoted',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: req.params.id,
      payload_json: { dealPromotionId: campaign.id, budget: campaign.budget },
    })
    res.status(201).json({
      ok: true,
      data: { promotion: campaign },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    if (err.message === 'Deal not found' || err.message?.includes('Only active')) {
      next(new ValidationError(err.message))
    } else {
      next(err)
    }
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft deals can be deleted')
    }
    await query(`DELETE FROM promotions WHERE id = $1`, [req.params.id])
    res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/analytics', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const analytics = await getDealAnalytics(req.params.id, supplierId)
    const { rows: topRestaurants } = await query(
      `
      SELECT r.id, r.name, COUNT(*)::int AS usage_count,
        SUM(pu.discount_applied)::numeric AS discount_total
      FROM promotion_usages pu
      JOIN restaurant r ON r.id = pu.restaurant_id
      WHERE pu.promotion_id = $1
      GROUP BY r.id, r.name
      ORDER BY usage_count DESC
      LIMIT 10
      `,
      [req.params.id]
    )
    res.json({
      ok: true,
      data: { analytics: { ...analytics, topRestaurants } },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

export { router as promotionsRoutes, loadActivePromotionsForSupplier }
