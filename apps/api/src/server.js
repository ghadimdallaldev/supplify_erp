import express from 'express'
import http from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { config } from './config/env.js'
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
import { ensureObjectStorageBuckets, checkObjectStorageHealth } from './lib/object-storage.js'
import { pool, closePool } from './lib/db.js'
import { disconnectCache, isRedisConnected } from './lib/cache.js'
import {
  getMemorySnapshot,
  shouldExposeMemoryOnHealth,
  startMemoryMonitor,
} from './lib/memory-monitor.js'

if (config.NODE_ENV === 'production') {
  validateProductionConfig()
}

if (config.NODE_ENV !== 'test') {
  try {
    await ensureReservationsSchema()
    await ensureStaffAppSchema()
    await ensureOrderCancellationColumns()
  } catch (error) {
    logger.error('Aborting server startup due to reservations migration failure', {
      error: error.message,
    })
    process.exit(1)
  }

  try {
    const bucketResults = await ensureObjectStorageBuckets()
    logger.info('Object storage buckets ready', {
      buckets: bucketResults.map((r) => r.bucket),
    })
  } catch (error) {
    logger.error('Object storage bucket setup failed — uploads may not work', {
      error: error.message,
      endpoint: config.S3_ENDPOINT,
      bucket: config.S3_BUCKET,
    })
  }
}

const app = express()
const isProduction = config.NODE_ENV === 'production'

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1)

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

// Rate limiting (stricter in production)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 500,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

const staffLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 100,
  message: 'Too many staff portal link requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

// Stricter limits for sensitive endpoints (TODO: replace with Redis-backed limiter in production)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 60 : 200,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})
const chatSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // chat send per IP
  message: 'Too many messages sent, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

const skipReadOnlyRequests = (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)

const ordersWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 120 : 500,
  message: 'Too many order requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipReadOnlyRequests,
})

const promotionsWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 80 : 400,
  message: 'Too many promotion requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipReadOnlyRequests,
})

app.use('/auth', authLimiter)
app.use('/api/public', publicLimiter)
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Session configuration (PostgreSQL store for OAuth state across instances)
const sessionStore = createSessionStore()

app.use(
  session({
    store: sessionStore,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax', // Use 'lax' for development with localhost
    },
  })
)

// Request context + one log line per HTTP request
app.use(requestContext)
app.use(requestLogger)

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

// Health check endpoint
app.get('/health', async (req, res) => {
  const storage = await checkObjectStorageHealth()
  const ok = storage.ok
  const payload = {
    ok,
    status: ok ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    storage,
    requestId: req.requestId,
  }

  if (shouldExposeMemoryOnHealth()) {
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
app.use('/api/branches', branchesRoutes)
app.use('/api/org', orgRoutes)
app.use('/api/org/invitations', branchInvitationsRoutes)
app.use('/api/restaurant-org', restaurantOrgRoutes)
app.use('/api/restaurants/invitations', restaurantInvitationsRoutes)
app.use('/api/public/invitations', branchInvitationsPublicRoutes)
app.use('/api/warehouses', warehousesRoutes)
app.use('/api/fulfillment', fulfillmentRoutes)
app.use('/api/drivers', driversRoutes)

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

// Initialize Socket.IO
initializeSocket(server)

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

server.listen(PORT, () => {
  stopMemoryMonitor = startMemoryMonitor()
  logger.info({
    msg: `Server started on port ${PORT}`,
    port: PORT,
    env: config.NODE_ENV,
    webOrigin: config.WEB_ORIGIN,
  })

  // Start scheduled orders cron job
  // Run every 5 minutes to check for scheduled orders (for testing)
  const CRON_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

  // Run immediately on startup
  executeScheduledOrders().catch((err) => {
    logger.error('Error in initial scheduled orders execution:', err)
  })

  trackInterval(() => {
    executeScheduledOrders().catch((err) => {
      logger.error('Error in scheduled orders execution:', err)
    })
  }, CRON_INTERVAL)

  logger.info('Scheduled orders cron job started (runs every 5 minutes for testing)')

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

  checkOverdueInvoices().catch((err) => logger.error('Invoice overdue job failed on startup:', err))
  trackInterval(
    () => {
      checkOverdueInvoices().catch((err) => logger.error('Invoice overdue job failed:', err))
    },
    24 * 60 * 60 * 1000
  )
  logger.info('Invoice overdue job started (runs every 24h)')

  runSubscriptionBillingJob().catch((err) =>
    logger.error('Subscription billing job failed on startup:', err)
  )
  trackInterval(
    () => {
      runSubscriptionBillingJob().catch((err) =>
        logger.error('Subscription billing job failed:', err)
      )
    },
    60 * 60 * 1000
  )
  logger.info('Subscription billing job started (runs every 1h)')

  const WAITLIST_OFFER_INTERVAL = 15 * 60 * 1000
  checkExpiredWaitlistOffers().catch((err) =>
    logger.error('Waitlist expired-offers job failed on startup:', err)
  )
  trackInterval(() => {
    checkExpiredWaitlistOffers().catch((err) =>
      logger.error('Waitlist expired-offers job failed:', err)
    )
  }, WAITLIST_OFFER_INTERVAL)
  logger.info('Waitlist expired-offers job started (runs every 15 minutes)')

  runDeactivateExpiredPromotionsJob().catch((err) =>
    logger.error('Promotions expiry job failed on startup:', err)
  )
  trackInterval(
    () => {
      runDeactivateExpiredPromotionsJob().catch((err) =>
        logger.error('Promotions expiry job failed:', err)
      )
    },
    30 * 60 * 1000
  )
  logger.info('Promotions expiry job started (runs every 30 min)')

  const runInvitationExpiry = () =>
    Promise.all([expireOldBranchInvitations(), expireOldRestaurantInvitations()]).catch((err) =>
      logger.error('Invitation expiry job failed:', err)
    )
  runInvitationExpiry()
  trackInterval(runInvitationExpiry, 60 * 60 * 1000)
  logger.info('Invitation expiry job started (runs every 1h)')

  runFreeSandboxExpiryJob().catch((err) =>
    logger.error('Free sandbox expiry job failed on startup:', err)
  )
  trackInterval(
    () => {
      runFreeSandboxExpiryJob().catch((err) =>
        logger.error('Free sandbox expiry job failed:', err)
      )
    },
    60 * 60 * 1000
  )
  logger.info('Free sandbox expiry job started (runs every 1h)')

  runFulfillmentExceptionChecks().catch((err) =>
    logger.error('Fulfillment exceptions job failed on startup:', err)
  )
  trackInterval(
    () => {
      runFulfillmentExceptionChecks().catch((err) =>
        logger.error('Fulfillment exceptions job failed:', err)
      )
    },
    30 * 60 * 1000
  )
  logger.info('Fulfillment exceptions job started (runs every 30 min)')
})

export default app
