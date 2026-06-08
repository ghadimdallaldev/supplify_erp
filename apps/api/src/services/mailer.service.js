import nodemailer from 'nodemailer'
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

export function isSmtpConfigured() {
  return Boolean(config.SMTP_HOST)
}

export function isEmailConfigured() {
  if (!config.EMAIL_ENABLED) return false
  if (config.EMAIL_LOG_ONLY) return true
  return isSmtpConfigured()
}

function resolveFromAddress() {
  const email =
    config.EMAIL_FROM_ADDRESS ||
    config.EMAIL_FROM ||
    config.SMTP_FROM ||
    config.SMTP_USER ||
    'noreply@supplify.local'
  const name = config.EMAIL_FROM_NAME || 'Supplify'
  return { email, name }
}

function formatFrom(fromOverride) {
  if (fromOverride) return fromOverride
  const { email, name } = resolveFromAddress()
  return { email, name }
}

function buildPayload({ to, subject, text, html, cc, bcc, attachments, replyTo, from }) {
  return {
    to,
    subject,
    text: text || undefined,
    html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : undefined),
    cc: cc || undefined,
    bcc: bcc || undefined,
    attachments: attachments || undefined,
    replyTo: replyTo || config.EMAIL_REPLY_TO || undefined,
    from,
  }
}

async function sendViaSmtp(payload) {
  const fromAddr = formatFrom(payload.from)
  const from =
    typeof fromAddr === 'string'
      ? fromAddr
      : fromAddr.name
        ? `"${fromAddr.name}" <${fromAddr.email}>`
        : fromAddr.email

  const mailPayload = { ...payload, from }
  const transport = getSmtpTransporter()
  const info = await transport.sendMail(mailPayload)
  logger.info('Email sent via SMTP', { messageId: info.messageId, subject: payload.subject })
  return { messageId: info.messageId, provider: 'smtp' }
}

/**
 * Send transactional email via SMTP (nodemailer).
 */
export async function sendMail({ to, subject, text, html, cc, bcc, attachments, replyTo, from }) {
  if (!to) {
    throw new Error('Email recipient (to) is required')
  }

  const basePayload = buildPayload({ to, subject, text, html, cc, bcc, attachments, replyTo, from })

  const transport = getSmtpTransporter()
  if (transport) {
    return sendViaSmtp(basePayload)
  }

  logger.info('Email (no provider configured)', {
    to: config.NODE_ENV === 'development' ? to : '[REDACTED]',
    subject,
  })
  return { accepted: [to], preview: true, provider: 'none' }
}
