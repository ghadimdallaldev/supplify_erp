import nodemailer from 'nodemailer'
import { logger } from '../lib/logger.js'

let transporter

function getTransporter() {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const secure = process.env.SMTP_SECURE === 'true' || port === 465

  if (!host) {
    logger.warn('SMTP_HOST not configured — emails will be logged only')
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

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@supplify.local'
  const payload = {
    from,
    to,
    subject,
    text: text || undefined,
    html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : undefined),
  }

  const transport = getTransporter()
  if (!transport) {
    logger.info('Email (SMTP not configured)', {
      to: process.env.NODE_ENV === 'development' ? to : '[REDACTED]',
      subject,
    })
    return { accepted: [to], preview: true }
  }

  const info = await transport.sendMail(payload)
  logger.info('Email sent via nodemailer', { messageId: info.messageId, subject })
  return info
}
