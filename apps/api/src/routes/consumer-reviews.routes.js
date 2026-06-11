import express from 'express'
import { z } from 'zod'
import { requireAuth, resolveTenantContext } from '../lib/rbac.js'
import {
  createRestaurantReview,
  updateRestaurantReview,
  deleteRestaurantReview,
  listRestaurantReviews,
  getRestaurantRatingSummary,
} from '../services/consumer-reviews.service.js'

const router = express.Router()

const reviewBodySchema = z.object({
  consumerOrderId: z.string().uuid(),
  overallRating: z.number().int().min(1).max(5),
  foodRating: z.number().int().min(1).max(5).optional().nullable(),
  serviceRating: z.number().int().min(1).max(5).optional().nullable(),
  ambianceRating: z.number().int().min(1).max(5).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  reviewerName: z.string().max(200).optional().nullable(),
})

const reviewPatchSchema = reviewBodySchema
  .omit({ consumerOrderId: true, reviewerName: true })
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

router.get('/restaurants/:restaurantId', async (req, res, next) => {
  try {
    const { restaurantId } = req.params
    const { limit, offset } = paginationSchema.parse(req.query)
    const result = await listRestaurantReviews(restaurantId, { limit, offset })
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

router.get('/restaurants/:restaurantId/summary', async (req, res, next) => {
  try {
    const summary = await getRestaurantRatingSummary(req.params.restaurantId)
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

router.post('/restaurants/:restaurantId', async (req, res, next) => {
  try {
    const body = reviewBodySchema.parse(req.body)
    const reviewerUserId = req.userData?.id ?? null
    const review = await createRestaurantReview({
      restaurantId: req.params.restaurantId,
      consumerOrderId: body.consumerOrderId,
      reviewerUserId,
      reviewerName: body.reviewerName,
      overallRating: body.overallRating,
      foodRating: body.foodRating,
      serviceRating: body.serviceRating,
      ambianceRating: body.ambianceRating,
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

router.use(requireAuth, resolveTenantContext)

router.patch('/:id', async (req, res, next) => {
  try {
    const body = reviewPatchSchema.parse(req.body)
    const review = await updateRestaurantReview(req.params.id, req.userData.id, body)
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

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteRestaurantReview(req.params.id, req.userData.id)
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

export { router as consumerReviewsRoutes }
