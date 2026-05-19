import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
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

async function getTenantScope(req) {
  if (req.tenantContext?.tenantId && req.tenantContext?.tenantType) {
    return { tenantId: req.tenantContext.tenantId, tenantType: req.tenantContext.tenantType }
  }
  const role = req.userData.role
  if (role === 'RESTAURANT') {
    const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [
      req.userData.email,
    ])
    if (!rows.length) throw new ValidationError('Restaurant not found')
    return { tenantId: rows[0].id, tenantType: 'RESTAURANT' }
  }
  if (role === 'SUPPLIER') {
    const { rows } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])
    if (!rows.length) throw new ValidationError('Supplier not found')
    return { tenantId: rows[0].id, tenantType: 'SUPPLIER' }
  }
  throw new ValidationError('Tenant context required')
}

router.get('/', requirePermission('INVOICES_VIEW'), async (req, res, next) => {
  try {
    const { tenantId, tenantType } = await getTenantScope(req)
    const creditNotes = await listCreditNotesForTenant(tenantId, tenantType)
    res.json({ ok: true, data: { creditNotes }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const applySchema = z.object({
  invoiceId: z.string().uuid().optional(),
})

router.post('/:id/apply', requirePermission('INVOICES_MANAGE'), async (req, res, next) => {
  try {
    const body = applySchema.parse(req.body || {})
    const { tenantId, tenantType } = await getTenantScope(req)
    const creditNote = await applyCreditNote(req.params.id, tenantId, tenantType, {
      invoiceId: body.invoiceId,
    })
    res.json({ ok: true, data: { creditNote }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as creditNotesRoutes }
