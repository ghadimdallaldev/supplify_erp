import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
  requirePermission,
  requireAnyPermission,
} from '../lib/rbac.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import { logger } from '../lib/logger.js'
import {
  createQuoteRequest,
  listRestaurantQuoteRequests,
  getQuoteRequestDetail,
  getQuoteRequestCompare,
  listSupplierQuoteRequests,
  getSupplierQuoteRequestDetail,
  submitQuoteResponse,
  declineQuoteRequest,
  buildCartPayloadFromResponse,
  assertRestaurantOwnsQuoteRequest,
  updateQuoteRequestStatus,
  SUPPLIER_INBOX_STATUSES,
} from '../services/quote-requests.service.js'

const router = express.Router()

const createQuoteRequestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .min(1),
  supplierIds: z.array(z.string().uuid()).min(1).max(25),
  note: z.string().max(2000).optional(),
  // needed_by is a DATE column — an arbitrary string reached Postgres as a 500.
  neededBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'neededBy must be an ISO date (YYYY-MM-DD)')
    .optional(),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'closed', 'cancelled', 'pending', 'responded', 'declined']).optional(),
})

// The supplier inbox filters on quote_request_suppliers.status; the restaurant-side
// values (open/closed/cancelled) never match there and silently returned nothing.
const supplierInboxQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  status: z.enum(['pending', 'responded', 'declined']).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'needed_by']).optional(),
})

const declineSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
})

const responseItemSchema = z.object({
  quoteRequestItemId: z.string().uuid(),
  isAvailable: z.boolean().optional(),
  unitPrice: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional(),
  quantity: z.number().positive().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  substituteProductId: z.string().uuid().optional().nullable(),
})

const submitResponseSchema = z.object({
  note: z.string().optional(),
  items: z.array(responseItemSchema).min(1),
})

const updateQuoteRequestStatusSchema = z.object({
  status: z.enum(['closed', 'cancelled']),
})

router.use(requireAuth, resolveTenantContext)

// Supplier routes first (more specific paths)
router.get(
  '/supplier/inbox',
  requireRole(['SUPPLIER']),
  requirePermission(P.ORDERS_VIEW),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const parsed = supplierInboxQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: `Invalid inbox filter (status must be one of ${SUPPLIER_INBOX_STATUSES.join(', ')})`,
          },
          requestId: req.requestId,
        })
      }
      const data = await listSupplierQuoteRequests(supplierId, parsed.data)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/supplier/inbox/:quoteRequestSupplierId',
  requireRole(['SUPPLIER']),
  requirePermission(P.ORDERS_VIEW),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const data = await getSupplierQuoteRequestDetail(
        supplierId,
        req.params.quoteRequestSupplierId,
        { markViewed: true }
      )
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/supplier/inbox/:quoteRequestSupplierId/decline',
  requireRole(['SUPPLIER']),
  requirePermission(P.ORDERS_MANAGE),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = declineSchema.parse(req.body ?? {})
      const data = await declineQuoteRequest({
        supplierId,
        quoteRequestSupplierId: req.params.quoteRequestSupplierId,
        reason: body.reason,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/supplier/inbox/:quoteRequestSupplierId/respond',
  requireRole(['SUPPLIER']),
  requirePermission(P.ORDERS_MANAGE),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = submitResponseSchema.parse(req.body)
      const data = await submitQuoteResponse({
        supplierId,
        userId: req.user?.id || req.userData?.id,
        quoteRequestSupplierId: req.params.quoteRequestSupplierId,
        items: body.items,
        note: body.note,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

// Restaurant routes
router.post(
  '/',
  requireRole(['RESTAURANT']),
  requirePermission(P.ORDERS_CREATE),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const body = createQuoteRequestSchema.parse(req.body)
      const data = await createQuoteRequest({
        restaurantId,
        userId: req.user?.id || req.userData?.id,
        items: body.items,
        supplierIds: body.supplierIds,
        note: body.note,
        neededBy: body.neededBy,
      })
      res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/',
  requireRole(['RESTAURANT']),
  requireAnyPermission(P.CATALOG_VIEW, P.ORDERS_CREATE, P.ORDERS_VIEW),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const params = listQuerySchema.safeParse(req.query)
      if (!params.success) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: params.error.flatten().formErrors.join('; '),
          },
          requestId: req.requestId,
        })
      }
      const restaurantStatus =
        params.data.status && ['open', 'closed', 'cancelled'].includes(params.data.status)
          ? params.data.status
          : undefined
      const data = await listRestaurantQuoteRequests(restaurantId, {
        page: params.data.page,
        limit: params.data.limit,
        status: restaurantStatus,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/:id',
  requireRole(['RESTAURANT']),
  requireAnyPermission(P.CATALOG_VIEW, P.ORDERS_CREATE, P.ORDERS_VIEW),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const data = await getQuoteRequestDetail(req.params.id, restaurantId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.patch(
  '/:id',
  requireRole(['RESTAURANT']),
  requirePermission(P.ORDERS_CREATE),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const body = updateQuoteRequestStatusSchema.parse(req.body)
      const data = await updateQuoteRequestStatus(req.params.id, restaurantId, body.status)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/:id/compare',
  requireRole(['RESTAURANT']),
  requireAnyPermission(P.CATALOG_VIEW, P.ORDERS_CREATE, P.ORDERS_VIEW),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      const data = await getQuoteRequestCompare(req.params.id, restaurantId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/:id/suppliers/:supplierRowId/to-cart',
  requireRole(['RESTAURANT']),
  requirePermission(P.ORDERS_CREATE),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Restaurant not found' },
          requestId: req.requestId,
        })
      }
      await assertRestaurantOwnsQuoteRequest(req.params.id, restaurantId)
      const data = await buildCartPayloadFromResponse({
        restaurantId,
        quoteRequestId: req.params.id,
        quoteRequestSupplierId: req.params.supplierRowId,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('Quote to-cart failed', { error: error.message })
      next(error)
    }
  }
)

export { router as quoteRequestsRoutes }
