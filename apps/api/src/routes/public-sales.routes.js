import express from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config/env.js'
import { optionalAuth } from '../lib/rbac.js'
import { createRateLimitStore } from '../lib/rate-limit-store.js'
import { logger } from '../lib/logger.js'
import { buildAppUrl } from '../lib/app-url.js'
import {
  createPublicOrder,
  getGuestPublicOrder,
  listPublicSalesSuppliers,
  previewPublicOrder,
} from '../services/public-sales.service.js'
import { isPlatformFeatureEnabled } from '../lib/feature-flags.js'
import { scheduleOrderPlacedNotification } from './orders/orders.helpers.js'
import { sendTemplateEmail } from '../services/email/email.service.js'
import { isWhatsAppConfigured, sendWhatsAppMessage } from '../services/whatsapp.service.js'

export const publicSalesRoutes = express.Router()

const MAX_PUBLIC_CHECKOUT_BYTES = 64 * 1024

function enforcePublicCheckoutBodySize(req, res, next) {
  const declaredLength = Number(req.get('content-length'))
  const parsedLength = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')
  if (
    (Number.isFinite(declaredLength) && declaredLength > MAX_PUBLIC_CHECKOUT_BYTES) ||
    parsedLength > MAX_PUBLIC_CHECKOUT_BYTES
  ) {
    return res.status(413).json({
      ok: false,
      data: null,
      error: {
        name: 'PAYLOAD_TOO_LARGE',
        message: 'Public checkout payload is too large',
      },
      requestId: req.requestId,
    })
  }
  return next()
}

const noopLimiter = (_req, _res, next) => next()
function publicWriteLimiter({ windowMs, limit, prefix, keyGenerator }) {
  if (!config.RATE_LIMIT_ENABLED) return noopLimiter
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore(prefix),
    ...(keyGenerator ? { keyGenerator } : {}),
    message: {
      ok: false,
      data: null,
      error: { name: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
    },
  })
}

const previewLimiter = publicWriteLimiter({
  windowMs: 60_000,
  limit: 30,
  prefix: 'rl:public-order-preview',
})
const createLimiter = publicWriteLimiter({
  windowMs: 10 * 60_000,
  limit: 5,
  prefix: 'rl:public-order-create',
  keyGenerator: (req) => `${req.ip}:${String(req.params.idOrSlug || '').toLowerCase()}`,
})
const trackingLimiter = publicWriteLimiter({
  windowMs: 60_000,
  limit: 30,
  prefix: 'rl:public-order-track',
})

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100000),
})

