import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  resolveAdminContext,
  requirePermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { loadActivePromotionsForSupplier } from '../services/promotions.service.js'
import {
  discoverDealsForRestaurant,
  loadDealDetailForRestaurant,
  recordDealInteraction,
  createDealPromotionCampaign,
  getDealAnalytics,
  enrichPromotionRow,
  enrichPromotionRows,
  getEligibleProductsForDeal,
  getActiveDealPromotion,
  previewDealForCart,
} from '../services/deal-promotions.service.js'
import {
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  getActivationPricing,
  isActivationPaymentRequired,
  resolveStatusAfterApproval,
  resolveScheduledOrActive,
  isPendingAdminReview,
  shouldResetApprovalOnEdit,
} from '../services/deal-lifecycle.service.js'
import { writeAuditLog } from '../lib/audit.js'
import { requireFeature, requireWithinLimit } from '../lib/subscription.js'
import { config } from '../config/env.js'

const adminDealGuards = [
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requirePermission('ADMIN_ACCESS'),
]

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
  submitForReview: z.boolean().optional(),
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
  interactionType: z.enum([
    'view',
    'click',
    'order',
    'coupon_used',
    'message',
    'add_to_cart',
    'apply_to_cart',
    'remove_from_cart',
    'order_created',
    'order_completed',
    'message_supplier',
  ]),
  metadata: z.record(z.unknown()).optional(),
})

const cartPreviewSchema = z.object({
  supplierId: z.string().uuid(),
  promotionId: z.string().uuid().optional(),
  couponCode: z.string().optional(),
  subtotal: z.number().nonnegative(),
  lineItems: z
    .array(
      z.object({
        productId: z.string().uuid().optional(),
        categoryId: z.string().uuid().optional(),
        quantity: z.number().nonnegative(),
        unitPrice: z.number().nonnegative().optional(),
        lineTotal: z.number().nonnegative().optional(),
      })
    )
    .optional(),
})

const rejectBodySchema = z.object({
  rejectionReason: z.string().min(1).max(2000).optional(),
  adminNotes: z.string().max(2000).optional(),
})

async function getSupplierId(req) {
  const supplierId = await getSupplierIdForRequest(req)
  if (!supplierId) throw new ValidationError('Supplier not found')
  return supplierId
}

async function getRestaurantId(req) {
  const restaurantId = await getRestaurantIdForRequest(req)
  if (!restaurantId) throw new ValidationError('Restaurant not found')
  return restaurantId
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
    requiresAdminApproval: body.requiresAdminApproval ?? true,
  }
}

