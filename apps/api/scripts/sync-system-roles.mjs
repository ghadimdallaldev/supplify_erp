#!/usr/bin/env node
/**
 * Backfill system role permissions for all restaurants and suppliers from role-matrix.js
 */
import '../src/config/env.js'
import { syncAllTenantsSystemRoles } from '../src/lib/tenant-roles.js'
import { logger } from '../src/lib/logger.js'

try {
  await syncAllTenantsSystemRoles()
  logger.info('System roles synced for all tenants')
  process.exit(0)
} catch (err) {
  logger.error('sync-system-roles failed', { error: err.message })
  process.exit(1)
}
