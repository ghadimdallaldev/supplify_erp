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
} from '../services/supplier-sponsorship.service.js'
import { getSupplierGrowthMetrics } from '../services/supplier-growth-metrics.service.js'
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

const sponsorSchema = z.object({ planCode: z.enum(['silver', 'gold', 'platinum']) })

router.post(
  '/customers/prospects/:id/sponsor',
  requirePermission('CUSTOMERS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplierId(req)
      const body = sponsorSchema.parse(req.body)
      const data = await sponsorProspect(supplierId, req.params.id, {
        planCode: body.planCode,
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
    const metrics = await getSupplierGrowthMetrics(supplierId)
    const sponsorshipLimit = await getSponsorshipLimitForSupplier(supplierId)
    res.json({
      ok: true,
      data: { ...metrics, sponsorshipLimit },
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
