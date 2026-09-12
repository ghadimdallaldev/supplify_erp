#!/usr/bin/env node
/**
 * Manual background job runner with dry-run support.
 *
 * Usage:
 *   node apps/api/scripts/run-job.mjs --list
 *   node apps/api/scripts/run-job.mjs operational-reminders --dry-run
 *   node apps/api/scripts/run-job.mjs inventory-expiry --dry-run --tenant=UUID
 *   node apps/api/scripts/run-job.mjs delivery-rollover --force
 */
import '../src/config/env.js'
import { logger } from '../src/lib/logger.js'
import { listJobs, runJobByAlias } from './jobs-registry.mjs'

const args = process.argv.slice(2)

if (args.includes('--list') || args.length === 0) {
  console.log('Available jobs:')
  for (const name of listJobs()) {
    console.log(`  - ${name}`)
  }
  process.exit(0)
}

const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const tenantArg = args.find((a) => a.startsWith('--tenant='))
const tenantId = tenantArg ? tenantArg.split('=')[1] : null
const jobAlias = args.find((a) => !a.startsWith('--'))

if (!jobAlias) {
  console.error('Job name required. Use --list to see available jobs.')
  process.exit(1)
}

const startedAt = Date.now()

try {
  const result = await runJobByAlias(jobAlias, { dryRun, tenantId, force })
  logger.info('Manual job run complete', {
    job: jobAlias,
    dryRun,
    durationMs: Date.now() - startedAt,
    result,
  })
  console.log(JSON.stringify({ job: jobAlias, dryRun, result }, null, 2))
  process.exit(0)
} catch (err) {
  logger.error('Manual job run failed', { job: jobAlias, dryRun, error: err.message })
  console.error(err.message)
  process.exit(1)
}
