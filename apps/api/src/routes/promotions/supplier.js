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
import { getBillingGateway } from '../../lib/billing/gateway-registry.js'
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
  promotionsAccessGuard,
  promotionsWriteGate
)

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const payActivationBodySchema = z.object({
  paymentMethodId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
})

router.get('/analytics/summary', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const days = req.query.days ? Number(req.query.days) : 30
    const summary = await getSupplierDealsAnalyticsSummary(supplierId, { days })
    res.json({ ok: true, data: { summary }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
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
    if (body.submitForReview && !body.pricingKey) {
      throw new ValidationError('Select a boost package before submitting for approval')
    }
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
    let finalPromotion = promotion
    if (body.submitForReview && body.pricingKey) {
      await applyBoostSelectionToDeal(promotion.id, supplierId, body.pricingKey)
      const { rows } = await query(`SELECT * FROM promotions WHERE id = $1`, [promotion.id])
      finalPromotion = rows[0]
    }
    await writeAuditLog(req, {
      action_type: 'promotion.created',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: promotion.id,
      payload_json: { resource_type: 'deal', name: promotion.name },
    })
    if (body.submitForReview) {
      const { rows: supplierRows } = await query(`SELECT name FROM supplier WHERE id = $1`, [
        supplierId,
      ])
      const { notifyDealSubmitted } = await import('../../services/notification.service.js')
      notifyDealSubmitted(finalPromotion, { supplierName: supplierRows[0]?.name }).catch(() => {})
    }
    res.status(201).json({
      ok: true,
      data: { promotion: finalPromotion },
      error: null,
      requestId: req.requestId,
    })
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
    const body = submitDealBodySchema.parse(req.body || {})
    await loadPromotionForSupplier(req.params.id, supplierId)
    await applyBoostSelectionToDeal(req.params.id, supplierId, body.pricingKey)
    const { rows } = await query(
      `
      UPDATE promotions SET
        status = 'pending_approval',
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND supplier_id = $2 AND status IN ('draft', 'rejected', 'expired', 'paused')
      RETURNING *
      `,
      [req.params.id, supplierId]
    )
    if (!rows.length) {
      throw new ValidationError(
        'Only draft, rejected, expired, or paused deals can be submitted for review'
      )
    }
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    if (err.message?.includes('Boost package') || err.message === 'Deal not found') {
      next(new ValidationError(err.message))
    } else {
      next(err)
    }
  }
})