const addressSchema = z
  .object({
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(120),
    region: z.string().max(120).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().min(2).max(80),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict()

const checkoutSchema = z
  .object({
    items: z.array(itemSchema).min(1).max(50),
    fulfillmentMethod: z.enum(['DELIVERY', 'PICKUP']),
    deliveryAddress: addressSchema.optional(),
    paymentMethod: z.enum(['CASH_ON_DELIVERY', 'CASH_ON_PICKUP', 'BANK_TRANSFER']),
  })
  .superRefine((value, ctx) => {
    const ids = value.items.map((item) => item.productId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate products are not allowed' })
    }
    if (value.fulfillmentMethod === 'DELIVERY' && !value.deliveryAddress) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Delivery address is required' })
    }
  })

const createSchema = checkoutSchema.and(
  z.object({
    customer: z.object({
      name: z.string().min(2).max(160),
      phone: z.string().min(5).max(30),
      email: z.string().email().max(254).optional(),
      whatsappConsent: z.boolean().optional(),
    }),
    deliveryNotes: z.string().max(1000).optional(),
  })
)

function sendError(res, req, error) {
  const validation = error.name === 'ZodError' || error.name === 'ValidationError'
  const status = validation
    ? 400
    : error.name === 'ForbiddenError'
      ? 403
      : error.name === 'NotFoundError'
        ? 404
        : error.status || 500
  if (status === 500) logger.error('Public sales request failed', { error: error.message })
  return res.status(status).json({
    ok: false,
    data: null,
    error: {
      name: error.code || (validation ? 'VALIDATION_ERROR' : error.name || 'INTERNAL_ERROR'),
      message: status === 500 ? 'Unable to process public order request' : error.message,
      ...(error.issues ? { details: error.issues } : {}),
    },
    requestId: req.requestId,
  })
}

publicSalesRoutes.get('/features', async (req, res) => {
  try {
    const mobilePublicShop = await isPlatformFeatureEnabled('mobile_public_shop')
    res.json({
      ok: true,
      data: { mobile_public_shop: mobilePublicShop },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    sendError(res, req, error)
  }
})

publicSalesRoutes.get('/suppliers', async (req, res) => {
  try {
    const params = z
      .object({
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(48).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(req.query)
    const data = await listPublicSalesSuppliers(params)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    sendError(res, req, error)
  }
})

publicSalesRoutes.post(
  '/suppliers/:idOrSlug/orders/preview',
  enforcePublicCheckoutBodySize,
  previewLimiter,
  async (req, res) => {
    try {
      const input = checkoutSchema.parse(req.body)
      const preview = await previewPublicOrder(req.params.idOrSlug, input)
      const data = {
        ...preview,
        items: preview.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        warehouse: undefined,
      }
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      sendError(res, req, error)
    }
  }
)

publicSalesRoutes.post(
  '/suppliers/:idOrSlug/orders',
  enforcePublicCheckoutBodySize,
  createLimiter,
  optionalAuth,
  async (req, res) => {
    try {
      const input = createSchema.parse(req.body)
      const key = req.get('Idempotency-Key')
      if (!key) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key is required' },
          requestId: req.requestId,
        })
      }
      const actor = req.userData || null
      if (actor && actor.role !== 'CONSUMER') {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Business accounts must use the existing restaurant ordering workflow',
          },
          requestId: req.requestId,
        })
      }
      const data = await createPublicOrder({
        idOrSlug: req.params.idOrSlug,
        input,
        actor,
        idempotencyKey: key,
      })
      const supplierId = data.order.items[0]?.supplierId || null
      // L7: Idempotent replay must not re-notify the supplier.
      if (!data.replay) {
        scheduleOrderPlacedNotification(
          {
            id: data.order.id,
            total_amount: data.order.total,
            restaurant_id: null,
            customer_type: data.order.customerType,
            consumer_user_id: actor?.id || null,
            customer_contact_snapshot: data.order.customer,
          },
          supplierId
        )
      }
      if (!data.replay && !actor && input.customer.email) {
        void sendTemplateEmail({
          to: input.customer.email,
          template: 'order.placed',
          data: {
            orderNumber: data.order.reference,
            status: 'Pending confirmation',
            total: `${data.order.total} ${data.order.currency}`,
            tenantName: data.supplierName,
            ctaUrl: data.trackingToken
              ? buildAppUrl(`/order/track/${data.trackingToken}`)
              : buildAppUrl('/shop/orders'),
          },
          tenantId: supplierId,
          entityId: data.order.id,
          eventType: 'public_order.placed',
          eventKey: `public-order-placed:${data.order.id}`,
          sensitive: true,
        })
      }
      if (
        !data.replay &&
        data.trackingToken &&
        input.customer.whatsappConsent &&
        isWhatsAppConfigured()
      ) {
        void sendWhatsAppMessage({
          to: input.customer.phone,
          message: `Supplify order ${data.order.reference} was placed. Track it at ${buildAppUrl(`/order/track/${data.trackingToken}`)}`,
          tenantId: supplierId,
          eventType: 'public_order.placed',
          eventKey: `public-order-placed:${data.order.id}:whatsapp`,
          sensitive: true,
        })
      }
      res.status(data.replay ? 200 : 201).json({
        ok: true,
        data,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      sendError(res, req, error)
    }
  }
)

publicSalesRoutes.get('/orders/:trackingToken', trackingLimiter, async (req, res) => {
  try {
    const token = z.string().min(32).max(200).parse(req.params.trackingToken)
    const data = await getGuestPublicOrder(token)
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    sendError(res, req, error)
  }
})
