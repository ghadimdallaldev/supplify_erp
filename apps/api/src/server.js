import express from 'express'
import http from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { config, allowE2eRoutes } from './config/env.js'
import { isRailwayRuntime } from './config/load-railway-env.js'
import { isLikelyPublicRedisUrl } from './config/resolve-redis-url.js'
import { validateProductionConfig } from './lib/validate-config.js'
import { logger } from './lib/logger.js'
import { createSessionStore } from './lib/session-store.js'
import { requestContext } from './middlewares/requestContext.js'
import { requestLogger } from './middlewares/requestLogger.js'
import { impersonationContext } from './middlewares/impersonationContext.js'
import { activeTenantContext } from './middlewares/activeTenantContext.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { csrfProtection } from './middlewares/csrf.js'
import { initializeSocket } from './lib/socket.js'
import { authRoutes } from './routes/auth.routes.js'
import { registerRoutes } from './routes/register.routes.js'
import { productsRoutes } from './routes/products.routes.js'
import { pricesRoutes } from './routes/prices.routes.js'
import { inventoryRoutes } from './routes/inventory.routes.js'
import { suppliersRoutes } from './routes/suppliers.routes.js'
import { restaurantsRoutes } from './routes/restaurants.routes.js'
import { ordersCalendarRoutes } from './routes/orders.calendar.routes.js'
import { ordersRoutes } from './routes/orders.routes.js'
import { filesRoutes } from './routes/files.routes.js'
import { adminRoutes } from './routes/admin.routes.js'
import { chatRoutes } from './routes/chat.routes.js'
import { invoicesRoutes } from './routes/invoices.routes.js'
import { paymentsRoutes } from './routes/payments.routes.js'
import { quickListsRoutes } from './routes/quick-lists.routes.js'
import { restaurantInventoryRoutes } from './routes/restaurant-inventory.routes.js'
import { restaurantOnboardingRoutes } from './routes/restaurant-onboarding.routes.js'
import { receivingRoutes } from './routes/receiving.routes.js'
import { restaurantFinanceRoutes } from './routes/restaurant-finance.routes.js'
import { reservationsRoutes } from './routes/reservations.routes.js'
import { restaurantPricingRoutes } from './routes/restaurant-pricing.routes.js'
import { notificationsRoutes } from './routes/notifications.routes.js'
import { subscriptionsRoutes } from './routes/subscriptions.routes.js'
import adminDashboardRoutes from './routes/admin-dashboard.routes.js'
import branchesRoutes from './routes/branches.routes.js'
import orgRoutes from './routes/org.routes.js'
import warehousesRoutes from './routes/warehouses.routes.js'
import { executeScheduledOrders } from './services/scheduled-orders.service.js'
import { checkOverdueInvoices } from './jobs/invoice-overdue.job.js'
import { runSubscriptionBillingJob } from './jobs/subscription-billing.job.js'
import { checkExpiredWaitlistOffers } from './services/waitlistPromotion.js'
import { billingAccessMiddleware } from './middlewares/billingAccess.js'
import { billingRoutes } from './routes/billing.routes.js'
import {
  ensureReservationsSchema,
  ensureStaffAppSchema,
  ensureOrderCancellationColumns,
} from './lib/migrator.js'
import { staffRoutes } from './routes/staff.routes.js'
import { publicRoutes } from './routes/public.routes.js'
import { fulfillmentRoutes } from './routes/fulfillment.routes.js'
import { driversRoutes } from './routes/drivers.routes.js'
import { supplierOpsRoutes } from './routes/supplier-ops.routes.js'
import { runFulfillmentExceptionChecks } from './jobs/fulfillment-exceptions.job.js'
import { promotionsRoutes } from './routes/promotions.routes.js'
import { tenantAuditRoutes } from './routes/tenant-audit.routes.js'
import { runDeactivateExpiredPromotionsJob } from './jobs/promotions-expiry.job.js'
import { runFreeSandboxExpiryJob } from './jobs/free-sandbox-expiry.job.js'
import { disputesRoutes } from './routes/disputes.routes.js'
import { creditNotesRoutes } from './routes/credit-notes.routes.js'
import { pushRoutes } from './routes/push.routes.js'
import { reviewsRoutes } from './routes/reviews.routes.js'
import { reportsRoutes } from './routes/reports.routes.js'
import { tenantRolesRoutes } from './routes/tenant-roles.routes.js'
import branchInvitationsRoutes from './routes/branch-invitations.routes.js'
import branchInvitationsPublicRoutes from './routes/branch-invitations-public.routes.js'
import restaurantOrgRoutes from './routes/restaurant-org.routes.js'
import restaurantInvitationsRoutes from './routes/restaurant-invitations.routes.js'
import { expireOldBranchInvitations } from './lib/branch-invitations.js'
import { expireOldRestaurantInvitations } from './lib/restaurant-invitations.js'
import { runCronJob, CRON_JOBS } from './lib/cron-runner.js'
import path from 'node:path'
import { ensureStorageReady, checkStorageHealth } from './services/storage/storage.service.js'
import { pool, closePool } from './lib/db.js'
import { disconnectCache, isRedisConnected } from './lib/cache.js'
import { baseSchemaExists, runAllSqlMigrations } from './lib/sql-migrator.js'
import {
  getMemorySnapshot,
  shouldExposeMemoryOnHealth,
  startMemoryMonitor,
} from './lib/memory-monitor.js'

