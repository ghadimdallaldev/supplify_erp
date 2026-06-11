import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { config } from '../config/env.js'
import { sendTemplateEmail } from './email/email.service.js'
import { sendWhatsAppMessage } from './whatsapp.service.js'
import {
  getRestaurantSlotAvailability,
  assertSlotBookable,
} from '../lib/reservation-availability.js'

const OFFER_DURATION_HOURS = 2

function buildOfferBaseUrl() {
  const base = process.env.PUBLIC_RESERVATION_BASE_URL || config.WEB_ORIGIN || ''
  return base.replace(/\/$/, '')
}

export function buildWaitlistOfferUrls(offerToken) {
  const base = buildOfferBaseUrl()
  const path = `/reserve/waitlist/${offerToken}`
  return {
    acceptUrl: `${base}${path}/accept`,
    declineUrl: `${base}${path}/decline`,
  }
}

export function buildReservationManageUrl(publicToken) {
  const base = buildOfferBaseUrl()
  return `${base}/reserve/manage/${publicToken}`
}

async function fetchRestaurantName(restaurantId) {
  const { rows } = await query('SELECT name FROM restaurant WHERE id = $1', [restaurantId])
  return rows[0]?.name || 'the restaurant'
}

export async function notifyGuestWaitlistOffer(waitlistEntry, restaurantName) {
  const customerName = waitlistEntry.customer_name || 'Guest'
  const customerPhone = waitlistEntry.customer_phone || null
  const customerEmail = waitlistEntry.customer_email || null
  const partySize = waitlistEntry.party_size || 0
  const venue = restaurantName || 'the restaurant'
  const { acceptUrl, declineUrl } = buildWaitlistOfferUrls(waitlistEntry.offer_token)

  const expiresAt = waitlistEntry.offer_expires_at
    ? new Date(waitlistEntry.offer_expires_at).toLocaleString()
    : 'soon'

  const message = `Hi ${customerName}, a table for ${partySize} at ${venue} is available! Accept within 2 hours: ${acceptUrl} — or decline: ${declineUrl} (offer expires ${expiresAt}).`
  const title = `Table available at ${venue}`

  const results = { email: false, whatsapp: false }

  if (customerEmail) {
    try {
      const result = await sendTemplateEmail({
        to: customerEmail,
        template: 'reservation.waitlist_offer',
        subject: title,
        data: { message, title, tenantName: venue, ctaUrl: acceptUrl, ctaLabel: 'Accept table' },
        eventType: 'reservation.waitlist_offer',
        eventKey: `waitlist:offer:${waitlistEntry.id}:${waitlistEntry.offer_token}`,
        entityId: waitlistEntry.id,
      })
      results.email = Boolean(result.sent || result.logOnly || result.preview)
    } catch (error) {
      logger.error('Waitlist offer email failed', { error: error.message })
    }
  }

  if (customerPhone) {
    try {
      const waResult = await sendWhatsAppMessage({ to: customerPhone, message })
      results.whatsapp = Boolean(waResult.sent)
    } catch (error) {
      logger.error('Waitlist offer WhatsApp failed', { error: error.message })
    }
  }

  return results
}

function isEligibleForOffer(row) {
  if (!row || row.status !== 'WAITING') return false
  const offerStatus = row.offer_status || 'none'
  return ['none', 'expired', 'declined'].includes(offerStatus)
}

async function isWaitlistAutoPromoEnabled(restaurantId) {
  if (!restaurantId) return false
  return isFeatureEnabled(restaurantId, 'RESTAURANT', 'waitlist_auto_promo')
}

async function offerNextWaitlistEntryIfEnabled(args) {
  if (!(await isWaitlistAutoPromoEnabled(args.restaurantId))) {
    return null
  }
  return offerNextWaitlistEntry(args)
}

/**
 * Offer the next waitlist entry for a restaurant/party size (position ASC).
 */