router.post('/:id/pay-activation', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const body = payActivationBodySchema.parse(req.body || {})
    const deal = await loadPromotionForSupplier(req.params.id, supplierId)
    if (deal.status !== DEAL_STATUSES.APPROVED_PENDING_PAYMENT) {
      throw new ValidationError('Deal is not awaiting boost payment')
    }
    if (deal.payment_status === PAYMENT_STATUSES.PAID) {
      throw new ValidationError('Deal boost is already paid')
    }
    const amount = Number(deal.boost_price_snapshot || 0)
    if (amount <= 0 || isBoostPaymentWaived()) {
      const next = resolveScheduledOrActive(deal, { payment_status: PAYMENT_STATUSES.NOT_REQUIRED })
      const { rows } = await query(
        `UPDATE promotions SET status = $2, payment_status = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id, next.status, next.payment_status]
      )
      let promotion = rows[0]
      if (next.status === DEAL_STATUSES.ACTIVE || next.status === DEAL_STATUSES.SCHEDULED) {
        const published = await publishDealAfterApproval(promotion, { waivePayment: true })
        promotion = published.deal
      }
      return res.json({
        ok: true,
        data: { promotion },
        error: null,
        requestId: req.requestId,
      })
    }

    const { rows: subscriptionRows } = await query(
      `SELECT id FROM subscription
       WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
         AND status NOT IN ('CANCELLED')
       ORDER BY created_at DESC LIMIT 1`,
      [supplierId]
    )
    if (!subscriptionRows.length) {
      throw new ValidationError('Supplier billing subscription not found')
    }

    const methodParams = body.paymentMethodId ? [supplierId, body.paymentMethodId] : [supplierId]
    const methodFilter = body.paymentMethodId ? `AND id = $2` : ''
    const { rows: paymentMethods } = await query(
      `SELECT id, provider, provider_payment_method_id
       FROM billing_payment_method
       WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
         AND status = 'ACTIVE' ${methodFilter}
       ORDER BY is_default DESC, created_at DESC
       LIMIT 1`,
      methodParams
    )
    if (!paymentMethods.length) {
      return res.status(402).json({
        ok: false,
        data: {
          paymentRequired: true,
          amount,
          pricingKey: deal.boost_pricing_key,
          message: 'Add an active supplier payment method before paying for this boost.',
        },
        error: {
          name: 'PAYMENT_REQUIRED',
          message: 'No active payment method is available for boost activation',
        },
        requestId: req.requestId,
      })
    }

    const method = paymentMethods[0]
    const gateway = getBillingGateway(method.provider)
    const idempotencyKey = body.idempotencyKey || `deal-boost:${deal.id}:${amount}`
    const paymentResult = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        `SELECT id, status FROM billing_payment WHERE idempotency_key = $1`,
        [idempotencyKey]
      )
      if (existing[0]?.status === 'SUCCEEDED') {
        const next = resolveScheduledOrActive(deal, { payment_status: PAYMENT_STATUSES.PAID })
        const { rows } = await client.query(
          `UPDATE promotions
           SET status = $2, payment_status = $3, updated_at = NOW()
           WHERE id = $1 AND supplier_id = $4 AND status = 'approved_pending_payment'
           RETURNING *`,
          [deal.id, next.status, next.payment_status, supplierId]
        )
        return { success: true, payment: existing[0], promotion: rows[0] }
      }

      const { rows: paymentRows } = await client.query(
        `INSERT INTO billing_payment (
          invoice_id, subscription_id, tenant_id, tenant_type, payment_method_id,
          provider, amount, currency, status, idempotency_key, metadata
        ) VALUES (NULL, $1, $2, 'SUPPLIER', $3, $4, $5, 'USD', 'PROCESSING', $6, $7)
        ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
        RETURNING *`,
        [
          subscriptionRows[0].id,
          supplierId,
          method.id,
          gateway.id,
          amount,
          idempotencyKey,
          JSON.stringify({ type: 'DEAL_BOOST', promotionId: deal.id }),
        ]
      )
      const payment = paymentRows[0]
      const chargeResult = await gateway.charge({
        amount,
        currency: 'USD',
        providerPaymentMethodId: method.provider_payment_method_id,
        idempotencyKey,
        metadata: { type: 'DEAL_BOOST', promotionId: deal.id },
      })

      if (chargeResult.status !== 'succeeded') {
        await client.query(
          `UPDATE billing_payment
           SET status = 'FAILED', provider_payment_id = $1, failure_code = $2,
               failure_message = $3, updated_at = now()
           WHERE id = $4`,
          [
            chargeResult.providerPaymentId,
            chargeResult.failureCode,
            chargeResult.failureMessage,
            payment.id,
          ]
        )
        return {
          success: false,
          amount,
          failureCode: chargeResult.failureCode,
          failureMessage: chargeResult.failureMessage,
        }
      }

      await client.query(
        `UPDATE billing_payment
         SET status = 'SUCCEEDED', provider_payment_id = $1, updated_at = now()
         WHERE id = $2`,
        [chargeResult.providerPaymentId, payment.id]
      )
      const next = resolveScheduledOrActive(deal, { payment_status: PAYMENT_STATUSES.PAID })
      const { rows } = await client.query(
        `UPDATE promotions
         SET status = $2, payment_status = $3, updated_at = NOW()
         WHERE id = $1 AND supplier_id = $4 AND status = 'approved_pending_payment'
         RETURNING *`,
        [deal.id, next.status, next.payment_status, supplierId]
      )
      if (!rows.length) {
        throw new ValidationError('Deal is no longer awaiting boost payment')
      }
      return { success: true, payment, promotion: rows[0] }
    })

    if (!paymentResult.success) {
      return res.status(402).json({
        ok: false,
        data: {
          paymentRequired: true,
          amount,
          pricingKey: deal.boost_pricing_key,
          message: paymentResult.failureMessage || 'Boost payment was declined.',
        },
        error: {
          name: 'PAYMENT_FAILED',
          message: paymentResult.failureMessage || 'Boost payment failed',
          code: paymentResult.failureCode,
        },
        requestId: req.requestId,
      })
    }

    const published = await publishDealAfterApproval(paymentResult.promotion, {
      waivePayment: false,
      paymentConfirmed: true,
    })
    return res.json({
      ok: true,
      data: { promotion: published.deal },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/activate', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const body = submitDealBodySchema.parse(req.body || {})
    await loadPromotionForSupplier(req.params.id, supplierId)
    await applyBoostSelectionToDeal(req.params.id, supplierId, body.pricingKey)
    const { rows } = await query(
      `
      UPDATE promotions SET
        status = 'pending_approval',
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND supplier_id = $2 AND status IN ('draft', 'rejected', 'expired', 'paused')
      RETURNING *
      `,
      [req.params.id, supplierId]
    )
    if (!rows.length) {
      throw new ValidationError('Only draft, rejected, expired, or paused deals can be submitted')
    }
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    if (err.message?.includes('Boost package') || err.message === 'Deal not found') {
      next(new ValidationError(err.message))
    } else {
      next(err)
    }
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
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    if (!['draft', 'rejected', 'expired', 'paused'].includes(existing.status)) {
      throw new ValidationError(
        'Select a boost package and submit the deal for approval to publish. Post-approval promote is no longer supported.'
      )
    }
    const body = promoteBodySchema.parse(req.body)
    if (!body.pricingKey) {
      throw new ValidationError('pricingKey is required')
    }
    await applyBoostSelectionToDeal(req.params.id, supplierId, body.pricingKey)
    const { rows } = await query(
      `
      UPDATE promotions SET status = 'pending_approval', submitted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND supplier_id = $2 RETURNING *
      `,
      [req.params.id, supplierId]
    )
    return res.json({
      ok: true,
      data: { promotion: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    if (
      err.message === 'Deal not found' ||
      err.message?.includes('Only active') ||
      err.message?.includes('not available')
    ) {
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

export default router