validateProductionConfig()

if (config.REDIS_URL && isLikelyPublicRedisUrl(config.REDIS_URL)) {
  logger.warn({
    msg: 'REDIS_URL uses a public Railway Redis proxy (egress fees). Set REDIS_URL=${{your-redis-service.REDIS_URL}} on the API service — not REDIS_PUBLIC_URL.',
    railway: isRailwayRuntime(),
  })
}

/** Run after HTTP listen so Railway health checks get a response during slow DB work. */
async function runStartupSchemaTasks() {
  if (config.NODE_ENV === 'test') return

  try {
    const hasBaseSchema = await baseSchemaExists()
    if (config.RUN_MIGRATIONS_ON_START || !hasBaseSchema) {
      logger.info('Running SQL migrations on startup', {
        runMigrationsOnStart: config.RUN_MIGRATIONS_ON_START,
        baseSchemaExists: hasBaseSchema,
      })
      await runAllSqlMigrations()
    }

    await ensureReservationsSchema()
    await ensureStaffAppSchema()
    await ensureOrderCancellationColumns()
  } catch (error) {
    logger.error('Database migration failed after listen — shutting down', {
      error: error.message,
    })
    process.exit(1)
  }

  try {
    const storageResults = await ensureStorageReady()
    logger.info('Storage ready', {
      driver: config.STORAGE_DRIVER,
      results: storageResults,
    })
  } catch (error) {
    logger.error('Storage setup failed — uploads may not work', {
      error: error.message,
      driver: config.STORAGE_DRIVER,
      bucket: config.STORAGE_BUCKET,
    })
  }
}

const app = express()
const isProduction = config.NODE_ENV === 'production'

if (config.TRUST_PROXY) {
  app.set('trust proxy', 1)
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Allow web app on another Railway host to load /api/files/object images
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

// CORS configuration (allow multiple dev origins e.g. Vite 5173–5175)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || config.WEB_ORIGINS.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'X-Branch-Id',
    ],
  })
)

const rateLimitMessage = 'Too many requests from this IP, please try again later.'
const rateOpts = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
}
const skipReadOnlyRequests = (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)

function createLimiter(max, message, extra = {}) {
  return rateLimit({ ...rateOpts, max, message, ...extra })
}

const noopLimiter = (_req, _res, next) => next()
const limiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(config.RATE_LIMIT_MAX, rateLimitMessage)
  : noopLimiter
const authLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(
      isProduction ? 30 : 500,
      'Too many authentication attempts, please try again later.'
    )
  : noopLimiter
const staffLinkLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(
      isProduction ? 10 : 100,
      'Too many staff portal link requests, please try again later.'
    )
  : noopLimiter
const publicLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(isProduction ? 60 : 200, rateLimitMessage)
  : noopLimiter
const chatSendLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(300, 'Too many messages sent, please try again later.')
  : noopLimiter
const ordersWriteLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(isProduction ? 120 : 500, 'Too many order requests, please try again later.', {
      skip: skipReadOnlyRequests,
    })
  : noopLimiter
const promotionsWriteLimiter = config.RATE_LIMIT_ENABLED
  ? createLimiter(isProduction ? 80 : 400, 'Too many promotion requests, please try again later.', {
      skip: skipReadOnlyRequests,
    })
  : noopLimiter

