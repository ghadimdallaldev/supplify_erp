import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  resolveAdminContext,
  requirePermission,
  requireAnyPermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../../lib/rbac.js'
import { query, withTransaction } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { ValidationError, NotFoundError } from '../../middlewares/errorHandler.js'
import { loadActivePromotionsForSupplier } from '../../services/promotions.service.js'
import {
  discoverDealsForRestaurant,
  loadDealDetailForRestaurant,
  recordDealInteraction,
  getDealAnalytics,
  getSupplierDealsAnalyticsSummary,
  enrichPromotionRow,
  enrichPromotionRows,
  getEligibleProductsForDeal,
  getActiveDealPromotion,
  previewDealForCart,
} from '../../services/deal-promotions.service.js'
import {
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  resolveScheduledOrActive,
  isPendingAdminReview,
  shouldResetApprovalOnEdit,
} from '../../services/deal-lifecycle.service.js'
import {
  applyBoostSelectionToDeal,
  publishDealAfterApproval,
  resolveStatusAfterBoostApproval,
  buildBoostApprovalPreview,
  isBoostPaymentWaived,
} from '../../services/deal-publish.service.js'
import { writeAuditLog } from '../../lib/audit.js'
import { requireFeature, requireWithinLimit } from '../../lib/subscription.js'
import { getNewDealsBanner, dismissDealBanner } from '../../services/deal-banner.service.js'

import {
  adminDealGuards,
  promotionBodySchema,
  submitDealBodySchema,
  promoteBodySchema,
  interactBodySchema,
  cartPreviewSchema,
  rejectBodySchema,
  getSupplierId,
  getRestaurantId,
  loadPromotionForSupplier,
  syncPromotionTargets,
  syncRestaurantTargets,
  mapPromotionInsertFields,
  supplierDealsGate,
  BOOST_PRICING_WHERE,
  promotionsAccessGuard,
} from './promotions.helpers.js'

const router = express.Router()

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
  '/new-deals-banner',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const data = await getNewDealsBanner(restaurantId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/dismiss-banner',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  supplierDealsGate,
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const dealId = req.params.id
      const { rows } = await query(`SELECT supplier_id FROM promotions WHERE id = $1`, [dealId])
      if (!rows[0]) throw new NotFoundError('Deal not found')
      await dismissDealBanner(restaurantId, dealId, rows[0].supplier_id)
      res.json({ ok: true, data: { dismissed: true }, error: null, requestId: req.requestId })
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
  requireAnyPermission('PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE'),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `
        SELECT *
        FROM promotion_pricing_config
        WHERE is_active = TRUE
          AND (${BOOST_PRICING_WHERE})
        ORDER BY sort_order ASC, amount ASC
        `
      )
      res.json({ ok: true, data: { pricing: rows }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/admin/pricing', ...adminDealGuards, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM promotion_pricing_config ORDER BY sort_order ASC, amount ASC`
    )
    res.json({ ok: true, data: { pricing: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

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
    if (!deal.boost_pricing_key && !deal.boost_package_id) {
      throw new ValidationError('Deal has no boost package selected for publishing')
    }
    const boostAmount = Number(deal.boost_price_snapshot || 0)
    const waivePayment = isBoostPaymentWaived()
    const next = resolveStatusAfterBoostApproval(deal, { boostAmount, waivePayment })
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
    let approvedDeal = rows[0]
    let publishResult = null
    const canPublishNow =
      next.status === DEAL_STATUSES.ACTIVE || next.status === DEAL_STATUSES.SCHEDULED
    if (canPublishNow) {
      publishResult = await publishDealAfterApproval(approvedDeal, { waivePayment })
      approvedDeal = publishResult.deal
    }

    await writeAuditLog(req, {
      action_type: 'deal.approved',
      tenant_type: 'ADMIN',
      target_id: req.params.id,
      payload_json: {
        status: next.status,
        payment_status: next.payment_status,
        boostAmount,
        boostPreview: buildBoostApprovalPreview(deal),
        dealPromotionId: publishResult?.campaign?.id || null,
      },
    })

    if (next.status === DEAL_STATUSES.ACTIVE || next.status === DEAL_STATUSES.SCHEDULED) {
      const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
        approvedDeal.supplier_id,
      ])
      const { notifyDealApproved } = await import('../../services/notification.service.js')
      notifyDealApproved(approvedDeal, {
        supplierName: supplierRows[0]?.name,
      }).catch((err) => {
        logger.error('Deal approval notifications failed', {
          err: err.message,
          dealId: approvedDeal.id,
        })
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
    const { notifyDealRejected } = await import('../../services/notification.service.js')
    notifyDealRejected(rows[0], { rejectionReason: body.rejectionReason || null }).catch(() => {})
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
        estimatedReachLabel: z.string().optional().nullable(),
        badgeLabel: z.string().optional().nullable(),
        isRecommended: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
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
      estimatedReachLabel: 'estimated_reach_label',
      badgeLabel: 'badge_label',
      isRecommended: 'is_recommended',
      sortOrder: 'sort_order',
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

export default router
