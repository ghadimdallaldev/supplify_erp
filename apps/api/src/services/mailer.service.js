import nodemailer from 'nodemailer'
import sgMail from '@sendgrid/mail'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'

let transporter

export function __resetMailerForTests() {
  transporter = null
}

function getSmtpTransporter() {
  if (transporter) return transporter

  const host = config.SMTP_HOST
  const port = config.SMTP_PORT
  const user = config.SMTP_USER
  const pass = config.SMTP_PASS
  const secure = config.SMTP_SECURE || port === 465

  if (!host) {
    return null
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })

  return transporter
}

export function isSendGridConfigured() {
  return Boolean(config.SENDGRID_API_KEY)
}

export function isSmtpConfigured() {
  return Boolean(config.SMTP_HOST)
}

/**
 * True when any outbound email provider is configured (Twilio SendGrid or SMTP).
 */
export function isEmailConfigured() {
  return isSendGridConfigured() || isSmtpConfigured()
}

function resolveFromAddress() {
  if (config.SENDGRID_FROM_EMAIL) {
    const name = config.SENDGRID_FROM_NAME || 'Supplify'
    return { email: config.SENDGRID_FROM_EMAIL, name }
  }
  const fallback = config.SMTP_FROM || config.SMTP_USER || 'noreply@supplify.local'
  return { email: fallback, name: 'Supplify' }
}

async function sendViaSendGrid({ to, subject, text, html }) {
  sgMail.setApiKey(config.SENDGRID_API_KEY)
  const from = resolveFromAddress()
  const msg = {
    to,
    from,
    subject,
    text: text || undefined,
    html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : undefined),
  }
  const [response] = await sgMail.send(msg)
  logger.info('Email sent via Twilio SendGrid', {
    statusCode: response?.statusCode,
    subject,
  })
  return { messageId: response?.headers?.['x-message-id'], provider: 'sendgrid' }
}

async function sendViaSmtp({ to, subject, text, html }) {
  const from = config.SMTP_FROM || config.SMTP_USER || 'noreply@supplify.local'
  const payload = {
    from,
    to,
    subject,
    text: text || undefined,
    html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : undefined),
  }

  const transport = getSmtpTransporter()
  const info = await transport.sendMail(payload)
  logger.info('Email sent via SMTP', { messageId: info.messageId, subject })
  return { messageId: info.messageId, provider: 'smtp' }
}

/**
 * Send transactional email. Prefers Twilio SendGrid when SENDGRID_API_KEY is set,
 * otherwise falls back to SMTP (nodemailer).
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) {
    throw new Error('Email recipient (to) is required')
  }

  if (isSendGridConfigured()) {
    return sendViaSendGrid({ to, subject, text, html })
  }

  const transport = getSmtpTransporter()
  if (transport) {
    return sendViaSmtp({ to, subject, text, html })
  }

  logger.info('Email (no provider configured)', {
    to: config.NODE_ENV === 'development' ? to : '[REDACTED]',
    subject,
  })
  return { accepted: [to], preview: true, provider: 'none' }
}
