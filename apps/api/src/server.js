import http from 'http'
import { config } from './config/env.js'
import { isRailwayRuntime } from './config/load-railway-env.js'
import { isLikelyPublicRedisUrl } from './config/resolve-redis-url.js'
import { validateProductionConfig } from './lib/validate-config.js'
import { logEmailBootMode } from './services/email/email.service.js'
import { logger } from './lib/logger.js'
import { initializeSocket } from './lib/socket.js'
import { ensureOrderCancellationColumns } from './lib/migrator.js'
import { registerCronJobs } from './lib/register-cron-jobs.js'
import { startCronsAfterMigrations } from './lib/start-crons-after-migrations.js'
import { ensureStorageReady, getStorageProvider } from './services/storage/storage.service.js'
import {
  checkClamAvHealth,
  isHostedSecurityEnvironment,
} from './services/storage/malware-scanner.js'
import { closePool, warmupPool, startPoolKeepalive, stopPoolKeepalive } from './lib/db.js'
import { getKeycloakConfig } from './lib/auth.js'
import { disconnectCache } from './lib/cache.js'
import { runFullStartupMigrations } from './lib/startup-migrations.js'
import { markStartupMigrationsReady } from './lib/startup-readiness.js'
import { startMemoryMonitor } from './lib/memory-monitor.js'
import { createApp } from './app.js'

validateProductionConfig()
logEmailBootMode()

if (config.REDIS_URL && isLikelyPublicRedisUrl(config.REDIS_URL)) {
  logger.warn({
    msg: 'REDIS_URL uses a public Railway Redis proxy (egress fees). Set REDIS_URL=${{your-redis-service.REDIS_URL}} on the API service — not REDIS_PUBLIC_URL.',
    railway: isRailwayRuntime(),
  })
}

/** Run after HTTP listen so Railway health checks get a response during slow DB work. */
async function runStartupSchemaTasks() {
  if (config.NODE_ENV === 'test') {
    markStartupMigrationsReady()
    return
  }

  try {
    await runFullStartupMigrations()
    await ensureOrderCancellationColumns()
    markStartupMigrationsReady()
  } catch (error) {
    logger.error(`Database migration failed after listen — shutting down: ${error.message}`, {
      error: error.message,
      code: error.code,
    })
    process.exit(1)
  }

  // After migrations only — immediate cron ticks must not compete for the DB pool.
  try {
    startCronsAfterMigrations({
      registerCrons: () => registerCronJobs({ trackInterval }),
    })
  } catch (error) {
    logger.error('Cron registration failed after migrations', { error: error.message })
  }

  try {
    const storageResults = await ensureStorageReady()
    const scannerHealth = await checkClamAvHealth()
    if (isHostedSecurityEnvironment() && !scannerHealth.ok) {
      throw new Error('Malware scanner is not ready; hosted startup is fail-closed')
    }
    if (isHostedSecurityEnvironment() && config.STORAGE_DRIVER === 's3') {
      const storageProvider = getStorageProvider()
      if (typeof storageProvider.checkPrivateAccess !== 'function') {
        throw new Error(
          'S3 private-access verification is unsupported; hosted startup is fail-closed'
        )
      }
      const privateAccess = await storageProvider.checkPrivateAccess()
      if (!privateAccess.supported || !privateAccess.private) {
        throw new Error('Object storage is not verified private; hosted startup is fail-closed')
      }
    }
    logger.info('Storage ready', {
      driver: config.STORAGE_DRIVER,
      results: Array.isArray(storageResults)
        ? storageResults.map((result) => ({
            driver: result?.driver || config.STORAGE_DRIVER,
            created: result?.created === true,
          }))
        : undefined,
      malwareScanner: { ok: scannerHealth.ok, signatureFresh: scannerHealth.signatureFresh },
    })
  } catch (error) {
    logger.error('Storage security readiness failed', {
      error: error.message,
      driver: config.STORAGE_DRIVER,
    })
    if (isHostedSecurityEnvironment()) process.exit(1)
  }
}

const app = createApp()

// Start server
const PORT = config.PORT || 4000
const server = http.createServer(app)
const cronTimers = []
let stopMemoryMonitor = () => {}

function trackInterval(fn, ms) {
  const timer = setInterval(fn, ms)
  cronTimers.push(timer)
  return timer
}

// Initialize Socket.IO (Redis adapter when REDIS_URL is set)
void initializeSocket(server).catch((err) => {
  logger.error({ msg: 'Socket.IO initialization failed', error: err?.message })
})

let shuttingDown = false
async function gracefulShutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ msg: 'Graceful shutdown started', signal })

  for (const timer of cronTimers) {
    clearInterval(timer)
  }
  stopMemoryMonitor()
  stopPoolKeepalive()

  await new Promise((resolve) => {
    server.close(() => resolve())
  })

  try {
    await closePool()
  } catch (error) {
    logger.warn('Error closing database pool', { error: error.message })
  }

  try {
    await disconnectCache()
  } catch (error) {
    logger.warn('Error disconnecting Redis', { error: error.message })
  }

  logger.info({ msg: 'Graceful shutdown complete', signal })
  process.exit(0)
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch((err) => {
    logger.error('Shutdown failed', { error: err.message })
    process.exit(1)
  })
})
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch((err) => {
    logger.error('Shutdown failed', { error: err.message })
    process.exit(1)
  })
})

const HOST = process.env.HOST || '0.0.0.0'
server.listen(PORT, HOST, () => {
  stopMemoryMonitor = startMemoryMonitor()
  logger.info({
    msg: `Server started on ${HOST}:${PORT}`,
    host: HOST,
    port: PORT,
    railwayPort: process.env.PORT ?? null,
    env: config.NODE_ENV,
    appEnv: config.APP_ENV,
    webOrigin: config.WEB_ORIGIN,
    paymentsMode: config.PAYMENTS_MODE,
  })

  warmupPool()
    .then(() => startPoolKeepalive())
    .catch((error) => {
      logger.warn('Database pool warmup failed', { error: error.message })
    })

  // Pre-warm Keycloak OIDC config so the first user request doesn't pay the network round-trip.
  getKeycloakConfig().catch((err) => {
    logger.warn('Keycloak config pre-warm failed', { error: err?.message })
  })

  runStartupSchemaTasks().catch((error) => {
    logger.error('Startup schema tasks failed', { error: error.message })
  })

  if (config.NODE_ENV !== 'production') {
    import('./lib/keycloak-admin.js')
      .then(({ ensureApiClientDirectAccessGrants }) => ensureApiClientDirectAccessGrants())
      .then((updated) => {
        if (updated) {
          logger.info('Keycloak supplify-api client: direct access grants enabled for invite login')
        }
      })
      .catch((err) => {
        logger.warn('Could not enable Keycloak direct access grants (invite auto-login)', {
          error: err.message,
        })
      })
  }
})

export default app
