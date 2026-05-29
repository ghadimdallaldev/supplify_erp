/**
 * Shared env parsing helpers (no secrets, no side effects).
 */

export function envBool(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue
  return value === 'true' || value === '1' || value === 'yes'
}

export function envInt(value, defaultValue) {
  if (value == null || value === '') return defaultValue
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : defaultValue
}

export function resolveAppEnv(nodeEnv) {
  const raw = process.env.APP_ENV?.trim().toLowerCase()
  if (raw === 'dev' || raw === 'preprod' || raw === 'prod') return raw
  return nodeEnv === 'production' ? 'prod' : 'dev'
}

export function resolvePaymentsMode(appEnv, nodeEnv) {
  const raw = process.env.PAYMENTS_MODE?.trim().toLowerCase()
  if (raw === 'mock' || raw === 'test' || raw === 'live') return raw
  if (appEnv === 'dev') return 'mock'
  if (appEnv === 'preprod') return 'test'
  if (appEnv === 'prod') return 'live'
  return nodeEnv === 'production' ? 'test' : 'mock'
}

export function resolveBillingGatewayId(paymentsMode) {
  if (process.env.BILLING_GATEWAY) return process.env.BILLING_GATEWAY
  if (paymentsMode === 'mock' || paymentsMode === 'test') return 'stub'
  return process.env.PAYMENTS_PROVIDER?.trim() || 'stub'
}

/**
 * CORS / browser origins. Never use wildcard. Prod/preprod require explicit URLs.
 */
export function resolveWebOrigins({ appEnv, nodeEnv }) {
  const origins = new Set()

  const addList = (raw) => {
    if (!raw) return
    for (const part of String(raw).split(',')) {
      const o = part.trim()
      if (o && o !== '*') origins.add(o)
    }
  }

  addList(process.env.CORS_ORIGIN)
  addList(process.env.WEB_ORIGINS)
  if (process.env.WEB_ORIGIN) origins.add(process.env.WEB_ORIGIN.trim())
  if (process.env.PUBLIC_FRONTEND_URL) origins.add(process.env.PUBLIC_FRONTEND_URL.trim())

  if (origins.size > 0) return [...origins]

  if (appEnv === 'dev' || nodeEnv !== 'production') {
    return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']
  }

  return []
}
