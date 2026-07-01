import { logger } from '../../lib/logger.js'
import { sendTemplateEmail } from '../email/email.service.js'
import { buildAppUrl } from '../../lib/app-url.js'
import {
  buildNotificationEventKey,
  resolveNotificationTemplate,
} from '../email/template-resolver.js'
import { sendWhatsAppMessage as sendWhatsAppMessageService } from '../whatsapp.service.js'
import { formatReservationTime } from './templates.js'

/**
 * Email channel for notifications.
 */
const emailService = {
  async send({
    email,
    subject,
    message,
    notificationType,
    notificationCategory,
    referenceId,
    referenceType,
    metadata,
    userId,
    tenantId,
    locale,
  }) {
    if (!email) return false
    try {
      const template = resolveNotificationTemplate(notificationCategory, notificationType)
      const eventKey = buildNotificationEventKey({
        notificationCategory,
        referenceType,
        referenceId,
        userId,
        tenantId,
      })
      const emailMetadata =
        metadata && typeof metadata === 'object'
          ? {
              ...metadata,
              ctaUrl: metadata.ctaUrl ? buildAppUrl(metadata.ctaUrl) : metadata.ctaUrl,
            }
          : {}
      const result = await sendTemplateEmail({
        to: email,
        template,
        subject,
        locale,
        data: {
          title: subject,
          message,
          locale,
          ...emailMetadata,
        },
        tenantId,
        eventType: notificationCategory || notificationType || 'notification',
        eventKey,
        entityId: referenceId,
      })
      return Boolean(result.sent || result.logOnly || result.preview)
    } catch (error) {
      logger.error('Email send failed', { error: error.message })
      return false
    }
  },
}

export { emailService }

/**
 * Notify a guest about their reservation (email and/or WhatsApp based on contact provided).
 */
export async function notifyGuestReservationConfirmation(reservation, restaurantName) {
  const customerName = reservation.customer_name || reservation.customerName || 'Guest'
  const customerPhone = reservation.customer_phone || reservation.customerPhone || null
  const customerEmail = reservation.customer_email || reservation.customerEmail || null
  const partySize = reservation.party_size || reservation.partySize || 0
  const scheduledAt = reservation.scheduled_at || reservation.scheduledAt
  const status = reservation.status || 'CONFIRMED'
  const venue = restaurantName || 'the restaurant'

  if (!customerPhone && !customerEmail) {
    return { email: false, whatsapp: false }
  }

  const timeLabel = formatReservationTime(scheduledAt)
  const title =
    status === 'WAITLIST' ? `Waitlist update at ${venue}` : `Reservation confirmed at ${venue}`
  const message =
    status === 'WAITLIST'
      ? `Hi ${customerName}, you're on the waitlist at ${venue} for ${partySize} guests around ${timeLabel}. We'll message you when a table opens.`
      : `Hi ${customerName}, your table for ${partySize} at ${venue} is confirmed for ${timeLabel}. See you soon!`

  const results = { email: false, whatsapp: false }

  if (customerEmail) {
    try {
      const template = status === 'WAITLIST' ? 'reservation.waitlist' : 'reservation.confirmation'
      const result = await sendTemplateEmail({
        to: customerEmail,
        template,
        subject: title,
        data: { title, message, tenantName: venue },
        eventType: 'guest_reservation',
        eventKey: `reservation:guest:${reservation.id}:${status}`,
        entityId: reservation.id,
        skipDedup: false,
      })
      results.email = Boolean(result.sent || result.logOnly || result.preview)
    } catch (error) {
      logger.error('Guest reservation email failed', { error: error.message })
    }
  }

  if (customerPhone) {
    try {
      const waResult = await sendWhatsAppMessageService({ to: customerPhone, message })
      results.whatsapp = Boolean(waResult.sent)
    } catch (error) {
      logger.error('Guest reservation WhatsApp failed', { error: error.message })
    }
  }

  return results
}
