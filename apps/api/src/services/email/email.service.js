import { config } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { sendMail, isEmailConfigured as isTransportConfigured } from '../mailer.service.js'
import { claimEmailDelivery, finalizeEmailDelivery } from './email-delivery-log.js'
import { renderTemplate } from './templates/registry.js'

let bootLogged = false

export function logEmailBootMode() {
  if (bootLogged) return
  bootLogged = true
  logger.info('Email service initialized', {
    enabled: config.EMAIL_ENABLED,
    logOnly: config.EMAIL_LOG_ONLY,
    provider: resolveActiveProvider(),
    configured: isTransportConfigured(),
  })
}

function resolveActiveProvider() {
  if (!config.EMAIL_ENABLED) return 'disabled'
  if (config.EMAIL_LOG_ONLY) return 'log_only'
  if (config.EMAIL_PROVIDER === 'sendgrid' || config.SENDGRID_API_KEY) return 'sendgrid'
  if (config.SMTP_HOST) return 'smtp'
  return 'none'
}

function resolveFromHeader() {
  const email =
    config.EMAIL_FROM_ADDRESS || config.EMAIL_FROM || config.SENDGRID_FROM_EMAIL || config.SMTP_FROM
  const name = config.EMAIL_FROM_NAME || config.SENDGRID_FROM_NAME || 'Supplify'
  if (email && name) return `"${name}" <${email}>`
  return email || undefined
}

function normalizeRecipients(to) {
  if (Array.isArray(to)) return to.filter(Boolean)
  return to ? [to] : []
}

function redactRecipient(email) {
  if (!email) return '[none]'
  const [local, domain] = String(email).split('@')
  return domain ? `${local?.slice(0, 2) || ''}***@${domain}` : '[redacted]'
}

/**
 * Low-level send with env gates, logging, optional idempotency.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  cc,
  bcc,
  attachments,
  replyTo,
  tenantId = null,
  eventType = 'transactional',
  eventKey = null,
  entityId = null,
  skipDedup = false,
  throwOnError = false,
}) {
  logEmailBootMode()

  const recipients = normalizeRecipients(to)
  if (!recipients.length) {
    logger.warn('Email skipped — missing recipient', { eventType, tenantId, entityId })
    return { sent: false, skipped: true, reason: 'missing_recipient' }
  }

  if (!config.EMAIL_ENABLED) {
    logger.info('Email skipped (EMAIL_ENABLED=false)', {
      eventType,
      recipients: recipients.map(redactRecipient),
      tenantId,
      entityId,
    })
    return { sent: false, skipped: true, reason: 'disabled' }
  }

  const primaryRecipient = recipients[0]
  let logId = null

  if (eventKey && !skipDedup) {
    const claim = await claimEmailDelivery({
      eventKey,
      eventType,
      recipient: primaryRecipient,
      tenantId,
      subject,
    })
    if (!claim.allowed) {
      return { sent: false, skipped: true, reason: 'duplicate', duplicate: true }
    }
    logId = claim.logId
  }

  const payload = {
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject,
    html,
    text: text || (html ? undefined : subject),
    cc,
    bcc,
    attachments,
    replyTo: replyTo || config.EMAIL_REPLY_TO || undefined,
    from: resolveFromHeader(),
  }

  if (config.EMAIL_LOG_ONLY) {
    logger.info('Email (log only)', {
      eventType,
      eventKey,
      tenantId,
      entityId,
      recipients: recipients.map(redactRecipient),
      subject,
      textPreview: (text || subject || '').slice(0, 500),
    })
    await finalizeEmailDelivery({ eventKey, logId, status: 'log_only' })
    return { sent: true, logOnly: true, provider: 'log_only' }
  }

  if (!isTransportConfigured()) {
    logger.info('Email preview (no provider configured)', {
      eventType,
      recipients: recipients.map(redactRecipient),
      subject,
      tenantId,
    })
    await finalizeEmailDelivery({ eventKey, logId, status: 'skipped', errorMessage: 'no_provider' })
    return { sent: false, preview: true, provider: 'none' }
  }

  try {
    const result = await sendMail(payload)
    logger.info('Email sent', {
      eventType,
      eventKey,
      tenantId,
      entityId,
      recipient: redactRecipient(primaryRecipient),
      status: 'sent',
      provider: result.provider,
    })
    await finalizeEmailDelivery({ eventKey, logId, status: 'sent' })
    return { sent: true, ...result }
  } catch (error) {
    logger.error('Email send failed', {
      eventType,
      eventKey,
      tenantId,
      entityId,
      recipient: redactRecipient(primaryRecipient),
      status: 'failed',
      reason: error.message,
    })
    await finalizeEmailDelivery({
      eventKey,
      logId,
      status: 'failed',
      errorMessage: error.message,
    })
    if (throwOnError) throw error
    return { sent: false, error: error.message }
  }
}

/**
 * Render a named template and send.
 */
export async function sendTemplateEmail({
  to,
  template,
  subject,
  data = {},
  cc,
  bcc,
  attachments,
  replyTo,
  tenantId = null,
  eventType = template || 'template',
  eventKey = null,
  entityId = null,
  skipDedup = false,
  throwOnError = false,
}) {
  const rendered = renderTemplate(template, { ...data, subject })
  return sendEmail({
    to,
    subject: subject || rendered.subject,
    html: rendered.html,
    text: rendered.text,
    cc,
    bcc,
    attachments,
    replyTo,
    tenantId,
    eventType,
    eventKey,
    entityId,
    skipDedup,
    throwOnError,
  })
}

/** Queue-ready wrapper — inline today. */
export function queueEmail(options) {
  return sendEmail(options).catch((err) => {
    logger.error('queueEmail failed', { error: err.message, eventType: options.eventType })
    return { sent: false, error: err.message }
  })
}

export function isEmailEnabled() {
  return config.EMAIL_ENABLED
}

export { isTransportConfigured as isEmailConfigured }
