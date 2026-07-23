import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
} from '../lib/rbac.js'
import {
  previewCustomerImport,
  executeCustomerImport,
  buildCustomerImportErrorReportCsv,
} from '../services/supplier-customer-import.service.js'
import {
  listProspects,
  matchSingleProspect,
} from '../services/supplier-customer-matching.service.js'
import {
  createGrowthInvitation,
  getReferralInvitePublic,
} from '../services/supplier-growth-invitation.service.js'
import { createConnectionRequest } from '../services/supplier-connection-request.service.js'
import {
  sponsorProspect,
  getSponsorshipLimitForSupplier,
  getSponsorshipUsage,
  canCreateSponsorship,
  quoteSponsorship,
  createSponsorshipOffer,
  listSupplierSponsorships,
  getSupplierSponsorship,
  cancelSponsorship,
  initiateSupplierPayment,
  retrySupplierPayment,
} from '../services/supplier-sponsorship.service.js'
import { getSupplierGrowthMetrics } from '../services/supplier-growth-metrics.service.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { query } from '../lib/db.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { requireFeature } from '../lib/subscription.js'
import { writeAuditLog } from '../lib/audit.js'

const router = express.Router()

const supplierGrowthGate = requireFeature(
  'supplier_growth',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, requireRole(['SUPPLIER']), supplierGrowthGate)

async function resolveSupplierId(req) {
  const id = await getSupplierIdForRequest(req)
  if (!id) throw Object.assign(new Error('Supplier not found'), { name: 'NOT_FOUND' })
  return id
}

const importSchema = z.object({ csv: z.string().min(1) })

router.post(
  '/customers/import/preview',
  requirePermission('CUSTOMERS_IMPORT'),
  async (req, res, next) => {
    try {
      await resolveSupplierId(req)
      const body = importSchema.parse(req.body)
      const data = previewCustomerImport(body.csv)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post('/customers/import', requirePermission('CUSTOMERS_IMPORT'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const body = importSchema.parse(req.body)
    const result = await executeCustomerImport(supplierId, body.csv, {
      userId: req.userData.id,
    })
    await writeAuditLog(req, {
      action_type: 'customers.import.completed',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: result.batchId,
      payload_json: {
        resource_type: 'supplier_customer_import_batch',
        summary: {
          created: result.created,
          skipped: result.skipped,
          failed: result.failed,
        },
      },
    })
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/customers/import/error-report', requirePermission('CUSTOMERS_IMPORT'), (req, res) => {
  const csv = buildCustomerImportErrorReportCsv(req.body?.errors || [])
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="customer-import-errors.csv"')
  res.send(csv)
})

router.get('/customers/prospects', requirePermission('GROWTH_VIEW'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const offset = Number(req.query.offset) || 0
    const data = await listProspects(supplierId, {
      limit,
      offset,
      lifecycleStatus: req.query.lifecycleStatus || null,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/customers/prospects/:id/rematch',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const { rows } = await query(
        `SELECT id FROM supplier_customer_prospect WHERE id = $1 AND supplier_id = $2`,
        [req.params.id, supplierId]
      )
      if (!rows.length) throw new NotFoundError('Prospect not found')
      const data = await matchSingleProspect(req.params.id)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/customers/prospects/:id/connect',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const data = await createConnectionRequest(supplierId, req.params.id, { req })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const inviteSchema = z.object({ channel: z.enum(['email', 'whatsapp', 'link']).default('link') })

router.post(
  '/customers/prospects/:id/invite',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = inviteSchema.parse(req.body || {})
      const data = await createGrowthInvitation(supplierId, req.params.id, {
        channel: body.channel,
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const sponsorSchema = z.object({
  planCode: z.enum(['silver', 'gold', 'platinum']).optional(),
  planId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(128).optional(),
})

router.post(
  '/customers/prospects/:id/sponsor',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = sponsorSchema.parse(req.body || {})
      let data
      if (body.planId) {
        data = await createSponsorshipOffer(supplierId, {
          prospectId: req.params.id,
          suggestedPlanId: body.planId,
          idempotencyKey: body.idempotencyKey || null,
          offeredByUserId: req.userData?.id || null,
          req,
        })
      } else {
        data = await sponsorProspect(supplierId, req.params.id, {
          planCode: body.planCode || 'silver',
          req,
        })
      }
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const createSponsorshipSchema = z.object({
  prospectId: z.string().uuid(),
  restaurantId: z.string().uuid().optional().nullable(),
  invitationId: z.string().uuid().optional().nullable(),
  suggestedPlanId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().max(128).optional().nullable(),
})

router.get('/sponsorships', requirePermission('GROWTH_VIEW'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const data = await listSupplierSponsorships(supplierId, {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      status: req.query.status || null,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get(
  '/sponsorships/eligibility',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const data = await canCreateSponsorship(supplierId, {
        prospectId: req.query.prospectId || null,
        restaurantId: req.query.restaurantId || null,
      })
      const usage = await getSponsorshipUsage(supplierId)
      res.json({
        ok: true,
        data: { ...data, usage },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

const quoteSchema = z.object({
  planId: z.string().uuid(),
  prospectId: z.string().uuid().optional().nullable(),
})

router.post(
  '/sponsorships/quote',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = quoteSchema.parse(req.body)
      const data = await quoteSponsorship(supplierId, body)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post('/sponsorships', requirePermission('CUSTOMERS_MANAGE'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const body = createSponsorshipSchema.parse(req.body)
    const data = await createSponsorshipOffer(supplierId, {
      ...body,
      offeredByUserId: req.userData?.id || null,
      req,
    })
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/sponsorships/:id', requirePermission('GROWTH_VIEW'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const data = await getSupplierSponsorship(supplierId, req.params.id)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/sponsorships/:id/cancel',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const data = await cancelSponsorship(supplierId, req.params.id, {
        reason: req.body?.reason || 'cancelled_by_supplier',
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const paySchema = z.object({
  paymentMethodId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().min(8).max(128),
  provider: z.string().optional().nullable(),
})

router.post(
  '/sponsorships/:id/payment',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = paySchema.parse(req.body)
      const data = await initiateSupplierPayment(supplierId, req.params.id, {
        ...body,
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/sponsorships/:id/retry-payment',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = paySchema.partial().parse(req.body || {})
      const data = await retrySupplierPayment(supplierId, req.params.id, {
        paymentMethodId: body.paymentMethodId,
        idempotencyKey: body.idempotencyKey,
        provider: body.provider,
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/metrics', requirePermission('GROWTH_VIEW'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplierId(req)
    const [metrics, sponsorshipLimit, referralConfig, usage] = await Promise.all([
      getSupplierGrowthMetrics(supplierId),
      getSponsorshipLimitForSupplier(supplierId),
      getReferralProgramConfig(),
      getSponsorshipUsage(supplierId),
    ])
    res.json({
      ok: true,
      data: {
        ...metrics,
        sponsorshipLimit,
        sponsorshipUsage: usage,
        eligibleSponsorPlans: referralConfig.eligibleSponsorPlans ?? [],
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

export { router as supplierGrowthRoutes }

export const growthPublicRoutes = express.Router()

growthPublicRoutes.get('/referral/:token', async (req, res, next) => {
  try {
    const data = await getReferralInvitePublic(req.params.token)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})
