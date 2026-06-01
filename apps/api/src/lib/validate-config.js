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

function validateSharedProductionRules(issues) {
  if (isWeakSecret(config.SESSION_SECRET)) {
    issues.push('SESSION_SECRET must be at least 32 characters and not a default value')
  }
  if (isWeakSecret(config.IMPERSONATION_SECRET)) {
    issues.push('IMPERSONATION_SECRET must be at least 32 characters and not a default value')
  }
  if (!config.KEYCLOAK_CLIENT_SECRET || config.KEYCLOAK_CLIENT_SECRET === 'changeme') {
    issues.push('KEYCLOAK_CLIENT_SECRET must be set to a strong value')
  }
  if (
    config.DATABASE_URL.includes('postgres:postgres@') ||
    config.DATABASE_URL.includes('change_me')
  ) {
    issues.push('DATABASE_URL must not use default credentials')
  }
  if (!config.DATABASE_SSL) {
    issues.push('DATABASE_SSL should be true for hosted environments')
  }
  if (!config.WEB_ORIGINS.length) {
    issues.push(
      'CORS_ORIGIN, WEB_ORIGINS, WEB_ORIGIN, or PUBLIC_FRONTEND_URL must list allowed frontend URL(s)'
    )
  }
  if (config.WEB_ORIGINS.some((o) => o === '*' || o === 'null')) {
    issues.push('WEB_ORIGINS must not contain wildcards')
  }
  if (config.WEB_ORIGINS.every((o) => o.startsWith('http://'))) {
    logger.warn(
      'WEB_ORIGINS uses only http:// — use https:// behind TLS when exposed to the internet'
    )
  }
  const emailConfigured = Boolean(config.SENDGRID_API_KEY) || Boolean(config.SMTP_HOST)
  if (!emailConfigured) {
    issues.push('SENDGRID_API_KEY or SMTP_HOST must be set for outbound email')
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — WhatsApp notifications disabled')
  }
}

function validateHostedSafetyRules(issues, envLabel) {
  if (config.E2E_SECRET) {
    issues.push(`E2E_SECRET must not be set in ${envLabel}`)
  }
  if (config.ENABLE_DEBUG_ROUTES) {
    issues.push(`ENABLE_DEBUG_ROUTES must be false in ${envLabel}`)
  }
  if (config.ENABLE_SEED_ROUTES) {
    issues.push(`ENABLE_SEED_ROUTES must be false in ${envLabel}`)
  }
  if (config.ALLOW_DB_RESET) {
    issues.push(`ALLOW_DB_RESET must be false in ${envLabel}`)
  }
}

function validatePreprodRules(issues) {
  validateHostedSafetyRules(issues, 'preprod')
  if (config.PAYMENTS_MODE === 'mock') {
    issues.push('PAYMENTS_MODE=mock is not allowed in preprod (use test)')
  }
  if (config.PAYMENTS_MODE === 'live') {
    issues.push('PAYMENTS_MODE=live is not allowed in preprod (use test)')
  }
  if (config.SEED_DEMO_DATA) {
    logger.warn('SEED_DEMO_DATA=true in preprod — use only for intentional demo resets')
  }
}

function validateProdRules(issues) {
  validateHostedSafetyRules(issues, 'production')

  if (config.PAYMENTS_MODE === 'mock') {
    issues.push('PAYMENTS_MODE=mock is not allowed in production')
  }
  if (config.STORAGE_DRIVER === 'local') {
    issues.push(
      'STORAGE_DRIVER=local is not allowed in production — use s3-compatible external storage'
    )
  }
  if (!config.COOKIE_SECURE) {
    issues.push('COOKIE_SECURE must be true in production')
  }
  if (!config.RATE_LIMIT_ENABLED) {
    issues.push('RATE_LIMIT_ENABLED must be true in production')
  }
  if (config.ENABLE_SWAGGER) {
    logger.warn('ENABLE_SWAGGER=true in production — protect or disable publicly')
  }
  if (config.SEED_DEMO_DATA) {
    issues.push('SEED_DEMO_DATA must be false in production')
  }
  if (config.PAYMENTS_MODE === 'live' && !config.PAYMENTS_WEBHOOK_SECRET) {
    logger.warn('PAYMENTS_MODE=live without PAYMENTS_WEBHOOK_SECRET — configure before going live')
  }
}

/**
 * Fail fast when hosted env (preprod/prod) or NODE_ENV=production uses unsafe settings.
 * APP_ENV=dev is skipped (Railway dev images still use NODE_ENV=production from Docker).
 */
export function validateProductionConfig() {
  if (config.APP_ENV === 'dev') return

  const hosted = config.APP_ENV === 'preprod' || config.APP_ENV === 'prod'
  if (config.NODE_ENV !== 'production' && !hosted) return

  const issues = []
  validateSharedProductionRules(issues)

  if (config.E2E_SECRET && config.APP_ENV !== 'dev') {
    issues.push('E2E_SECRET must only be set in dev')
  }

  if (config.STORAGE_DRIVER === 's3') {
    if (
      config.STORAGE_ACCESS_KEY_ID === 'minioadmin' ||
      config.STORAGE_SECRET_ACCESS_KEY === 'minioadmin' ||
      WEAK_SECRETS.has(String(config.STORAGE_ACCESS_KEY_ID || '').toLowerCase())
    ) {
      issues.push('STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY must not use defaults')
    }
    if (config.STORAGE_PUBLIC_READ !== false && config.STORAGE_PUBLIC_READ !== 'false') {
      logger.warn(
        'STORAGE_PUBLIC_READ is enabled — set STORAGE_PUBLIC_READ=false for private uploads in production'
      )
    }
  }

  if (config.APP_ENV === 'preprod') {
    validatePreprodRules(issues)
  }
  if (config.APP_ENV === 'prod') {
    validateProdRules(issues)
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      logger.error('Deployment configuration error', { issue, appEnv: config.APP_ENV })
    }
    throw new Error(
      `Invalid configuration for ${config.APP_ENV}:\n- ${[...new Set(issues)].join('\n- ')}`
    )
  }
}
