/**
 * Side-effect module: must be imported before any apps/api module.
 * Points the API's own db.js at the isolated marketplace audit database and refuses anything else.
 */
const raw = process.env.SUPPLIFY_MARKETPLACE_DATABASE_URL || ''

export function assertIsolatedMarketplaceUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      'SUPPLIFY_MARKETPLACE_DATABASE_URL is not set (see tests/integrity/marketplace/README.md)'
    )
  }
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/marketplace_audit') {
    throw new Error('Refusing non-isolated marketplace target (need 127.0.0.1/marketplace_audit)')
  }
  return url.href
}

const url = assertIsolatedMarketplaceUrl(raw)

// resolveNativeDatabaseUrl() rewrites localhost URLs to the dev docker DB unless this is set.
process.env.SUPPLIFY_DATABASE_URL = url
process.env.DATABASE_URL = url
delete process.env.DATABASE_MIGRATION_URL
process.env.NODE_ENV = 'test'
process.env.REDIS_URL = ''
process.env.RATE_LIMIT_ENABLED = 'false'
process.env.LOG_LEVEL = process.env.MARKETPLACE_LOG_LEVEL || 'error'
process.env.EMAIL_ENABLED = 'false'
process.env.SKIP_RAILWAY_ENV_FILE = '1'
