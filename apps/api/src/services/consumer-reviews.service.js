import { query } from '../lib/db.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { DELIVERED_ORDER_STATUSES } from '../lib/order-statuses.js'

const EDIT_WINDOW_DAYS = 7

const CONSUMER_DELIVERED_STATUSES = DELIVERED_ORDER_STATUSES

export async function getRestaurantRatingSummary(restaurantId) {
  const { rows } = await query(
    `
    SELECT restaurant_id, review_count, avg_overall, avg_food, avg_service, avg_ambiance, updated_at
    FROM restaurant_rating_summaries
    WHERE restaurant_id = $1
    `,
    [restaurantId]
  )
  if (!rows.length) {
    return {
      restaurant_id: restaurantId,
      review_count: 0,
      avg_overall: 0,
      avg_food: null,
      avg_service: null,
      avg_ambiance: null,
    }
  }
  return rows[0]
}

export async function assertConsumerOrderEligibleForReview({ consumerOrderId, restaurantId }) {
  const { rows: orders } = await query(
    `
    SELECT id, status, restaurant_id, customer_name
    FROM consumer_order
    WHERE id = $1 AND restaurant_id = $2
    `,
    [consumerOrderId, restaurantId]
  )
  if (!orders.length) {
    throw new NotFoundError('Order not found')
  }
  const order = orders[0]
  if (!CONSUMER_DELIVERED_STATUSES.includes(order.status)) {
    throw new ValidationError('Order must be completed before leaving a review')
  }

  const { rows: existing } = await query(
    `SELECT id FROM restaurant_reviews WHERE consumer_order_id = $1`,
    [consumerOrderId]
  )
  if (existing.length) {
    throw new ValidationError('A review already exists for this order')
  }

  return order
}

export async function createRestaurantReview({
  restaurantId,
  consumerOrderId,
  reviewerUserId,
  reviewerName,
  overallRating,
  foodRating,
  serviceRating,
  ambianceRating,
  comment,
}) {
  const order = await assertConsumerOrderEligibleForReview({ consumerOrderId, restaurantId })
  const resolvedName = reviewerName ?? order.customer_name ?? null

  const { rows } = await query(
    `
    INSERT INTO restaurant_reviews (
      restaurant_id, consumer_order_id, reviewer_user_id, reviewer_name,
      overall_rating, food_rating, service_rating, ambiance_rating, comment
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      restaurantId,
      consumerOrderId,
      reviewerUserId ?? null,
      resolvedName,
      overallRating,
      foodRating ?? null,
      serviceRating ?? null,
      ambianceRating ?? null,
      comment ?? null,
    ]
  )
  return rows[0]
}

export async function getRestaurantReviewById(reviewId) {
  const { rows } = await query(`SELECT * FROM restaurant_reviews WHERE id = $1`, [reviewId])
  if (!rows.length) throw new NotFoundError('Review not found')
  return rows[0]
}

export function assertCanEditRestaurantReview(review, userId) {
  if (!userId || review.reviewer_user_id !== userId) {
    throw new ForbiddenError('You can only edit your own reviews')
  }
  const created = new Date(review.created_at)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EDIT_WINDOW_DAYS)
  if (created < cutoff) {
    throw new ValidationError(`Reviews can only be edited within ${EDIT_WINDOW_DAYS} days`)
  }
}

export async function updateRestaurantReview(reviewId, userId, patch) {
  const review = await getRestaurantReviewById(reviewId)
  assertCanEditRestaurantReview(review, userId)

  const fields = []
  const params = [reviewId]
  let i = 2

  const allowed = {
    overall_rating: patch.overallRating,
    food_rating: patch.foodRating,
    service_rating: patch.serviceRating,
    ambiance_rating: patch.ambianceRating,
    comment: patch.comment,
  }

  for (const [col, val] of Object.entries(allowed)) {
    if (val !== undefined) {
      fields.push(`${col} = $${i}`)
      params.push(val)
      i++
    }
  }

  if (!fields.length) {
    return review
  }

  fields.push('updated_at = now()')

  const { rows } = await query(
    `UPDATE restaurant_reviews SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  return rows[0]
}

export async function deleteRestaurantReview(reviewId, userId) {
  const review = await getRestaurantReviewById(reviewId)
  if (!userId || review.reviewer_user_id !== userId) {
    throw new ForbiddenError('You can only delete your own reviews')
  }
  await query(`DELETE FROM restaurant_reviews WHERE id = $1`, [reviewId])
  return { id: reviewId }
}

export async function listRestaurantReviews(restaurantId, { limit = 20, offset = 0 }) {
  const { rows } = await query(
    `
    SELECT
      rr.id,
      rr.overall_rating,
      rr.food_rating,
      rr.service_rating,
      rr.ambiance_rating,
      rr.comment,
      rr.reviewer_name,
      rr.created_at,
      rr.updated_at
    FROM restaurant_reviews rr
    WHERE rr.restaurant_id = $1
    ORDER BY rr.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [restaurantId, limit, offset]
  )

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM restaurant_reviews WHERE restaurant_id = $1`,
    [restaurantId]
  )

  return { reviews: rows, total: countRows[0]?.total ?? 0 }
}
