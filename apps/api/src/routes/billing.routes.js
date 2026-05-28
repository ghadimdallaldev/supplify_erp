import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, getRequestTenant } from '../lib/rbac.js'
import { billingAccessGuard } from '../lib/route-permissions.js'
import { logger } from '../lib/logger.js'
import {
  getBillingStatus,
  listPaymentMethods,
  addPaymentMethod,
  removePaymentMethod,
  checkoutSubscription,
  payOpenInvoices,
  setAutoRenew,
} from '../lib/billing/billing-service.js'
import { invalidateTenantSubscriptionCache } from '../lib/subscription.js'
import { listBillingGateways } from '../lib/billing/gateway-registry.js'
import { writeAuditLog } from '../lib/audit.js'

const router = express.Router()

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  billingAccessGuard
)

const cardSchema = z.object({
  number: z.string().min(13).max(19).optional(),
  expMonth: z.union([z.string(), z.number()]).optional(),
  expYear: z.union([z.string(), z.number()]).optional(),
  accountLast4: z.string().max(4).optional(),
  bankName: z.string().max(120).optional(),
})

const addPaymentMethodSchema = z.object({
  type: z.enum(['CARD', 'BANK_ACCOUNT']),
  provider: z.string().optional(),
  setAsDefault: z.boolean().optional(),
  card: cardSchema.optional(),
})

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  paymentMethodId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  provider: z.string().optional(),
})

const payNowSchema = z.object({
  paymentMethodId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  provider: z.string().optional(),
})

router.get('/status', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const status = await getBillingStatus(tenant.tenantId, tenant.tenantType)
    res.json({
      ok: true,
      data: {
        ...status,
        gateways: listBillingGateways(),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get billing status error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get billing status' },
      requestId: req.requestId,
    })
  }
})

router.get('/payment-methods', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const methods = await listPaymentMethods(tenant.tenantId, tenant.tenantType)
    res.json({
      ok: true,
      data: { paymentMethods: methods },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({
        ok: true,
        data: { paymentMethods: [] },
        error: null,
        requestId: req.requestId,
      })
    }
    logger.error('List payment methods error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list payment methods' },
      requestId: req.requestId,
    })
  }
})

router.post('/payment-methods', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const body = addPaymentMethodSchema.parse(req.body)
    const method = await addPaymentMethod(tenant.tenantId, tenant.tenantType, {
      type: body.type,
      card: body.card,
      provider: body.provider,
      setAsDefault: body.setAsDefault !== false,
    })
    await writeAuditLog(req, {
      action_type: 'billing.payment_method.added',
      tenant_type: tenant.tenantType,
      tenant_id: tenant.tenantId,
      target_id: method.id,
      payload_json: { provider: method.provider, type: method.type, last4: method.last4 },
    })
    res.status(201).json({
      ok: true,
      data: { paymentMethod: method },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Add payment method error', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BAD_REQUEST', message: error.message || 'Failed to add payment method' },
      requestId: req.requestId,
    })
  }
})

router.delete('/payment-methods/:id', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const removed = await removePaymentMethod(tenant.tenantId, tenant.tenantType, req.params.id)
    if (!removed) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Payment method not found' },
        requestId: req.requestId,
      })
    }
    res.json({ ok: true, data: { removed: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Remove payment method error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to remove payment method' },
      requestId: req.requestId,
    })
  }
})

router.post('/checkout', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const body = checkoutSchema.parse(req.body)
    const result = await checkoutSubscription({
      tenantId: tenant.tenantId,
      tenantType: tenant.tenantType,
      planId: body.planId,
      billingCycle: body.billingCycle,
      paymentMethodId: body.paymentMethodId,
      idempotencyKey: body.idempotencyKey || `chk_${req.requestId}`,
      provider: body.provider,
    })
    await writeAuditLog(req, {
      action_type: 'billing.checkout.completed',
      tenant_type: tenant.tenantType,
      tenant_id: tenant.tenantId,
      payload_json: { planId: body.planId, billingCycle: body.billingCycle },
    })
    invalidateTenantSubscriptionCache(tenant.tenantId, tenant.tenantType).catch(() => {})
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error.name === 'PAYMENT_FAILED') {
      return res.status(402).json({
        ok: false,
        data: error.details || null,
        error: {
          name: 'PAYMENT_FAILED',
          message: error.message,
          details: error.details,
        },
        requestId: req.requestId,
      })
    }
    logger.error('Checkout error', { error: error.message, name: error.name })
    const status = error.name === 'NOT_FOUND' ? 404 : 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'BAD_REQUEST', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/pay-now', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const body = payNowSchema.parse(req.body)
    const result = await payOpenInvoices({
      tenantId: tenant.tenantId,
      tenantType: tenant.tenantType,
      paymentMethodId: body.paymentMethodId,
      idempotencyKey: body.idempotencyKey || `pay_${req.requestId}`,
      provider: body.provider,
    })
    if (!result.allPaid) {
      return res.status(402).json({
        ok: false,
        data: result,
        error: {
          name: 'PAYMENT_FAILED',
          message: 'Payment could not be completed',
          details: result,
        },
        requestId: req.requestId,
      })
    }
    await writeAuditLog(req, {
      action_type: 'billing.pay_now.completed',
      tenant_type: tenant.tenantType,
      tenant_id: tenant.tenantId,
    })
    invalidateTenantSubscriptionCache(tenant.tenantId, tenant.tenantType).catch(() => {})
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Pay now error', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: error.name || 'BAD_REQUEST', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.patch('/auto-renew', async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const autoRenew = Boolean(req.body?.autoRenew)
    const result = await setAutoRenew(tenant.tenantId, tenant.tenantType, autoRenew)
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Set auto-renew error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update auto-renew' },
      requestId: req.requestId,
    })
  }
})

export { router as billingRoutes }
