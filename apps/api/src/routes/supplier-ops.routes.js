import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  requireAnyPermission,
  getRequestTenant,
} from '../lib/rbac.js'
import {
  getLinkedDriverId,
  isDriverOnlyPermissions,
  assertDriverAssignmentAccess,
} from '../lib/driver-rbac.js'
import { requireSupplierId } from '../lib/tenant-resolve.js'
import { requireFeature } from '../lib/subscription.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { getSupplierCommandCenter } from '../services/supplier-command-center.service.js'
import {
  getReorderIntelligence,
  createReorderReminderDraft,
} from '../services/supplier-reorder-intelligence.service.js'
import {
  getSupplierReceivables,
  exportSupplierStatementCsv,
} from '../services/supplier-receivables.service.js'
import { getSupplierDeliveryBoard } from '../services/supplier-deliveries.service.js'
import {
  previewProductImport,
  executeProductImport,
  buildErrorReportCsv,
} from '../services/product-import.service.js'
import {
  listProductSubstitutes,
  createProductSubstitute,
  deleteProductSubstitute,
  getSubstitutesForOrderItem,
  proposeOrderSubstitution,
} from '../services/product-substitutes.service.js'
import {
  acceptAmendment,
  getOrderForAmendment,
  notifyAmendmentParty,
} from '../services/order-amendments.service.js'
import {
  listFulfillmentIssues,
  createShortageIssue,
  createSubstitutionIssue,
  openFulfillmentChat,
} from '../services/order-fulfillment-issues.service.js'
import { listSupplierAtRisk } from '../services/reorder-cadence.service.js'
import { query } from '../lib/db.js'

const router = express.Router()

