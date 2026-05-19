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
import { ensureReservationsSchema, ensureStaffAppSchema } from './lib/migrator.js'
import { staffRoutes } from './routes/staff.routes.js'
import { publicRoutes } from './routes/public.routes.js'
import { e2eRoutes } from './routes/e2e.routes.js'
import { fulfillmentRoutes } from './routes/fulfillment.routes.js'
import { approvalsRoutes } from './routes/approvals.routes.js'
import { promotionsRoutes } from './routes/promotions.routes.js'
import { tenantAuditRoutes } from './routes/tenant-audit.routes.js'
import { runDeactivateExpiredPromotionsJob } from './jobs/promotions-expiry.job.js'
import { disputesRoutes } from './routes/disputes.routes.js'
import { creditNotesRoutes } from './routes/credit-notes.routes.js'
import { pushRoutes } from './routes/push.routes.js'
import { reviewsRoutes } from './routes/reviews.routes.js'
import { reportsRoutes } from './routes/reports.routes.js'
import { tenantRolesRoutes } from './routes/tenant-roles.routes.js'

if (config.NODE_ENV === 'production') {
  validateProductionConfig()
}

if (config.NODE_ENV !== 'test') {
  try {
    await ensureReservationsSchema()
    await ensureStaffAppSchema()
  } catch (error) {
    logger.error('Aborting server startup due to reservations migration failure', {
      error: error.message,
    })
    process.exit(1)
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

// Request context middleware
app.use(requestContext)

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
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  })
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
app.use('/api/orders', ordersRoutes)
app.use('/api/approvals', approvalsRoutes)
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
if (config.E2E_SECRET) {
  app.use('/api/e2e', e2eRoutes)
}
app.use('/api/branches', branchesRoutes)
app.use('/api/org', orgRoutes)
app.use('/api/warehouses', warehousesRoutes)
app.use('/api/fulfillment', fulfillmentRoutes)

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

// Initialize Socket.IO
initializeSocket(server)

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  logger.info(`Environment: ${config.NODE_ENV}`)
  logger.info(`Web origin: ${config.WEB_ORIGIN}`)

  // Start scheduled orders cron job
  // Run every 5 minutes to check for scheduled orders (for testing)
  const CRON_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

  // Run immediately on startup
  executeScheduledOrders().catch((err) => {
    logger.error('Error in initial scheduled orders execution:', err)
  })

  // Then run every hour
  setInterval(() => {
    executeScheduledOrders().catch((err) => {
      logger.error('Error in scheduled orders execution:', err)
    })
  }, CRON_INTERVAL)

  logger.info('Scheduled orders cron job started (runs every 5 minutes for testing)')

  checkOverdueInvoices().catch((err) => logger.error('Invoice overdue job failed on startup:', err))
  setInterval(
    () => {
      checkOverdueInvoices().catch((err) => logger.error('Invoice overdue job failed:', err))
    },
    24 * 60 * 60 * 1000
  )
  logger.info('Invoice overdue job started (runs every 24h)')

  runSubscriptionBillingJob().catch((err) =>
    logger.error('Subscription billing job failed on startup:', err)
  )
  setInterval(
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
  setInterval(() => {
    checkExpiredWaitlistOffers().catch((err) =>
      logger.error('Waitlist expired-offers job failed:', err)
    )
  }, WAITLIST_OFFER_INTERVAL)
  logger.info('Waitlist expired-offers job started (runs every 15 minutes)')

  runDeactivateExpiredPromotionsJob().catch((err) =>
    logger.error('Promotions expiry job failed on startup:', err)
  )
  setInterval(
    () => {
      runDeactivateExpiredPromotionsJob().catch((err) =>
        logger.error('Promotions expiry job failed:', err)
      )
    },
    30 * 60 * 1000
  )
  logger.info('Promotions expiry job started (runs every 30 min)')
})

export default app