export async function offerNextWaitlistEntry({ restaurantId, partySize, branchId = null }) {
  return withTransaction(async (client) => {
    const params = [restaurantId, partySize]
    let branchFilter = ''
    if (branchId) {
      branchFilter = 'AND (branch_id = $3 OR branch_id IS NULL)'
      params.push(branchId)
    }

    const { rows: candidates } = await client.query(
      `
        SELECT *
        FROM reservation_waitlist
        WHERE restaurant_id = $1
          AND party_size = $2
          AND status = 'WAITING'
          AND COALESCE(offer_status, 'none') IN ('none', 'expired', 'declined')
          ${branchFilter}
        ORDER BY position ASC NULLS LAST, requested_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `,
      params
    )

    const next = candidates[0]
    if (!next) {
      return null
    }

    const { rows } = await client.query(
      `
        UPDATE reservation_waitlist
        SET status = 'NOTIFIED',
            offer_status = 'offered',
            notified_at = now(),
            offer_expires_at = now() + make_interval(hours => $2::int),
            offer_token = gen_random_uuid()
        WHERE id = $1
        RETURNING *
      `,
      [next.id, OFFER_DURATION_HOURS]
    )

    const offered = rows[0]
    const restaurantName = await fetchRestaurantName(restaurantId)
    await notifyGuestWaitlistOffer(offered, restaurantName)

    logger.info('Waitlist offer sent', {
      waitlistId: offered.id,
      restaurantId,
      partySize,
      expiresAt: offered.offer_expires_at,
    })

    return offered
  })
}

/**
 * When a reservation is cancelled, record cancellation and promote the waitlist.
 */
export async function handleReservationCancelled(reservation, { cancellationReason = null } = {}) {
  const restaurantId = reservation.restaurant_id
  const partySize = reservation.party_size
  const branchId = reservation.branch_id || null

  if (!restaurantId || !partySize) {
    return null
  }

  await query(
    `
      UPDATE reservation
      SET cancelled_at = COALESCE(cancelled_at, now()),
          cancellation_reason = COALESCE($2, cancellation_reason)
      WHERE id = $1
    `,
    [reservation.id, cancellationReason]
  )

  return offerNextWaitlistEntryIfEnabled({ restaurantId, partySize, branchId })
}

