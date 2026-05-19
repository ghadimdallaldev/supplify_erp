import { config } from '../config/env.js'
import { logger } from './logger.js'

const WEAK_SECRETS = new Set([
  'supersecret',
  'dev-session-secret-change-me',
  'changeme',
  'change_me',
  'postgres',
  'minioadmin',
])

function isWeakSecret(value) {
  if (!value || typeof value !== 'string') return true
  const normalized = value.trim().toLowerCase()
  if (normalized.length < 32) return true
  return WEAK_SECRETS.has(normalized)
}

/**
 * Fail fast in production when required secrets use unsafe defaults.
 */
export function validateProductionConfig() {
  if (config.NODE_ENV !== 'production') return

  const issues = []

  if (isWeakSecret(config.SESSION_SECRET)) {
    issues.push('SESSION_SECRET must be at least 32 characters and not a default value')
  }
  if (isWeakSecret(config.IMPERSONATION_SECRET)) {
    issues.push('IMPERSONATION_SECRET must be at least 32 characters and not a default value')
  }
  if (!config.KEYCLOAK_CLIENT_SECRET || config.KEYCLOAK_CLIENT_SECRET === 'changeme') {
    issues.push('KEYCLOAK_CLIENT_SECRET must be set to a strong value in production')
  }
  if (
    config.DATABASE_URL.includes('postgres:postgres@') ||
    config.DATABASE_URL.includes('change_me')
  ) {
    issues.push('DATABASE_URL must not use default credentials in production')
  }
  if (!config.DATABASE_SSL) {
    issues.push('DATABASE_SSL should be true in production')
  }
  if (config.WEB_ORIGINS.some((o) => o === '*' || o === 'null')) {
    issues.push('WEB_ORIGINS must not contain wildcards in production')
  }
  if (config.WEB_ORIGINS.every((o) => o.startsWith('http://'))) {
    logger.warn(
      'WEB_ORIGINS uses only http:// in production — use https:// behind TLS termination when exposed to the internet'
    )
  }
  const emailConfigured = Boolean(process.env.SENDGRID_API_KEY) || Boolean(process.env.SMTP_HOST)
  if (!emailConfigured) {
    issues.push(
      'SENDGRID_API_KEY (Twilio Email) or SMTP_HOST must be set in production for outbound email'
    )
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn(
      'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — WhatsApp notifications will not be delivered'
    )
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      logger.error('Production configuration error', { issue })
    }
    throw new Error(`Invalid production configuration:\n- ${issues.join('\n- ')}`)
  }
}
