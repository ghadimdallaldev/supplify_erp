import { isStartupMigrationsReady } from './startup-readiness.js'

/**
 * Register in-process crons only after startup migrations have marked ready.
 * Calling earlier stampedes the Postgres pool (migrations + ~20 immediate cron ticks)
 * and can cause Railway boot loops: connect timeout → migration fail → process.exit(1).
 *
 * @param {{ registerCrons: () => unknown }} deps
 * @returns {unknown}
 */
export function startCronsAfterMigrations({ registerCrons }) {
  if (!isStartupMigrationsReady()) {
    throw new Error('Crons must not start before startup migrations are ready')
  }
  return registerCrons()
}
