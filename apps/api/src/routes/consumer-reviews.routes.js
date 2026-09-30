import express from 'express'
import { z } from 'zod'
import { requireAuth, resolveTenantContext } from '../lib/rbac.js'
import { optionalAuthConsumer } from '../middlewares/consumerAuth.js'
import { query } from '../lib/db.js'
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
  // M14: receipt_token allows anonymous reviewers to prove order ownership.
  receiptToken: z.string().min(1).max(200).optional().nullable(),
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

router.post('/restaurants/:restaurantId', optionalAuthConsumer, async (req, res, next) => {
  try {
    const body = reviewBodySchema.parse(req.body)
    const reviewerUserId = req.userData?.id ?? null
    const consumerMemberId = req.consumerMember?.id ?? null

    // M14: Require either an authenticated consumer session or a valid receipt_token.
    // This prevents arbitrary users from submitting reviews for orders they didn't place.
    if (!reviewerUserId && !consumerMemberId && !body.receiptToken) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'A consumer session or receipt_token is required to submit a review',
        },
        requestId: req.requestId,
      })
    }

    // If receipt_token provided, verify it belongs to the claimed consumerOrderId.
    if (body.receiptToken) {
      const { rows: tokenRows } = await query(
        `SELECT id FROM consumer_order WHERE id = $1 AND receipt_token = $2 LIMIT 1`,
        [body.consumerOrderId, body.receiptToken]
      )
      if (!tokenRows.length) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'receipt_token does not match the order' },
          requestId: req.requestId,
        })
      }
    }

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