const financeGate = requireFeature(
  'finance_invoices',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

const fulfillmentGate = requireFeature(
  'fulfillment',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

const amendmentsGate = requireFeature(
  'order_amendments',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, requireRole(['SUPPLIER', 'ADMIN']))

async function resolveSupplier(req) {
  const tenant = await getRequestTenant(req)
  if (tenant?.tenantType === 'SUPPLIER') return tenant.tenantId
  return requireSupplierId(req)
}

const commandCenterGate = requireAnyPermission(
  'ORDERS_MANAGE',
  'INVOICES_VIEW',
  'CATALOG_EDIT',
  'FULFILLMENT_VIEW',
  'PROMOTIONS_MANAGE'
)

router.get('/command-center', commandCenterGate, async (req, res, next) => {
  try {
    const supplierId = await resolveSupplier(req)
    const data = await getSupplierCommandCenter(supplierId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get(
  '/reorder-intelligence',
  requireAnyPermission('ORDERS_MANAGE', 'PROMOTIONS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const graceDays = req.query.grace_days ? parseInt(req.query.grace_days, 10) : undefined
      const data = await getReorderIntelligence(supplierId, { graceDays })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/reorder-intelligence/:restaurantId/reminder-draft',
  requireAnyPermission('ORDERS_MANAGE', 'PROMOTIONS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const draft = await createReorderReminderDraft(
        supplierId,
        req.params.restaurantId,
        req.userData.id
      )
      if (!draft) {
        throw new ValidationError('Restaurant is not currently due for reorder')
      }
      res.status(201).json({ ok: true, data: { draft }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/deliveries/board',
  requireAnyPermission('FULFILLMENT_VIEW', 'DRIVER_DELIVERIES_VIEW'),
  fulfillmentGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const perms = req.tenantContext?.permissions ?? []
      let scopedDriverId = req.query.driver_id || req.query.driverId
      if (isDriverOnlyPermissions(perms)) {
        scopedDriverId = await getLinkedDriverId(req.userData.id, supplierId)
        if (!scopedDriverId) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Driver profile not linked to your account',
            },
            requestId: req.requestId,
          })
        }
      }
      const data = await getSupplierDeliveryBoard(supplierId, {
        date: req.query.date,
        status: req.query.status,
        driverId: scopedDriverId,
        area: req.query.area,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/invoices/receivables',
  requirePermission('INVOICES_VIEW'),
  financeGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const data = await getSupplierReceivables(supplierId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/invoices/receivables/statement/:restaurantId',
  requirePermission('INVOICES_VIEW'),
  financeGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const csv = await exportSupplierStatementCsv(supplierId, req.params.restaurantId)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="statement-${req.params.restaurantId}.csv"`
      )
      res.send(csv)
    } catch (err) {
      next(err)
    }
  }
)

const importPreviewSchema = z.object({
  csv: z.string().min(1),
  columnMapping: z.record(z.string()).optional(),
})

router.post(
  '/products/import/preview',
  requirePermission('CATALOG_EDIT'),
  async (req, res, next) => {
    try {
      await resolveSupplier(req)
      const body = importPreviewSchema.parse(req.body)
      const data = previewProductImport(body.csv, body.columnMapping)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post('/products/import', requirePermission('CATALOG_EDIT'), async (req, res, next) => {
  try {
    const supplierId = await resolveSupplier(req)
    const body = importPreviewSchema.extend({ partial: z.boolean().optional() }).parse(req.body)
    const result = await executeProductImport(supplierId, body.csv, {
      partial: body.partial !== false,
    })
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/products/import/error-report',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    const { errors } = req.body || {}
    const csv = buildErrorReportCsv(errors || [])
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="import-errors.csv"')
    res.send(csv)
  }
)

router.get(
  '/products/:productId/substitutes',
  requirePermission('CATALOG_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const substitutes = await listProductSubstitutes(supplierId, req.params.productId)
      res.json({ ok: true, data: { substitutes }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const substituteCreateSchema = z.object({
  substituteProductId: z.string().uuid(),
  priority: z.number().int().min(1).optional(),
  notes: z.string().max(500).optional(),
})

router.post(
  '/products/:productId/substitutes',
  requirePermission('CATALOG_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const body = substituteCreateSchema.parse(req.body)
      const row = await createProductSubstitute(supplierId, req.params.productId, body)
      res
        .status(201)
        .json({ ok: true, data: { substitute: row }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/products/:productId/substitutes/:substituteId',
  requirePermission('CATALOG_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      await deleteProductSubstitute(supplierId, req.params.productId, req.params.substituteId)
      res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const proposeSubstitutionSchema = z.object({
  orderItemId: z.string().uuid(),
  substituteProductId: z.string().uuid(),
  description: z.string().min(1).optional(),
})

router.get(
  '/orders/:orderId/substitutions',
  requirePermission('ORDERS_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const order = await getOrderForAmendment(req.params.orderId)
      if (order.supplier_id !== supplierId) throw new ValidationError('Access denied')

      const { rows: items } = await query(
        `
      SELECT oi.id, oi.product_id, p.name AS product_name
      FROM order_item oi
      JOIN product p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND oi.supplier_id = $2
      `,
        [req.params.orderId, supplierId]
      )

      const suggestions = []
      for (const item of items) {
        const substitutes = await getSubstitutesForOrderItem(supplierId, item.product_id)
        if (substitutes.length) {
          suggestions.push({
            orderItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            substitutes,
          })
        }
      }

      const { rows: pending } = await query(
        `
      SELECT oa.* FROM order_amendments oa
      WHERE oa.order_id = $1 AND oa.change_type = 'item_substitution'
      ORDER BY oa.created_at DESC
      `,
        [req.params.orderId]
      )

      res.json({
        ok: true,
        data: { suggestions, amendments: pending },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/substitutions/propose',
  requireAnyPermission('ORDERS_MANAGE', 'CATALOG_EDIT', 'FULFILLMENT_MANAGE'),
  amendmentsGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const body = proposeSubstitutionSchema.parse(req.body)
      const result = await proposeOrderSubstitution({
        orderId: req.params.orderId,
        supplierId,
        orderItemId: body.orderItemId,
        substituteProductId: body.substituteProductId,
        requestedByUserId: req.userData.id,
        description: body.description,
      })
      res.status(201).json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/substitutions/:amendmentId/accept',
  requirePermission('ORDERS_MANAGE'),
  amendmentsGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const order = await getOrderForAmendment(req.params.orderId)
      if (order.supplier_id !== supplierId) throw new ValidationError('Access denied')
      const { amendment, newTotal } = await acceptAmendment(
        req.params.amendmentId,
        req.params.orderId,
        req.userData.id,
        req.body?.responseNotes
      )
      await notifyAmendmentParty(order, amendment, 'accepted')
      res.json({
        ok: true,
        data: { amendment, newTotal },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/substitutions/:amendmentId/reject',
  requirePermission('ORDERS_MANAGE'),
  amendmentsGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const order = await getOrderForAmendment(req.params.orderId)
      if (order.supplier_id !== supplierId) throw new ValidationError('Access denied')

      const { rows } = await query(
        `
        UPDATE order_amendments
        SET status = 'rejected', responded_by = $3, response_notes = $4, responded_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND order_id = $2 AND status = 'pending'
        RETURNING *
        `,
        [
          req.params.amendmentId,
          req.params.orderId,
          req.userData.id,
          req.body?.responseNotes || null,
        ]
      )
      if (!rows.length) throw new ValidationError('Amendment not found or not pending')
      await notifyAmendmentParty(order, rows[0], 'rejected')
      res.json({ ok: true, data: { amendment: rows[0] }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const fulfillmentIssueBaseSchema = z.object({
  orderItemId: z.string().uuid(),
  shortageQuantity: z.number().optional(),
  availableQuantity: z.number().optional(),
  replacementProductId: z.string().uuid().optional(),
  replacementQuantity: z.number().optional(),
  replacementUnit: z.string().optional(),
  message: z.string().optional(),
})

router.get(
  '/orders/:orderId/fulfillment-issues',
  requirePermission('ORDERS_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const issues = await listFulfillmentIssues(req.params.orderId, supplierId)
      res.json({ ok: true, data: { issues }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/fulfillment-issues/shortage',
  requireAnyPermission('ORDERS_MANAGE', 'FULFILLMENT_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const body = fulfillmentIssueBaseSchema.parse(req.body)
      const result = await createShortageIssue({
        orderId: req.params.orderId,
        supplierId,
        orderItemId: body.orderItemId,
        createdByUserId: req.userData.id,
        shortageQuantity: body.shortageQuantity,
        availableQuantity: body.availableQuantity,
        replacementProductId: body.replacementProductId,
        replacementQuantity: body.replacementQuantity,
        replacementUnit: body.replacementUnit,
        message: body.message,
      })
      res.status(201).json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/fulfillment-issues/substitution',
  requireAnyPermission('ORDERS_MANAGE', 'FULFILLMENT_MANAGE'),
  amendmentsGate,
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const body = fulfillmentIssueBaseSchema
        .extend({
          substituteProductId: z.string().uuid().optional(),
        })
        .parse(req.body)
      const result = await createSubstitutionIssue({
        orderId: req.params.orderId,
        supplierId,
        orderItemId: body.orderItemId,
        createdByUserId: req.userData.id,
        substituteProductId: body.substituteProductId || body.replacementProductId,
        replacementQuantity: body.replacementQuantity,
        replacementUnit: body.replacementUnit,
        availableQuantity: body.availableQuantity,
        message: body.message,
      })
      res.status(201).json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/orders/:orderId/fulfillment-issues/open-chat',
  requireAnyPermission('ORDERS_MANAGE', 'FULFILLMENT_MANAGE', 'CHAT_SEND'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const body = z
        .object({
          orderItemId: z.string().uuid(),
          message: z.string().optional(),
        })
        .parse(req.body)
      const result = await openFulfillmentChat({
        orderId: req.params.orderId,
        supplierId,
        orderItemId: body.orderItemId,
        createdByUserId: req.userData.id,
        message: body.message,
      })
      res.status(201).json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/reorder-cadence/at-risk',
  requireAnyPermission('ORDERS_MANAGE', 'PROMOTIONS_MANAGE'),
  async (req, res, next) => {
    try {
      const supplierId = await resolveSupplier(req)
      const atRisk = await listSupplierAtRisk(supplierId)
      res.json({ ok: true, data: { atRisk }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as supplierOpsRoutes }
