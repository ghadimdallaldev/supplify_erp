#!/usr/bin/env node
/**
 * Re-sync every tenant's system role permissions from src/lib/role-matrix.js.
 * Run after deploying a role-matrix change so existing tenants pick it up immediately
 * (otherwise it applies lazily when ensureTenantSystemRoles next runs for that tenant).
 *
 * Usage: pnpm --filter api roles:sync   (or: node apps/api/scripts/sync-tenant-system-roles.mjs)
 */
import '../src/config/env.js'
import { syncAllTenantsSystemRoles } from '../src/lib/tenant-roles.js'
import { closePool } from '../src/lib/db.js'
import { logger } from '../src/lib/logger.js'

try {
  await syncAllTenantsSystemRoles()
  logger.info('Tenant system roles re-synced from role-matrix')
  await closePool()
  process.exit(0)
} catch (err) {
  logger.error('Tenant system role sync failed', { error: err.message })
  process.exit(1)
}
