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
  buildCartPayloadFromResponse,
  assertRestaurantOwnsQuoteRequest,
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
  supplierIds: z.array(z.string().uuid()).min(1),
  note: z.string().optional(),
  neededBy: z.string().optional(),
})

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'closed', 'cancelled', 'pending', 'responded', 'declined']).optional(),
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

router.use(requireAuth, resolveTenantContext)

// Supplier routes first (more specific paths)
router.get('/supplier/inbox', requireRole(['SUPPLIER']), async (req, res, next) => {
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
    const params = listQuerySchema.parse(req.query)
    const data = await listSupplierQuoteRequests(supplierId, params)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    next(error)
  }
})

router.get(
  '/supplier/inbox/:quoteRequestSupplierId',
  requireRole(['SUPPLIER']),
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
        req.params.quoteRequestSupplierId
      )
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/supplier/inbox/:quoteRequestSupplierId/respond',
  requireRole(['SUPPLIER']),
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
      const params = listQuerySchema.parse(req.query)
      const restaurantStatus =
        params.status && ['open', 'closed', 'cancelled'].includes(params.status)
          ? params.status
          : undefined
      const data = await listRestaurantQuoteRequests(restaurantId, {
        page: params.page,
        limit: params.limit,
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
