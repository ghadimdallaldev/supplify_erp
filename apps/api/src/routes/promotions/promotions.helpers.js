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

const adminDealGuards = [
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requirePermission('ADMIN_ACCESS'),
]

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
  pricingKey: z.string().min(1).optional(),
})

const submitDealBodySchema = z.object({
  pricingKey: z.string().min(1),
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
  if (productIds.length > 0) {
    await client.query(
      `INSERT INTO promotion_targets (promotion_id, product_id)
       SELECT $1, unnest($2::uuid[])`,
      [promotionId, productIds]
    )
  }
  if (categoryIds.length > 0) {
    await client.query(
      `INSERT INTO promotion_targets (promotion_id, category_id)
       SELECT $1, unnest($2::uuid[])`,
      [promotionId, categoryIds]
    )
  }
}

async function syncRestaurantTargets(client, promotionId, restaurantIds = []) {
  await client.query(`DELETE FROM promotion_restaurant_targets WHERE promotion_id = $1`, [
    promotionId,
  ])
  if (restaurantIds.length > 0) {
    await client.query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id)
       SELECT $1, unnest($2::uuid[])`,
      [promotionId, restaurantIds]
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

const BOOST_PRICING_WHERE = `package_type = 'boost' OR pricing_key LIKE 'boost_%'`

/** GET: PROMOTIONS_VIEW; mutations: PROMOTIONS_MANAGE */
function promotionsAccessGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requireAnyPermission('PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE')(req, res, next)
  }
  return requirePermission('PROMOTIONS_MANAGE')(req, res, next)
}

export {
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
}