app.use('/auth', authLimiter)
app.use('/api/public', publicLimiter)
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Session configuration (PostgreSQL store for OAuth state across instances)
const sessionStore = createSessionStore()

const sessionCookie = {
  secure: config.COOKIE_SECURE,
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: config.COOKIE_SAME_SITE,
}
if (config.COOKIE_DOMAIN) {
  sessionCookie.domain = config.COOKIE_DOMAIN
}

app.use(
  session({
    store: sessionStore,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookie,
  })
)

app.use(requestContext)
if (config.ENABLE_REQUEST_LOGGING) {
  app.use(requestLogger)
}

// Impersonation: read signed cookie and set req.impersonationContext when admin is "viewing as" a tenant
app.use(impersonationContext)
app.use(activeTenantContext)

// Block locked tenants except billing/subscription read endpoints
app.use(billingAccessMiddleware)

// CSRF protection for state-changing operations (skip for public APIs)
const csrfBypassPrefixes = ['/api/public']
app.use((req, res, next) => {
  if (csrfBypassPrefixes.some((prefix) => req.path.startsWith(prefix))) {
    return next()
  }
  return csrfProtection(req, res, next)
})

if (config.STORAGE_DRIVER === 'local') {
  const uploadsDir = path.resolve(config.STORAGE_LOCAL_PATH)
  app.use('/uploads', express.static(uploadsDir))
}

app.get('/health', async (req, res) => {
  const storage = await checkStorageHealth()
  const ok = storage.ok
  const payload = {
    status: ok ? 'ok' : 'degraded',
    service: 'supplify-api',
    env: config.APP_ENV,
  }

  if (shouldExposeMemoryOnHealth()) {
    payload.ok = ok
    payload.timestamp = new Date().toISOString()
    payload.storage = storage
    payload.requestId = req.requestId
    payload.memory = getMemorySnapshot()
    payload.dbPool = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: pool.options.max,
    }
    payload.redis = { connected: isRedisConnected() }
  }

  res.status(ok ? 200 : 503).json(payload)
})

app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', service: 'supplify-api', env: config.APP_ENV })
  } catch {
    res.status(503).json({ status: 'degraded', service: 'supplify-api', env: config.APP_ENV })
  }
})

// API routes
app.use('/auth', authLimiter)
app.use('/auth', authRoutes)
app.use('/api/register', authLimiter)
app.use('/api/register', registerRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/prices', pricesRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/restaurants', restaurantsRoutes)
app.use('/api/orders/calendar', ordersCalendarRoutes)
app.use('/api/orders', ordersWriteLimiter)
app.use('/api/orders', ordersRoutes)
app.use('/api/promotions', promotionsWriteLimiter)
app.use('/api/promotions', promotionsRoutes)
app.use('/api/audit', tenantAuditRoutes)
app.use('/api/disputes', disputesRoutes)
app.use('/api/credit-notes', creditNotesRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/reviews', reviewsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/roles', tenantRolesRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/chat', chatSendLimiter)
app.use('/api/chat', chatRoutes)
app.use('/api/invoices', invoicesRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/quick-lists', quickListsRoutes)
app.use('/api/restaurant-inventory', restaurantInventoryRoutes)
app.use('/api/restaurant-onboarding', restaurantOnboardingRoutes)
app.use('/api/receiving', receivingRoutes)
app.use('/api/restaurant-finance', restaurantFinanceRoutes)
app.use('/api/reservations', reservationsRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/restaurant-pricing', restaurantPricingRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/subscriptions', subscriptionsRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/public/staff/request-link', staffLinkLimiter)
app.use('/api/public', publicRoutes)
app.use('/api/admin-dashboard', adminDashboardRoutes)
if (allowE2eRoutes()) {
  app.use('/api/e2e', e2eRoutes)
}
app.use('/api/branches', branchesRoutes)
app.use('/api/org', orgRoutes)
app.use('/api/org/invitations', branchInvitationsRoutes)
app.use('/api/restaurant-org', restaurantOrgRoutes)
app.use('/api/restaurants/invitations', restaurantInvitationsRoutes)
app.use('/api/public/invitations', branchInvitationsPublicRoutes)
app.use('/api/warehouses', warehousesRoutes)
app.use('/api/fulfillment', fulfillmentRoutes)
app.use('/api/drivers', driversRoutes)
app.use('/api/supplier', supplierOpsRoutes)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    data: null,
    error: {
      name: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    requestId: req.requestId,
  })
})

