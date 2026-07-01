import { config } from '../config/env.js'
import { sendTemplateEmail, isEmailConfigured } from './email/email.service.js'
import { logger } from '../lib/logger.js'

function staffPortalWebBase() {
  return (config.STAFF_PORTAL_BASE_URL || config.WEB_ORIGIN || 'http://localhost:5173').replace(
    /\/$/,
    ''
  )
}

export function buildStaffPortalLoginPageUrl() {
  return `${staffPortalWebBase()}/staff/login`
}

export function buildStaffPortalLoginUrl(sessionToken) {
  return `${staffPortalWebBase()}/staff/dashboard?token=${encodeURIComponent(sessionToken)}`
}

/** @deprecated Use isEmailConfigured from email.service.js */
export function isSmtpConfigured() {
  return isEmailConfigured()
}

export async function sendStaffPortalMagicLink({ to, displayName, sessionToken, expiresAt }) {
  const loginUrl = buildStaffPortalLoginUrl(sessionToken)
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '12 hours'

  const greeting = displayName ? `Hi ${displayName},` : 'Hi,'
  const message = `${greeting}

Use this secure link to access your staff portal (schedule, PTO, clock-in):
${loginUrl}

This link expires at ${expiresLabel}. If you did not request it, you can ignore this email.`

  if (!isEmailConfigured() && !config.EMAIL_LOG_ONLY) {
    if (config.NODE_ENV === 'development') {
      logger.info('Staff portal magic link (email not configured)', { loginUrl })
    }
    return { delivered: false, loginUrl, preview: true }
  }

  const result = await sendTemplateEmail({
    to,
    template: 'staff.magic_link',
    data: {
      message,
      loginUrl,
      ctaUrl: loginUrl,
      recipientName: displayName,
    },
    eventType: 'staff.magic_link',
    eventKey: `staff:magic:${to}:${sessionToken?.slice(0, 8) || 'link'}`,
    throwOnError: true,
  })
  return { delivered: Boolean(result.sent || result.logOnly), loginUrl, preview: result.preview }
}

export async function sendStaffPortalAccountInvite({
  to,
  displayName,
  loginUrl,
  temporaryPassword,
  locale,
}) {
  const url = loginUrl || buildStaffPortalLoginPageUrl()
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,'
  const message = temporaryPassword
    ? null
    : `${greeting}

Your restaurant enabled staff portal access. Sign in with your work email:
${url}

Use the password provided by your manager, or reset it from the login page if needed.`

  if (!isEmailConfigured() && !config.EMAIL_LOG_ONLY) {
    if (config.NODE_ENV === 'development') {
      logger.info('Staff portal account invite (email not configured)', { loginUrl: url })
    }
    return { delivered: false, loginUrl: url, preview: true }
  }

  const result = await sendTemplateEmail({
    to,
    template: 'staff.invite',
    locale,
    data: {
      message,
      loginUrl: url,
      ctaUrl: url,
      recipientName: displayName,
      invitedName: displayName,
      temporaryPassword,
    },
    eventType: 'staff.invite',
    eventKey: temporaryPassword ? `staff:invite:${to}:${Date.now()}` : `staff:invite:${to}`,
  })
  return { delivered: Boolean(result.sent || result.logOnly), loginUrl: url }
}
