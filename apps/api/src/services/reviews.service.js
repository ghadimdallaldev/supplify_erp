import { query } from '../lib/db.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { notifyTenantUsers } from './notification.service.js'

import { DELIVERED_ORDER_STATUSES } from '../lib/order-statuses.js'

export { DELIVERED_ORDER_STATUSES }

const EDIT_WINDOW_DAYS = 7

export async function recalculateSupplierRatingSummary(supplierId) {
  await query('SELECT refresh_supplier_rating_summary($1)', [supplierId])
}

export async function getSupplierRatingSummary(supplierId) {
  const { rows } = await query(
    `
    SELECT supplier_id, review_count, avg_overall, avg_quality, avg_delivery, avg_value, updated_at
    FROM supplier_rating_summaries
    WHERE supplier_id = $1
    `,
    [supplierId]
  )
  if (!rows.length) {
    return {
      supplier_id: supplierId,
      review_count: 0,
      avg_overall: 0,
      avg_quality: null,
      avg_delivery: null,
      avg_value: null,
    }
  }
  return rows[0]
}

export async function getRecentReviewsForSupplier(supplierId, limit = 3) {
  const { rows } = await query(
    `
    SELECT
      sr.id,
      sr.overall_rating,
      sr.quality_rating,
      sr.delivery_rating,
      sr.value_rating,
      sr.comment,
      sr.created_at,
      r.name AS restaurant_name
    FROM supplier_reviews sr
    JOIN restaurant r ON r.id = sr.restaurant_id
    WHERE sr.supplier_id = $1
    ORDER BY sr.created_at DESC
    LIMIT $2
    `,
    [supplierId, limit]
  )
  return rows
}

export async function assertOrderEligibleForReview({ orderId, supplierId, restaurantId }) {
  const { rows: orders } = await query(
    `
    SELECT co.id, co.status, co.restaurant_id
    FROM customer_order co
    WHERE co.id = $1 AND co.restaurant_id = $2
    `,
    [orderId, restaurantId]
  )
  if (!orders.length) {
    throw new NotFoundError('Order not found')
  }
  const order = orders[0]
  if (!DELIVERED_ORDER_STATUSES.includes(order.status)) {
    throw new ValidationError('Order must be delivered before leaving a review')
  }

  const { rows: supplierItems } = await query(
    `SELECT 1 FROM order_item WHERE order_id = $1 AND supplier_id = $2 LIMIT 1`,
    [orderId, supplierId]
  )
  if (!supplierItems.length) {
    throw new ValidationError('Order does not include items from this supplier')
  }

  const { rows: existing } = await query(`SELECT id FROM supplier_reviews WHERE order_id = $1`, [
    orderId,
  ])
  if (existing.length) {
    throw new ValidationError('A review already exists for this order')
  }

  return order
}

