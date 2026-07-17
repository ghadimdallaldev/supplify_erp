#!/usr/bin/env node
/**
 * Manual delivery rollover — same logic as the in-process cron job.
 * Usage: node apps/api/scripts/run-delivery-rollover.mjs [--force] [--supplier=UUID]
 */
import '../src/config/env.js'
import { runDeliveryRolloverJob } from '../src/services/delivery-rollover.service.js'
import { logger } from '../src/lib/logger.js'

const force = process.argv.includes('--force')
const supplierArg = process.argv.find((a) => a.startsWith('--supplier='))
const tenantId = supplierArg ? supplierArg.split('=')[1] : null

try {
  const result = await runDeliveryRolloverJob({ force, tenantId })
  logger.info('Delivery rollover manual run complete', result)
  process.exit(0)
} catch (err) {
  logger.error('Delivery rollover manual run failed', { error: err.message })
  process.exit(1)
}
