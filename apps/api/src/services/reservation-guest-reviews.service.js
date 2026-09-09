/**
 * Reservation guest CRM-lite + post-visit reviews linked to restaurant_reviews.
 */
import { query } from '../lib/db.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'

const EDIT_WINDOW_DAYS = 7

export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null
  const digits = phone.replace(/\D+/g, '')
  return digits || null
}

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return trimmed || null
}

/**
 * Find or create a reservation_guest for this restaurant contact.
 * @param {import('pg').PoolClient | { query: Function }} db
 */
export async function upsertReservationGuest(
  db,
  { restaurantId, displayName, phone, email, allergies, notes, isVip }
) {
  const phoneNormalized = normalizePhone(phone)
  const emailNormalized = normalizeEmail(email)
  if (!phoneNormalized && !emailNormalized) {
    return null
  }

  let existing = null
  if (phoneNormalized) {
    const { rows } = await db.query(
      `SELECT * FROM reservation_guest WHERE restaurant_id = $1 AND phone_normalized = $2 LIMIT 1`,
      [restaurantId, phoneNormalized]
    )
    existing = rows[0] || null
  }
  if (!existing && emailNormalized) {
    const { rows } = await db.query(
      `SELECT * FROM reservation_guest WHERE restaurant_id = $1 AND email_normalized = $2 LIMIT 1`,
      [restaurantId, emailNormalized]
    )
    existing = rows[0] || null
  }

  if (existing) {
    const { rows } = await db.query(
      `
      UPDATE reservation_guest
      SET display_name = COALESCE(NULLIF($2, ''), display_name),
          phone = COALESCE($3, phone),
          email = COALESCE($4, email),
          phone_normalized = COALESCE($5, phone_normalized),
          email_normalized = COALESCE($6, email_normalized),
          allergies = COALESCE($7, allergies),
          notes = COALESCE($8, notes),
          is_vip = COALESCE($9, is_vip),
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        existing.id,
        displayName || null,
        phone || null,
        email || null,
        phoneNormalized,
        emailNormalized,
        allergies ?? null,
        notes ?? null,
        typeof isVip === 'boolean' ? isVip : null,
      ]
    )
    return rows[0]
  }

  const { rows } = await db.query(
    `
    INSERT INTO reservation_guest (
      restaurant_id, display_name, phone, email, phone_normalized, email_normalized,
      allergies, notes, is_vip
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      restaurantId,
      displayName || 'Guest',
      phone || null,
      email || null,
      phoneNormalized,
      emailNormalized,
      allergies ?? null,
      notes ?? null,
      Boolean(isVip),
    ]
  )
  return rows[0]
}

export async function recordGuestVisit(db, guestId, { noShow = false } = {}) {
  if (!guestId) return
  if (noShow) {
    await db.query(
      `
      UPDATE reservation_guest
      SET no_show_count = no_show_count + 1,
          updated_at = now()
      WHERE id = $1
      `,
      [guestId]
    )
    return
  }
  await db.query(
    `
    UPDATE reservation_guest
    SET visit_count = visit_count + 1,
        last_visit_at = now(),
        updated_at = now()
    WHERE id = $1
    `,
    [guestId]
  )
}

export async function assertReservationEligibleForReview({ reservationId, restaurantId }) {
  const { rows } = await query(
    `
    SELECT id, status, restaurant_id, customer_name, customer_email, public_token
    FROM reservation
    WHERE id = $1 AND restaurant_id = $2
    `,
    [reservationId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Reservation not found')
  const reservation = rows[0]
  if (reservation.status !== 'COMPLETED') {
    throw new ValidationError('Reservation must be completed before leaving a review')
  }
  const { rows: existing } = await query(
    `SELECT id FROM restaurant_reviews WHERE reservation_id = $1`,
    [reservationId]
  )
  if (existing.length) {
    throw new ValidationError('A review already exists for this reservation')
  }
  return reservation
}

export async function createReservationReview({
  restaurantId,
  reservationId,
  reviewerUserId,
  reviewerName,
  overallRating,
  foodRating,
  serviceRating,
  ambianceRating,
  comment,
}) {
  const reservation = await assertReservationEligibleForReview({ reservationId, restaurantId })
  const resolvedName = reviewerName ?? reservation.customer_name ?? null

  const { rows } = await query(
    `
    INSERT INTO restaurant_reviews (
      restaurant_id, reservation_id, reviewer_user_id, reviewer_name,
      overall_rating, food_rating, service_rating, ambiance_rating, comment
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      restaurantId,
      reservationId,
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

export async function createReservationReviewByToken({
  token,
  overallRating,
  foodRating,
  serviceRating,
  ambianceRating,
  comment,
  reviewerName,
}) {
  const { rows } = await query(
    `
    SELECT *
    FROM reservation
    WHERE public_token = $1
      AND (public_token_expires_at IS NULL OR public_token_expires_at > now())
    LIMIT 1
    `,
    [token]
  )
  if (!rows.length) throw new NotFoundError('Reservation not found')
  const reservation = rows[0]
  return createReservationReview({
    restaurantId: reservation.restaurant_id,
    reservationId: reservation.id,
    reviewerName: reviewerName ?? reservation.customer_name,
    overallRating,
    foodRating,
    serviceRating,
    ambianceRating,
    comment,
  })
}

export async function getReservationReviewByToken(token) {
  const { rows } = await query(
    `
    SELECT r.*, rev.id AS review_id, rev.overall_rating, rev.food_rating, rev.service_rating,
           rev.ambiance_rating, rev.comment AS review_comment, rev.staff_reply,
           rev.created_at AS review_created_at
    FROM reservation r
    LEFT JOIN restaurant_reviews rev ON rev.reservation_id = r.id
    WHERE r.public_token = $1
      AND (r.public_token_expires_at IS NULL OR r.public_token_expires_at > now())
    LIMIT 1
    `,
    [token]
  )
  if (!rows.length) throw new NotFoundError('Reservation not found')
  return rows[0]
}

export async function listRestaurantReservationReviews(
  restaurantId,
  { limit = 50, offset = 0 } = {}
) {
  const { rows } = await query(
    `
    SELECT rev.*, r.scheduled_at, r.party_size, r.customer_name, r.booking_source
    FROM restaurant_reviews rev
    INNER JOIN reservation r ON r.id = rev.reservation_id
    WHERE rev.restaurant_id = $1 AND rev.reservation_id IS NOT NULL
    ORDER BY rev.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [restaurantId, limit, offset]
  )
  return rows
}

export async function replyToReservationReview({ reviewId, restaurantId, userId, reply }) {
  const { rows } = await query(
    `SELECT * FROM restaurant_reviews WHERE id = $1 AND restaurant_id = $2 AND reservation_id IS NOT NULL`,
    [reviewId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Review not found')
  if (!reply || !String(reply).trim()) throw new ValidationError('Reply is required')

  const { rows: updated } = await query(
    `
    UPDATE restaurant_reviews
    SET staff_reply = $2,
        staff_replied_at = now(),
        staff_replied_by = $3,
        updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [reviewId, String(reply).trim(), userId]
  )
  return updated[0]
}

export function assertCanEditReservationReview(review, userId) {
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
