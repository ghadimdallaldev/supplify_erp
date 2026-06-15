import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'

/**
 * Purge old logs and expired session rows to control table growth.
 */
export async function runLogRetentionJob({ dryRun = false } = {}) {
  const results = {}

  const tasks = [
    {
      key: 'notification_log',
      sql: `DELETE FROM notification_log WHERE created_at < NOW() - ($1::int || ' days')::interval`,
      days: config.NOTIFICATION_LOG_RETENTION_DAYS,
      enabled: config.NOTIFICATION_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'email_delivery_log',
      sql: `DELETE FROM email_delivery_log WHERE created_at < NOW() - ($1::int || ' days')::interval AND status IN ('sent', 'log_only', 'skipped')`,
      days: config.EMAIL_DELIVERY_LOG_RETENTION_DAYS,
      enabled: config.EMAIL_DELIVERY_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'admin_audit_log',
      sql: `DELETE FROM admin_audit_log WHERE created_at < NOW() - ($1::int || ' days')::interval`,
      days: config.ADMIN_AUDIT_LOG_RETENTION_DAYS,
      enabled: config.ADMIN_AUDIT_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'audit_logs',
      sql: `DELETE FROM audit_logs WHERE created_at < NOW() - ($1::int || ' days')::interval`,
      days: config.ADMIN_AUDIT_LOG_RETENTION_DAYS,
      enabled: config.ADMIN_AUDIT_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'staff_portal_session',
      sql: `DELETE FROM staff_portal_session WHERE expires_at < NOW() - ($1::int || ' days')::interval`,
      days: config.STAFF_PORTAL_SESSION_RETENTION_DAYS,
      enabled: config.STAFF_PORTAL_SESSION_RETENTION_DAYS > 0,
    },
    {
      key: 'gps_stale_alert_log',
      sql: `DELETE FROM gps_stale_alert_log WHERE alert_date < CURRENT_DATE - ($1::int || ' days')::interval`,
      days: config.GPS_STALE_ALERT_LOG_RETENTION_DAYS,
      enabled: config.GPS_STALE_ALERT_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'email_digest_log',
      sql: `DELETE FROM email_digest_log WHERE digest_date < CURRENT_DATE - ($1::int || ' days')::interval`,
      days: config.EMAIL_DIGEST_LOG_RETENTION_DAYS,
      enabled: config.EMAIL_DIGEST_LOG_RETENTION_DAYS > 0,
    },
    {
      key: 'reorder_ai_request_log',
      sql: `DELETE FROM reorder_ai_request_log WHERE created_at < NOW() - ($1::int || ' days')::interval`,
      days: 90,
      enabled: true,
    },
    {
      key: 'catalog_image_import_job',
      sql: `DELETE FROM catalog_image_import_job WHERE created_at < NOW() - ($1::int || ' days')::interval AND status IN ('completed', 'failed', 'cancelled')`,
      days: 90,
      enabled: true,
    },
    {
      key: 'catalog_product_import_job',
      sql: `DELETE FROM catalog_product_import_job WHERE created_at < NOW() - ($1::int || ' days')::interval AND status IN ('completed', 'failed', 'cancelled')`,
      days: 90,
      enabled: true,
    },
  ]

  for (const task of tasks) {
    if (!task.enabled) {
      results[task.key] = { deleted: 0, skipped: true }
      continue
    }

    if (dryRun || process.env.JOB_DRY_RUN === 'true') {
      try {
        const table = task.key
        const countSql = task.sql
          .replace(/^DELETE FROM (\w+)/i, 'SELECT COUNT(*)::int AS count FROM $1')
          .replace(/^DELETE FROM/i, 'SELECT COUNT(*)::int AS count FROM')
        const { rows } = await query(countSql, [task.days])
        results[table] = { wouldDelete: rows[0]?.count ?? 0, dryRun: true }
      } catch (e) {
        if (e.code === '42P01') {
          results[task.key] = { deleted: 0, skippedMigration: true }
        } else {
          throw e
        }
      }
      continue
    }

    try {
      const result = await query(task.sql, [task.days])
      results[task.key] = { deleted: result.rowCount ?? 0 }
    } catch (e) {
      if (e.code === '42P01') {
        results[task.key] = { deleted: 0, skippedMigration: true }
        continue
      }
      throw e
    }
  }

  const totalDeleted = Object.values(results).reduce(
    (sum, r) => sum + (r.deleted || r.wouldDelete || 0),
    0
  )

  if (totalDeleted > 0 || dryRun) {
    logger.info('Log retention job complete', { results, dryRun })
  }

  return { results, dryRun: dryRun || process.env.JOB_DRY_RUN === 'true' }
}
