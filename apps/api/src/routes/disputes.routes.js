import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  requireAnyPermission,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { requireRestaurantId, requireSupplierId } from '../lib/tenant-resolve.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  createDispute,
  listDisputesForRestaurant,
  listIncomingDisputesForSupplier,
  getDispute,
  addDisputeAttachment,
  cancelDispute,
  reviewDispute,
  rejectDispute,
  resolveDispute,
} from '../services/disputes.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext)

const featureGate = requireFeature(
  'disputes_returns',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(featureGate)

const disputeItemSchema = z.object({
  orderItemId: z.string().uuid().optional(),
  productName: z.string().max(255).optional(),
  quantityOrdered: z.number().nonnegative().optional(),
  quantityReceived: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative().optional(),
  issueDescription: z.string().optional(),
})

const createDisputeSchema = z.object({
  orderId: z.string().uuid(),
  supplierId: z.string().uuid(),
  receivingReportId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  type: z.enum([
    'short_delivery',
    'damaged_goods',
    'wrong_items',
    'quality_issue',
    'billing_error',
    'other',
  ]),
  description: z.string().min(1),
  disputedAmount: z.number().nonnegative().optional(),
  items: z.array(disputeItemSchema).optional(),
  attachments: z
    .array(z.object({ fileKey: z.string().min(1), fileName: z.string().optional() }))
    .optional(),
})

const attachmentSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().optional(),
})

const resolveSchema = z.object({
  resolutionType: z.enum(['credit_note', 'replacement', 'refund', 'no_action']),
  resolutionNotes: z.string().optional(),
  creditNoteAmount: z.number().positive().optional(),
  creditNoteNotes: z.string().optional(),
})

const rejectSchema = z.object({
  resolutionNotes: z.string().min(1),
})

function isSupplierDisputeActor(req) {
  return req.userData?.role === 'SUPPLIER' || req.tenantContext?.tenantType === 'SUPPLIER'
}

/** Restaurants use ORDERS_VIEW; suppliers need fulfillment access (not promotions-only roles). */
function requireDisputeReadAccess(req, res, next) {
  const middleware = requirePermission(
    isSupplierDisputeActor(req) ? 'FULFILLMENT_VIEW' : 'ORDERS_VIEW'
  )
  return middleware(req, res, next)
}

// Supplier: list incoming (before /:id)
router.get(
  '/incoming',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('FULFILLMENT_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await requireSupplierId(req)
      const disputes = await listIncomingDisputesForSupplier(supplierId, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      })
      res.json({ ok: true, data: { disputes }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Restaurant: create & list
router.post(
  '/',
  requireRole(['RESTAURANT', 'ADMIN']),
  requireAnyPermission('ORDERS_CREATE', 'RECEIVING_MANAGE'),
  async (req, res, next) => {
    try {
      const body = createDisputeSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const data = await createDispute({
        restaurantId,
        userId: req.userData.id,
        orderId: body.orderId,
        supplierId: body.supplierId,
        receivingReportId: body.receivingReportId,
        invoiceId: body.invoiceId,
        type: body.type,
        description: body.description,
        disputedAmount: body.disputedAmount,
        items: body.items || [],
        attachmentKeys: body.attachments || [],
      })
      res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
  async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const disputes = await listDisputesForRestaurant(restaurantId, {
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
      })
      res.json({ ok: true, data: { disputes }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Shared detail
router.get(
  '/:id',
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  requireDisputeReadAccess,
  async (req, res, next) => {
    try {
      let scope
      if (req.userData.role === 'SUPPLIER' || req.tenantContext?.tenantType === 'SUPPLIER') {
        scope = { supplierId: await requireSupplierId(req) }
      } else {
        scope = { restaurantId: await requireRestaurantId(req) }
      }
      const data = await getDispute(req.params.id, scope)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/attachments',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_CREATE'),
  async (req, res, next) => {
    try {
      const body = attachmentSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const attachment = await addDisputeAttachment(
        req.params.id,
        restaurantId,
        req.userData.id,
        body
      )
      res
        .status(201)
        .json({ ok: true, data: { attachment }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/cancel',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('ORDERS_CREATE'),
  async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const data = await cancelDispute(req.params.id, restaurantId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/review',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await requireSupplierId(req)
      const data = await reviewDispute(req.params.id, supplierId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/resolve',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const body = resolveSchema.parse(req.body)
      const supplierId = await requireSupplierId(req)
      const data = await resolveDispute(req.params.id, supplierId, body)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/:id/reject',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const body = rejectSchema.parse(req.body)
      const supplierId = await requireSupplierId(req)
      const data = await rejectDispute(req.params.id, supplierId, body.resolutionNotes)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as disputesRoutes }