// Error handling middleware
app.use(errorHandler)

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

  runStartupSchemaTasks().catch((error) => {
    logger.error('Startup schema tasks failed', { error: error.message })
  })

  const scheduledOrdersIntervalMs = config.CRON_SCHEDULED_ORDERS_INTERVAL_MS

  const runScheduledOrdersCron = () =>
    runCronJob(CRON_JOBS.SCHEDULED_ORDERS, () => executeScheduledOrders()).catch((err) => {
      logger.error('Error in scheduled orders execution:', err)
    })

  runScheduledOrdersCron()
  trackInterval(runScheduledOrdersCron, scheduledOrdersIntervalMs)
  logger.info('Scheduled orders cron job started', { intervalMs: scheduledOrdersIntervalMs })

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

  const invoiceOverdueIntervalMs = 24 * 60 * 60 * 1000
  const runInvoiceOverdueCron = () =>
    runCronJob(CRON_JOBS.INVOICE_OVERDUE, () => checkOverdueInvoices()).catch((err) =>
      logger.error('Invoice overdue job failed:', err)
    )
  runInvoiceOverdueCron()
  trackInterval(runInvoiceOverdueCron, invoiceOverdueIntervalMs)
  logger.info('Invoice overdue job started', { intervalMs: invoiceOverdueIntervalMs })

  const billingIntervalMs = 60 * 60 * 1000
  const runBillingCron = () =>
    runCronJob(CRON_JOBS.SUBSCRIPTION_BILLING, () => runSubscriptionBillingJob()).catch((err) =>
      logger.error('Subscription billing job failed:', err)
    )
  runBillingCron()
  trackInterval(runBillingCron, billingIntervalMs)
  logger.info('Subscription billing job started', { intervalMs: billingIntervalMs })

  const waitlistIntervalMs = 15 * 60 * 1000
  const runWaitlistCron = () =>
    runCronJob(CRON_JOBS.WAITLIST_OFFERS, () => checkExpiredWaitlistOffers()).catch((err) =>
      logger.error('Waitlist expired-offers job failed:', err)
    )
  runWaitlistCron()
  trackInterval(runWaitlistCron, waitlistIntervalMs)
  logger.info('Waitlist expired-offers job started', { intervalMs: waitlistIntervalMs })

  const promotionsIntervalMs = 30 * 60 * 1000
  const runPromotionsCron = () =>
    runCronJob(CRON_JOBS.PROMOTIONS_EXPIRY, () => runDeactivateExpiredPromotionsJob()).catch(
      (err) => logger.error('Promotions expiry job failed:', err)
    )
  runPromotionsCron()
  trackInterval(runPromotionsCron, promotionsIntervalMs)
  logger.info('Promotions expiry job started', { intervalMs: promotionsIntervalMs })

  const invitationIntervalMs = 60 * 60 * 1000
  const runInvitationExpiryCron = () =>
    runCronJob(CRON_JOBS.INVITATION_EXPIRY, () =>
      Promise.all([expireOldBranchInvitations(), expireOldRestaurantInvitations()])
    ).catch((err) => logger.error('Invitation expiry job failed:', err))
  runInvitationExpiryCron()
  trackInterval(runInvitationExpiryCron, invitationIntervalMs)
  logger.info('Invitation expiry job started', { intervalMs: invitationIntervalMs })

  const sandboxIntervalMs = 60 * 60 * 1000
  const runSandboxCron = () =>
    runCronJob(CRON_JOBS.FREE_SANDBOX_EXPIRY, () => runFreeSandboxExpiryJob()).catch((err) =>
      logger.error('Free sandbox expiry job failed:', err)
    )
  runSandboxCron()
  trackInterval(runSandboxCron, sandboxIntervalMs)
  logger.info('Free sandbox expiry job started', { intervalMs: sandboxIntervalMs })

  const fulfillmentIntervalMs = 30 * 60 * 1000
  const runFulfillmentCron = () =>
    runCronJob(CRON_JOBS.FULFILLMENT_EXCEPTIONS, () => runFulfillmentExceptionChecks()).catch(
      (err) => logger.error('Fulfillment exceptions job failed:', err)
    )
  runFulfillmentCron()
  trackInterval(runFulfillmentCron, fulfillmentIntervalMs)
  logger.info('Fulfillment exceptions job started', { intervalMs: fulfillmentIntervalMs })
})

export default app
