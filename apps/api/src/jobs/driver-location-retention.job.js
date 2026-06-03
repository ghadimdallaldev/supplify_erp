import { logger } from '../lib/logger.js'
import { query } from '../lib/db.js'
import { config } from '../config/env.js'

/**
 * Delete historical GPS pings older than GPS_LOCATION_RETENTION_DAYS.
 * Does not remove driver_latest_location rows (operational snapshot).
 */
export async function runDriverLocationRetentionJob() {
  const days = config.GPS_LOCATION_RETENTION_DAYS ?? 90
  if (days <= 0) {
    return { deletedCount: 0, skipped: 'retention_disabled' }
  }

  const { rowCount } = await query(
    `DELETE FROM driver_location_ping
     WHERE recorded_at < now() - ($1::int * interval '1 day')`,
    [days]
  )

  const deletedCount = rowCount ?? 0
  if (deletedCount > 0) {
    logger.info('Driver location retention purge', { deletedCount, retentionDays: days })
  }
  return { deletedCount, retentionDays: days }
}
