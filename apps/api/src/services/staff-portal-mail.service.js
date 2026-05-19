import { config } from '../config/env.js'
import { sendMail } from './mailer.service.js'
import { logger } from '../lib/logger.js'

export function buildStaffPortalLoginUrl(sessionToken) {
  const base = (
    config.STAFF_PORTAL_BASE_URL ||
    config.WEB_ORIGIN ||
    'http://localhost:5173'
  ).replace(/\/$/, '')
  return `${base}/staff/dashboard?token=${encodeURIComponent(sessionToken)}`
}

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST)
}

/**
 * Send staff self-service magic link. When SMTP is not configured, logs the link in development only.
 */
export async function sendStaffPortalMagicLink({ to, displayName, sessionToken, expiresAt }) {
  const loginUrl = buildStaffPortalLoginUrl(sessionToken)
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '12 hours'

  const subject = 'Your Supplify staff portal sign-in link'
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,'
  const text = `${greeting}

Use this secure link to access your staff portal (schedule, PTO, clock-in):
${loginUrl}

This link expires at ${expiresLabel}. If you did not request it, you can ignore this email.

— Supplify`

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #0f172a;">
  <p>${greeting}</p>
  <p>Use the button below to open your staff portal (schedule, PTO, clock-in).</p>
  <p style="margin: 24px 0;">
    <a href="${loginUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Open staff portal</a>
  </p>
  <p style="font-size:14px;color:#64748b;">Or copy this link:<br><a href="${loginUrl}">${loginUrl}</a></p>
  <p style="font-size:14px;color:#64748b;">This link expires at ${expiresLabel}. If you did not request it, you can ignore this email.</p>
</body>
</html>`

  if (!isSmtpConfigured()) {
    if (config.NODE_ENV === 'development') {
      logger.info('Staff portal magic link (SMTP not configured)', { loginUrl })
    }
    return { delivered: false, loginUrl, preview: true }
  }

  await sendMail({ to, subject, text, html })
  return { delivered: true, loginUrl }
}
