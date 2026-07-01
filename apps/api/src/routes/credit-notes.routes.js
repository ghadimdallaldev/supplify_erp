import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { requireTenantScope } from '../lib/tenant-resolve.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { listCreditNotesForTenant, applyCreditNote } from '../services/disputes.service.js'

const router = express.Router()

const featureGate = requireFeature(
  'disputes_returns',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  featureGate
)

router.get('/', requirePermission('INVOICES_VIEW'), async (req, res, next) => {
  try {
    const { tenantId, tenantType } = await requireTenantScope(req)
    const creditNotes = await listCreditNotesForTenant(tenantId, tenantType)
    res.json({ ok: true, data: { creditNotes }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const applySchema = z.object({
  invoiceId: z.string().uuid(),
})

router.post('/:id/apply', requirePermission('INVOICES_MANAGE'), async (req, res, next) => {
  try {
    const body = applySchema.parse(req.body || {})
    const { tenantId, tenantType } = await requireTenantScope(req)
    const creditNote = await applyCreditNote(req.params.id, tenantId, tenantType, {
      invoiceId: body.invoiceId,
    })
    if (tenantType === 'RESTAURANT') {
      const { hookRecipeCostingAfterCreditNote } = await import(
        '../services/recipe-purchasing-hooks.service.js'
      )
      hookRecipeCostingAfterCreditNote(tenantId, body.invoiceId)
    }
    res.json({ ok: true, data: { creditNote }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as creditNotesRoutes }
