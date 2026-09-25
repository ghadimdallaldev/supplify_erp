/**
 * Reservation reminder (T-24h / T-2h) and post-visit review invite cron.
 */
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { sendTemplateEmail } from '../services/email/email.service.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from '../services/whatsapp.service.js'

function formatReservationTime(scheduledAt) {
  try {
    return new Date(scheduledAt).toLocaleString()
  } catch {
    return String(scheduledAt)
  }
}

async function notifyGuestReminder(reservation, restaurantName, kind) {
  const customerName = reservation.customer_name || 'Guest'
  const customerPhone = reservation.customer_phone || null
  const customerEmail = reservation.customer_email || null
  const partySize = reservation.party_size || 0
  const venue = restaurantName || 'the restaurant'
  const timeLabel = formatReservationTime(reservation.scheduled_at)
  const manageBase = process.env.PUBLIC_RESERVATION_BASE_URL || ''
  const manageUrl = reservation.public_token
    ? `${manageBase}/reserve/manage/${reservation.public_token}`
    : null

  const title =
    kind === '24h'
      ? `Reminder: reservation tomorrow at ${venue}`
      : `Reminder: reservation soon at ${venue}`
  const message =
    kind === '24h'
      ? `Hi ${customerName}, reminder that your table for ${partySize} at ${venue} is tomorrow (${timeLabel}).`
      : `Hi ${customerName}, your table for ${partySize} at ${venue} is at ${timeLabel}. See you soon!`

  const results = { email: false, whatsapp: false }
  if (customerEmail) {
    try {
      const result = await sendTemplateEmail({
        to: customerEmail,
        template: 'reservation.reminder',
        subject: title,
        data: { title, message, tenantName: venue, manageUrl },
        eventType: 'guest_reservation_reminder',
        eventKey: `reservation:reminder:${reservation.id}:${kind}`,
        entityId: reservation.id,
        skipDedup: false,
      })
      results.email = Boolean(result.sent || result.logOnly || result.preview)
    } catch (error) {
      logger.error('Reservation reminder email failed', { error: error.message })
    }
  }
  if (customerPhone) {
    try {
      const wa = await sendWhatsAppMessageService({ to: customerPhone, message })
      results.whatsapp = Boolean(wa.sent)
    } catch (error) {
      logger.error('Reservation reminder WhatsApp failed', { error: error.message })
    }
  }
  return results
}

async function notifyGuestReviewInvite(reservation, restaurantName) {
  const customerName = reservation.customer_name || 'Guest'
  const customerPhone = reservation.customer_phone || null
  const customerEmail = reservation.customer_email || null
  const venue = restaurantName || 'the restaurant'
  const manageBase = process.env.PUBLIC_RESERVATION_BASE_URL || ''
  const reviewUrl = reservation.public_token
    ? `${manageBase}/reserve/manage/${reservation.public_token}?review=1`
    : null
  if (!reviewUrl) return { email: false, whatsapp: false }

  const title = `How was your visit to ${venue}?`
  const message = `Hi ${customerName}, thanks for dining at ${venue}. Share a quick review: ${reviewUrl}`

  const results = { email: false, whatsapp: false }
  if (customerEmail) {
    try {
      const result = await sendTemplateEmail({
        to: customerEmail,
        template: 'reservation.review_invite',
        subject: title,
        data: { title, message, tenantName: venue, reviewUrl },
        eventType: 'guest_reservation_review_invite',
        eventKey: `reservation:review_invite:${reservation.id}`,
        entityId: reservation.id,
        skipDedup: false,
      })
      results.email = Boolean(result.sent || result.logOnly || result.preview)
    } catch (error) {
      logger.error('Reservation review invite email failed', { error: error.message })
    }
  }
  if (customerPhone) {
    try {
      const wa = await sendWhatsAppMessageService({ to: customerPhone, message })
      results.whatsapp = Boolean(wa.sent)
    } catch (error) {
      logger.error('Reservation review invite WhatsApp failed', { error: error.message })
    }
  }
  return results
}

/**
 * @returns {Promise<{ reminders24h: number, reminders2h: number, reviewInvites: number }>}
 */
export async function runReservationGuestCommsJob() {
  const stats = { reminders24h: 0, reminders2h: 0, reviewInvites: 0 }

  const { rows: due24h } = await query(
    `
    SELECT r.*, rest.name AS restaurant_name
    FROM reservation r
    INNER JOIN restaurant rest ON rest.id = r.restaurant_id
    WHERE r.status IN ('PENDING', 'CONFIRMED')
      AND r.reminder_24h_sent_at IS NULL
      AND r.scheduled_at > now()
      AND r.scheduled_at <= now() + interval '24 hours'
      AND r.scheduled_at > now() + interval '2 hours'
    ORDER BY r.scheduled_at ASC
    LIMIT 100
    `
  )
  for (const row of due24h) {
    const { rows: claimed } = await query(
      `
      UPDATE reservation
      SET reminder_24h_sent_at = now()
      WHERE id = $1
        AND status IN ('PENDING', 'CONFIRMED')
        AND reminder_24h_sent_at IS NULL
      RETURNING id
      `,
      [row.id]
    )
    if (!claimed.length) continue
    await notifyGuestReminder(row, row.restaurant_name, '24h')
    stats.reminders24h += 1
  }

  const { rows: due2h } = await query(
    `
    SELECT r.*, rest.name AS restaurant_name
    FROM reservation r
    INNER JOIN restaurant rest ON rest.id = r.restaurant_id
    WHERE r.status IN ('PENDING', 'CONFIRMED')
      AND r.reminder_2h_sent_at IS NULL
      AND r.scheduled_at > now()
      AND r.scheduled_at <= now() + interval '2 hours'
    ORDER BY r.scheduled_at ASC
    LIMIT 100
    `
  )
  for (const row of due2h) {
    const { rows: claimed } = await query(
      `
      UPDATE reservation
      SET reminder_2h_sent_at = now(),
          reminder_24h_sent_at = COALESCE(reminder_24h_sent_at, now())
      WHERE id = $1
        AND status IN ('PENDING', 'CONFIRMED')
        AND reminder_2h_sent_at IS NULL
      RETURNING id
      `,
      [row.id]
    )
    if (!claimed.length) continue
    await notifyGuestReminder(row, row.restaurant_name, '2h')
    stats.reminders2h += 1
  }

  const { rows: reviewDue } = await query(
    `
    SELECT r.*, rest.name AS restaurant_name
    FROM reservation r
    INNER JOIN restaurant rest ON rest.id = r.restaurant_id
    LEFT JOIN restaurant_reviews rev ON rev.reservation_id = r.id
    WHERE r.status = 'COMPLETED'
      AND r.review_invite_sent_at IS NULL
      AND r.updated_at <= now() - interval '1 hour'
      AND r.updated_at >= now() - interval '7 days'
      AND rev.id IS NULL
      AND r.public_token IS NOT NULL
    ORDER BY r.updated_at ASC
    LIMIT 100
    `
  )
  for (const row of reviewDue) {
    const { rows: claimed } = await query(
      `
      UPDATE reservation
      SET review_invite_sent_at = now()
      WHERE id = $1
        AND status = 'COMPLETED'
        AND review_invite_sent_at IS NULL
      RETURNING id
      `,
      [row.id]
    )
    if (!claimed.length) continue
    await notifyGuestReviewInvite(row, row.restaurant_name)
    stats.reviewInvites += 1
  }

  logger.info('Reservation guest comms job finished', stats)
  return stats
}
