import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  createSupplierReview,
  updateSupplierReview,
  deleteSupplierReview,
  listSupplierReviews,
  listMyReviews,
  getSupplierRatingSummary,
} from '../services/reviews.service.js'

const router = express.Router()

const reviewBodySchema = z.object({
  orderId: z.string().uuid(),
  overallRating: z.number().int().min(1).max(5),
  qualityRating: z.number().int().min(1).max(5).optional().nullable(),
  deliveryRating: z.number().int().min(1).max(5).optional().nullable(),
  valueRating: z.number().int().min(1).max(5).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
})

const reviewPatchSchema = reviewBodySchema
  .omit({ orderId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' })

const paginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
})

async function getRestaurantId(req) {
  if (req.tenantContext?.tenantType === 'RESTAURANT' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Restaurant not found')
  return rows[0].id
}

// Public routes (no auth)
router.get('/suppliers/:supplierId', async (req, res, next) => {
  try {
    const { supplierId } = req.params
    const { limit, offset } = paginationSchema.parse(req.query)
    const result = await listSupplierReviews(supplierId, { limit, offset })
    res.json({
      ok: true,
      data: { reviews: result.reviews },
      meta: { total: result.total, limit, offset },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/suppliers/:supplierId/summary', async (req, res, next) => {
  try {
    const summary = await getSupplierRatingSummary(req.params.supplierId)
    res.json({
      ok: true,
      data: { summary },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

// Authenticated restaurant routes
router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT', 'ADMIN']))

const reviewsWriteGate = requireFeature(
  'supplier_reviews',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.get('/my', async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const { limit, offset } = paginationSchema.parse(req.query)
    const reviews = await listMyReviews(restaurantId, { limit, offset })
    res.json({
      ok: true,
      data: { reviews },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/suppliers/:supplierId', reviewsWriteGate, async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const body = reviewBodySchema.parse(req.body)
    const review = await createSupplierReview({
      supplierId: req.params.supplierId,
      restaurantId,
      reviewerUserId: req.userData.id,
      orderId: body.orderId,
      overallRating: body.overallRating,
      qualityRating: body.qualityRating,
      deliveryRating: body.deliveryRating,
      valueRating: body.valueRating,
      comment: body.comment,
    })
    res.status(201).json({
      ok: true,
      data: { review },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', reviewsWriteGate, async (req, res, next) => {
  try {
    const body = reviewPatchSchema.parse(req.body)
    const review = await updateSupplierReview(req.params.id, req.userData.id, body)
    res.json({
      ok: true,
      data: { review },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', reviewsWriteGate, async (req, res, next) => {
  try {
    const result = await deleteSupplierReview(req.params.id, req.userData.id)
    res.json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

export { router as reviewsRoutes }