export async function manuallyPromoteWaitlistEntry(waitlistId, restaurantId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
        SELECT *
        FROM reservation_waitlist
        WHERE id = $1 AND restaurant_id = $2
        FOR UPDATE
      `,
      [waitlistId, restaurantId]
    )

    const entry = rows[0]
    if (!entry) {
      throw new Error('Waitlist entry not found')
    }
    if (!isEligibleForOffer(entry)) {
      throw new Error('Waitlist entry is not eligible for promotion')
    }

    const { rows: updated } = await client.query(
      `
        UPDATE reservation_waitlist
        SET status = 'NOTIFIED',
            offer_status = 'offered',
            notified_at = now(),
            offer_expires_at = now() + make_interval(hours => $2::int),
            offer_token = gen_random_uuid()
        WHERE id = $1
        RETURNING *
      `,
      [waitlistId, OFFER_DURATION_HOURS]
    )

    const offered = updated[0]
    const restaurantName = await fetchRestaurantName(restaurantId)
    await notifyGuestWaitlistOffer(offered, restaurantName)
    return offered
  })
}

async function fetchOfferByToken(token, client = null) {
  const run = client ? client.query.bind(client) : query
  const { rows } = await run(
    `
      SELECT *
      FROM reservation_waitlist
      WHERE offer_token = $1
      FOR UPDATE
    `,
    [token]
  )
  return rows[0] ?? null
}

function assertActiveOffer(entry) {
  if (!entry) {
    throw new Error('Waitlist offer not found')
  }
  if (entry.offer_status !== 'offered') {
    throw new Error('This waitlist offer is no longer active')
  }
  if (entry.offer_expires_at && new Date(entry.offer_expires_at) <= new Date()) {
    throw new Error('This waitlist offer has expired')
  }
}

export async function acceptWaitlistOffer(token) {
  return withTransaction(async (client) => {
    const entry = await fetchOfferByToken(token, client)
    assertActiveOffer(entry)

    const scheduledAt = entry.preferred_time || new Date().toISOString()

    const { rows: ohRows } = await client.query(
      `SELECT operating_hours FROM restaurant WHERE id = $1`,
      [entry.restaurant_id]
    )
    const availability = await getRestaurantSlotAvailability(client.query.bind(client), {
      restaurantId: entry.restaurant_id,
      dateInput: scheduledAt,
      partySize: entry.party_size,
      operatingHours: ohRows[0]?.operating_hours,
    })
    assertSlotBookable(availability, scheduledAt, entry.party_size)

    const { rows: reservationRows } = await client.query(
      `
        INSERT INTO reservation (
          restaurant_id,
          branch_id,
          tables,
          status,
          customer_name,
          customer_phone,
          customer_email,
          party_size,
          scheduled_at,
          duration_minutes,
          notes,
          waitlist,
          auto_confirmed,
          public_token,
          public_token_expires_at
        )
        VALUES ($1, $2, '{}', 'CONFIRMED', $3, $4, $5, $6, $7, 90, $8, false, true, gen_random_uuid(), now() + interval '180 days')
        RETURNING *
      `,
      [
        entry.restaurant_id,
        entry.branch_id,
        entry.customer_name,
        entry.customer_phone,
        entry.customer_email,
        entry.party_size,
        scheduledAt,
        entry.notes,
      ]
    )

    const reservation = reservationRows[0]

    const { rows: waitlistRows } = await client.query(
      `
        UPDATE reservation_waitlist
        SET status = 'SEATED',
            offer_status = 'accepted',
            offer_expires_at = NULL
        WHERE id = $1
        RETURNING *
      `,
      [entry.id]
    )

    const manageToken = reservation.public_token
    return {
      reservation,
      waitlist: waitlistRows[0],
      manageToken,
      manageUrl: buildReservationManageUrl(manageToken),
    }
  })
}

export async function declineWaitlistOffer(token) {
  const declined = await withTransaction(async (client) => {
    const entry = await fetchOfferByToken(token, client)
    assertActiveOffer(entry)

    const { rows } = await client.query(
      `
        UPDATE reservation_waitlist
        SET status = 'WAITING',
            offer_status = 'declined',
            offer_token = NULL,
            offer_expires_at = NULL,
            notified_at = NULL
        WHERE id = $1
        RETURNING *
      `,
      [entry.id]
    )

    return {
      declined: rows[0],
      restaurantId: entry.restaurant_id,
      partySize: entry.party_size,
      branchId: entry.branch_id,
    }
  })

  await offerNextWaitlistEntryIfEnabled({
    restaurantId: declined.restaurantId,
    partySize: declined.partySize,
    branchId: declined.branchId,
  })

  return declined.declined
}

export async function expireWaitlistOffer(entry, client) {
  await client.query(
    `
      UPDATE reservation_waitlist
      SET status = 'WAITING',
          offer_status = 'expired',
          offer_token = NULL,
          offer_expires_at = NULL,
          notified_at = NULL
      WHERE id = $1
    `,
    [entry.id]
  )
}

/**
 * Expire stale offers and attempt to promote the next guest in queue.
 */
export async function checkExpiredWaitlistOffers() {
  const { rows: expired } = await query(
    `
      SELECT *
      FROM reservation_waitlist
      WHERE offer_status = 'offered'
        AND offer_expires_at IS NOT NULL
        AND offer_expires_at < now()
    `
  )

  logger.info('Waitlist expired-offers job', { count: expired.length })

  let promoted = 0
  for (const entry of expired) {
    try {
      await withTransaction(async (client) => {
        await expireWaitlistOffer(entry, client)
      })
      const next = await offerNextWaitlistEntryIfEnabled({
        restaurantId: entry.restaurant_id,
        partySize: entry.party_size,
        branchId: entry.branch_id,
      })
      if (next) promoted++
    } catch (err) {
      logger.error('Failed to expire waitlist offer', {
        waitlistId: entry.id,
        error: err.message,
      })
    }
  }

  return { expired: expired.length, promoted }
}

export async function assignWaitlistPosition(client, restaurantId) {
  const { rows } = await client.query(
    `
      SELECT COALESCE(MAX(position), 0) + 1 AS next_position
      FROM reservation_waitlist
      WHERE restaurant_id = $1
        AND status IN ('WAITING', 'NOTIFIED')
    `,
    [restaurantId]
  )
  return Number(rows[0]?.next_position || 1)
}