export async function createSupplierReview({
  supplierId,
  restaurantId,
  reviewerUserId,
  orderId,
  overallRating,
  qualityRating,
  deliveryRating,
  valueRating,
  comment,
}) {
  await assertOrderEligibleForReview({ orderId, supplierId, restaurantId })

  const { rows } = await query(
    `
    INSERT INTO supplier_reviews (
      supplier_id, restaurant_id, order_id, reviewer_user_id,
      overall_rating, quality_rating, delivery_rating, value_rating, comment
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      supplierId,
      restaurantId,
      orderId,
      reviewerUserId,
      overallRating,
      qualityRating ?? null,
      deliveryRating ?? null,
      valueRating ?? null,
      comment ?? null,
    ]
  )
  return rows[0]
}

export async function getReviewById(reviewId) {
  const { rows } = await query(`SELECT * FROM supplier_reviews WHERE id = $1`, [reviewId])
  if (!rows.length) throw new NotFoundError('Review not found')
  return rows[0]
}

export function assertCanEditReview(review, userId) {
  if (review.reviewer_user_id !== userId) {
    throw new ForbiddenError('You can only edit your own reviews')
  }
  const created = new Date(review.created_at)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EDIT_WINDOW_DAYS)
  if (created < cutoff) {
    throw new ValidationError(`Reviews can only be edited within ${EDIT_WINDOW_DAYS} days`)
  }
}

export async function updateSupplierReview(reviewId, userId, patch) {
  const review = await getReviewById(reviewId)
  assertCanEditReview(review, userId)

  const fields = []
  const params = [reviewId]
  let i = 2

  const allowed = {
    overall_rating: patch.overallRating,
    quality_rating: patch.qualityRating,
    delivery_rating: patch.deliveryRating,
    value_rating: patch.valueRating,
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
    `UPDATE supplier_reviews SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  return rows[0]
}

export async function deleteSupplierReview(reviewId, userId) {
  const review = await getReviewById(reviewId)
  if (review.reviewer_user_id !== userId) {
    throw new ForbiddenError('You can only delete your own reviews')
  }
  await query(`DELETE FROM supplier_reviews WHERE id = $1`, [reviewId])
  return { id: reviewId }
}

export async function listSupplierReviews(supplierId, { limit = 20, offset = 0 }) {
  const { rows } = await query(
    `
    SELECT
      sr.id,
      sr.overall_rating,
      sr.quality_rating,
      sr.delivery_rating,
      sr.value_rating,
      sr.comment,
      sr.created_at,
      sr.updated_at,
      r.name AS restaurant_name
    FROM supplier_reviews sr
    JOIN restaurant r ON r.id = sr.restaurant_id
    WHERE sr.supplier_id = $1
    ORDER BY sr.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [supplierId, limit, offset]
  )

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM supplier_reviews WHERE supplier_id = $1`,
    [supplierId]
  )

  return { reviews: rows, total: countRows[0]?.total ?? 0 }
}

export async function listMyReviews(restaurantId, { limit = 50, offset = 0 }) {
  const { rows } = await query(
    `
    SELECT
      sr.*,
      s.name AS supplier_name,
      co.status AS order_status
    FROM supplier_reviews sr
    JOIN supplier s ON s.id = sr.supplier_id
    JOIN customer_order co ON co.id = sr.order_id
    WHERE sr.restaurant_id = $1
    ORDER BY sr.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [restaurantId, limit, offset]
  )
  return rows
}

/**
 * After receiving, prompt restaurant to review if order is delivered and no review exists.
 */
export async function notifyLeaveReviewIfEligible({ orderId, supplierId, restaurantId }) {
  const { isFeatureEnabled } = await import('../lib/subscription.js')
  if (!(await isFeatureEnabled(restaurantId, 'RESTAURANT', 'supplier_reviews'))) {
    return null
  }

  const { rows: orders } = await query(
    `SELECT id, status FROM customer_order WHERE id = $1 AND restaurant_id = $2`,
    [orderId, restaurantId]
  )
  if (!orders.length || !DELIVERED_ORDER_STATUSES.includes(orders[0].status)) {
    return null
  }

  const { rows: existing } = await query(`SELECT id FROM supplier_reviews WHERE order_id = $1`, [
    orderId,
  ])
  if (existing.length) return null

  const { rows: suppliers } = await query(`SELECT name FROM supplier WHERE id = $1`, [supplierId])
  const supplierName = suppliers[0]?.name || 'your supplier'

  const sent = await notifyTenantUsers({
    tenantId: restaurantId,
    tenantType: 'RESTAURANT',
    notificationType: 'SYSTEM',
    notificationCategory: 'system_updates',
    title: 'How was your delivery?',
    message: `Leave a review for ${supplierName} on your recent order.`,
    referenceId: orderId,
    referenceType: 'ORDER',
    metadata: {
      orderId,
      supplierId,
      action: 'leave_review',
      link: `/app/orders/${orderId}?review=1`,
    },
  })
  return sent[0] || null
}