const supplierDealsGate = requireFeature(
  'supplier_deals',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

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

router.get('/admin/deals', ...adminDealGuards, async (req, res, next) => {
  try {
    const { status, supplierId, type, search, fromDate, toDate } = req.query
    const params = []
    const conditions = ['1=1']
    if (status) {
      const statusVal = String(status)
      if (statusVal === 'pending_approval' || statusVal === 'pending_review') {
        conditions.push(`p.status IN ('pending_approval', 'pending_admin_approval')`)
      } else {
        params.push(statusVal)
        conditions.push(`p.status = $${params.length}`)
      }
    }
    if (supplierId) {
      params.push(supplierId)
      conditions.push(`p.supplier_id = $${params.length}`)
    }
    if (type) {
      params.push(type)
      conditions.push(`p.type = $${params.length}`)
    }
    if (search) {
      params.push(`%${String(search).toLowerCase()}%`)
      conditions.push(
        `(lower(p.name) LIKE $${params.length} OR lower(s.name) LIKE $${params.length})`
      )
    }
    if (fromDate) {
      params.push(fromDate)
      conditions.push(`p.created_at >= $${params.length}::timestamptz`)
    }
    if (toDate) {
      params.push(toDate)
      conditions.push(`p.created_at <= $${params.length}::timestamptz`)
    }
    const { rows } = await query(
      `
      SELECT p.*, s.name AS supplier_name
      FROM promotions p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT 200
      `,
      params
    )
    res.json({ ok: true, data: { deals: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/admin/deals/insights', ...adminDealGuards, async (req, res, next) => {
  try {
    const { rows: summary } = await query(
      `
      SELECT
        COUNT(*)::int AS total_deals,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_deals,
        COUNT(*) FILTER (WHERE status IN ('pending_approval', 'pending_admin_approval'))::int AS pending_approval,
        COUNT(*) FILTER (WHERE status = 'approved_pending_payment')::int AS pending_payment,
        COUNT(*) FILTER (WHERE payment_status = 'pending')::int AS unpaid_deals,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_deals
      FROM promotions
      `
    )
    const { rows: interactionStats } = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE interaction_type = 'view')::int AS total_views,
        COUNT(*)::int AS total_interactions,
        COUNT(*) FILTER (WHERE interaction_type IN ('order', 'order_created', 'order_completed'))::int AS order_interactions
      FROM deal_interactions
      `
    )
    const { rows: revenueStats } = await query(
      `
      SELECT
        COUNT(DISTINCT pu.order_id)::int AS orders_from_deals,
        COALESCE(SUM(pu.discount_applied), 0)::numeric AS total_discount_given,
        COALESCE(SUM(co.total_amount), 0)::numeric AS total_revenue
      FROM promotion_usages pu
      JOIN customer_order co ON co.id = pu.order_id
      `
    )
    const { rows: topDeals } = await query(
      `
      SELECT p.id, p.name, p.status, s.name AS supplier_name,
        COUNT(DISTINCT pu.order_id)::int AS orders_count,
        COALESCE(SUM(pu.discount_applied), 0)::numeric AS discount_total
      FROM promotions p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN promotion_usages pu ON pu.promotion_id = p.id
      GROUP BY p.id, p.name, p.status, s.name
      ORDER BY orders_count DESC
      LIMIT 5
      `
    )
    res.json({
      ok: true,
      data: {
        insights: {
          ...summary[0],
          ...interactionStats[0],
          ...revenueStats[0],
          topDeals,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/admin/pending', ...adminDealGuards, async (req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT p.*, s.name AS supplier_name
      FROM promotions p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE p.status IN ('pending_approval', 'pending_admin_approval')
      ORDER BY p.created_at ASC
      `
    )
    res.json({ ok: true, data: { deals: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/admin/:id', ...adminDealGuards, async (req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT p.*, s.name AS supplier_name
      FROM promotions p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE p.id = $1
      `,
      [req.params.id]
    )
    if (!rows.length) throw new NotFoundError('Deal not found')
    const deal = await enrichPromotionRow(rows[0])
    res.json({ ok: true, data: { deal }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/admin/:id/approve', ...adminDealGuards, async (req, res, next) => {
  try {
    const adminId = req.userData?.id || req.userData?.userId || null
    const { rows: existing } = await query(`SELECT * FROM promotions WHERE id = $1`, [
      req.params.id,
    ])
    if (!existing.length || !isPendingAdminReview(existing[0])) {
      throw new NotFoundError('Deal not found or not pending approval')
    }
    const deal = existing[0]
    const activationPricing = await getActivationPricing()
    const activationAmount = Number(activationPricing.amount || 0)
    const next = resolveStatusAfterApproval(deal, { activationAmount })
    const { rows } = await query(
      `
      UPDATE promotions SET
        status = $2,
        payment_status = $3,
        approved_by_admin_id = $4,
        approved_at = NOW(),
        rejected_by_admin_id = NULL,
        rejected_at = NULL,
        rejection_reason = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id, next.status, next.payment_status, adminId]
    )
    await writeAuditLog(req, {
      action_type: 'deal.approved',
      tenant_type: 'ADMIN',
      target_id: req.params.id,
      payload_json: {
        status: next.status,
        payment_status: next.payment_status,
        activationAmount,
      },
    })

    const approvedDeal = rows[0]
    if (next.status === DEAL_STATUSES.ACTIVE || next.status === DEAL_STATUSES.SCHEDULED) {
      const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
        approvedDeal.supplier_id,
      ])
      const { notifyDealApproved } = await import('../services/notification.service.js')
      notifyDealApproved(approvedDeal, {
        supplierName: supplierRows[0]?.name,
      }).catch((err) => {
        logger.error('Deal approval notifications failed', { err: err.message, dealId: approvedDeal.id })
      })
    }

    res.json({ ok: true, data: { deal: approvedDeal }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/admin/:id/reject', ...adminDealGuards, async (req, res, next) => {
  try {
    const body = rejectBodySchema.parse(req.body || {})
    const adminId = req.userData?.id || req.userData?.userId || null
    const { rows } = await query(
      `
      UPDATE promotions SET
        status = 'rejected',
        rejected_by_admin_id = $2,
        rejected_at = NOW(),
        rejection_reason = $3,
        admin_notes = COALESCE($4, admin_notes),
        updated_at = NOW()
      WHERE id = $1 AND status IN ('pending_approval', 'pending_admin_approval')
      RETURNING *
      `,
      [req.params.id, adminId, body.rejectionReason || null, body.adminNotes || null]
    )
    if (!rows.length) throw new NotFoundError('Deal not found or not pending approval')
    await writeAuditLog(req, {
      action_type: 'deal.rejected',
      tenant_type: 'ADMIN',
      target_id: req.params.id,
      payload_json: { rejectionReason: body.rejectionReason || null },
    })
    res.json({ ok: true, data: { deal: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/admin/:id/pause', ...adminDealGuards, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE promotions SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND status IN ('active', 'scheduled') RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) throw new NotFoundError('Deal not found or cannot be paused')
    res.json({ ok: true, data: { deal: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/admin/pricing/:key', ...adminDealGuards, async (req, res, next) => {
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

router.post(
  '/cart-preview',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const body = cartPreviewSchema.parse(req.body)
      const preview = await previewDealForCart({
        promotionId: body.promotionId,
        couponCode: body.couponCode,
        supplierId: body.supplierId,
        restaurantId,
        subtotal: body.subtotal,
        lineItems: body.lineItems || [],
      })
      if (preview.eligible && body.promotionId) {
        await recordDealInteraction({
          dealId: body.promotionId,
          restaurantId,
          supplierId: body.supplierId,
          interactionType: 'apply_to_cart',
          metadata: { subtotal: body.subtotal, discountAmount: preview.discountAmount },
        })
      }
      res.json({ ok: true, data: { preview }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

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
  requirePermission('PROMOTIONS_VIEW'),
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

const promotionsCreateLimitGate = requireWithinLimit(
  'promotions',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('PROMOTIONS_MANAGE'),
  promotionsWriteGate
)

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

router.get('/', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const { status, limit, offset } = listQuerySchema.parse(req.query)
    const params = [supplierId]
    let sql = `SELECT * FROM promotions WHERE supplier_id = $1`
    if (status) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS total')
    const { rows: countRows } = await query(countSql, params)
    const total = countRows[0]?.total ?? 0
    params.push(limit, offset)
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
    const { rows } = await query(sql, params)
    let promotions
    try {
      promotions = await enrichPromotionRows(rows)
    } catch {
      promotions = rows.map((r) => ({
        ...r,
        is_promoted: false,
        active_deal_promotion_id: null,
        target_product_ids: [],
        target_category_ids: [],
      }))
    }
    res.json({
      ok: true,
      data: { promotions, total, limit, offset },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/', promotionsCreateLimitGate, async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const body = promotionBodySchema.parse(req.body)
    const fields = mapPromotionInsertFields(body)
    const promotion = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `
        INSERT INTO promotions (
          supplier_id, name, description, type, discount_value, min_order_amount,
          max_discount_cap, buy_quantity, get_quantity, applies_to, starts_at, ends_at,
          usage_limit, is_featured, status, image_url, coupon_code, min_order_quantity,
          cta_type, target_restaurant_types, target_areas, stock_quantity, requires_admin_approval,
          payment_status, submitted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          CASE
            WHEN $23 THEN 'pending_approval'
            WHEN $22 THEN 'pending_approval'
            ELSE 'draft'
          END,
          $15,$16,$17,$18,$19,$20,$21,$22,
          'not_required',
          CASE WHEN $23 OR $22 THEN NOW() ELSE NULL END
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
          Boolean(body.submitForReview),
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

    const needsResubmit = shouldResetApprovalOnEdit(existing, body)

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
        if (needsResubmit) {
          fields.push(`status = 'pending_approval'`)
          fields.push(`payment_status = 'not_required'`)
          fields.push(`submitted_at = NOW()`)
          fields.push(`approved_by_admin_id = NULL`)
          fields.push(`approved_at = NULL`)
        }
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

router.post('/:id/submit', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows } = await query(
      `
      UPDATE promotions SET
        status = 'pending_approval',
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND supplier_id = $2 AND status IN ('draft', 'rejected')
      RETURNING *
      `,
      [req.params.id, supplierId]
    )
    if (!rows.length) {
      throw new ValidationError('Only draft or rejected deals can be submitted for review')
    }
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/pay-activation', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const deal = await loadPromotionForSupplier(req.params.id, supplierId)
    if (deal.status !== DEAL_STATUSES.APPROVED_PENDING_PAYMENT) {
      throw new ValidationError('Deal is not awaiting activation payment')
    }
    if (deal.payment_status === PAYMENT_STATUSES.PAID) {
      throw new ValidationError('Deal activation is already paid')
    }
    const activationPricing = await getActivationPricing()
    const amount = Number(activationPricing.amount || 0)
    if (amount <= 0) {
      const next = resolveScheduledOrActive(deal, { payment_status: PAYMENT_STATUSES.NOT_REQUIRED })
      const { rows } = await query(
        `UPDATE promotions SET status = $2, payment_status = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id, next.status, next.payment_status]
      )
      return res.json({
        ok: true,
        data: { promotion: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    }
    return res.status(402).json({
      ok: false,
      data: {
        paymentRequired: true,
        amount,
        pricingKey: activationPricing.pricing_key || 'deal_activation',
        message:
          'Payment provider is not connected yet. Deal activation payment must be confirmed on the server before the deal can go live.',
      },
      error: {
        name: 'PAYMENT_REQUIRED',
        message: 'Activation payment required before deal can become active',
      },
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/activate', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new ValidationError('Only draft or rejected deals can be submitted')
    }
    const { rows } = await query(
      `
      UPDATE promotions SET status = 'pending_approval', submitted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND supplier_id = $2
      RETURNING *
      `,
      [req.params.id, supplierId]
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
      `UPDATE promotions SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND supplier_id = $2 RETURNING *`,
      [req.params.id, supplierId]
    )
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/resume', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    if (existing.status !== 'paused') throw new ValidationError('Deal is not paused')
    if (![PAYMENT_STATUSES.PAID, PAYMENT_STATUSES.NOT_REQUIRED].includes(existing.payment_status)) {
      throw new ValidationError('Deal cannot resume until activation payment is complete')
    }
    const next = resolveScheduledOrActive(existing, {
      payment_status: existing.payment_status || PAYMENT_STATUSES.NOT_REQUIRED,
    })
    const { rows } = await query(
      `UPDATE promotions SET status = $2, updated_at = NOW()
       WHERE id = $1 AND supplier_id = $3 AND status = 'paused' RETURNING *`,
      [req.params.id, next.status, supplierId]
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
      waivePayment:
        config.NODE_ENV !== 'production' ||
        process.env.ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT === 'true',
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
