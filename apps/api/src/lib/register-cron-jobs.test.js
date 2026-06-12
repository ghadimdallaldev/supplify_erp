import { describe, it, expect, vi, beforeEach } from 'vitest'

const trackInterval = vi.fn()

vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'development',
    CRONS_ENABLED: true,
    CRON_SCHEDULED_ORDERS_INTERVAL_MS: 300000,
    CRON_OPERATIONAL_REMINDERS_INTERVAL_MS: 86400000,
    CRON_DELIVERY_ROLLOVER_INTERVAL_MS: 3600000,
    CRON_EMAIL_RETRY_INTERVAL_MS: 3600000,
    CRON_EMAIL_DIGEST_INTERVAL_MS: 86400000,
    CRON_STALE_GPS_INTERVAL_MS: 900000,
    CRON_LOG_RETENTION_INTERVAL_MS: 86400000,
    DELIVERY_ROLLOVER_ENABLED: false,
  },
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('./cron-runner.js', () => ({
  CRON_JOBS: {
    SCHEDULED_ORDERS: 'scheduled_orders',
    INVOICE_OVERDUE: 'invoice_overdue',
    SUBSCRIPTION_BILLING: 'subscription_billing',
    WAITLIST_OFFERS: 'waitlist_offers',
    PROMOTIONS_EXPIRY: 'promotions_expiry',
    INVITATION_EXPIRY: 'invitation_expiry',
    FREE_SANDBOX_EXPIRY: 'free_sandbox_expiry',
    TRIAL_ENDING_SOON: 'trial_ending_soon',
    FULFILLMENT_EXCEPTIONS: 'fulfillment_exceptions',
    DELIVERY_ROLLOVER: 'delivery_rollover',
    OPERATIONAL_REMINDERS: 'operational_reminders',
    DRIVER_LOCATION_RETENTION: 'driver_location_retention',
    EMAIL_RETRY: 'email_retry',
    EMAIL_DIGEST: 'email_digest',
    STALE_GPS_ALERTS: 'stale_gps_alerts',
    LOG_RETENTION: 'log_retention',
  },
  runCronJob: vi.fn(async (_name, fn) => {
    await fn()
    return { ran: true }
  }),
}))

vi.mock('../services/scheduled-orders.service.js', () => ({
  executeScheduledOrders: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/invoice-overdue.job.js', () => ({
  checkOverdueInvoices: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/subscription-billing.job.js', () => ({
  runSubscriptionBillingJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../services/waitlistPromotion.js', () => ({
  checkExpiredWaitlistOffers: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/promotions-expiry.job.js', () => ({
  runDeactivateExpiredPromotionsJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/free-sandbox-expiry.job.js', () => ({
  runFreeSandboxExpiryJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/trial-ending-soon.job.js', () => ({
  runTrialEndingSoonJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/fulfillment-exceptions.job.js', () => ({
  runFulfillmentExceptionChecks: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/delivery-rollover.job.js', () => ({
  runDeliveryRolloverCron: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/operational-reminders.job.js', () => ({
  runOperationalRemindersJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/driver-location-retention.job.js', () => ({
  runDriverLocationRetentionJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/email-retry.job.js', () => ({
  runEmailRetryJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/email-digest.job.js', () => ({
  runEmailDigestJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/stale-gps-alerts.job.js', () => ({
  runStaleGpsAlertsJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('../jobs/log-retention.job.js', () => ({
  runLogRetentionJob: vi.fn().mockResolvedValue({}),
}))
vi.mock('./branch-invitations.js', () => ({
  expireOldBranchInvitations: vi.fn().mockResolvedValue(0),
}))
vi.mock('./restaurant-invitations.js', () => ({
  expireOldRestaurantInvitations: vi.fn().mockResolvedValue(0),
}))

describe('registerCronJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers 17 cron jobs in non-test environments', async () => {
    const { registerCronJobs } = await import('./register-cron-jobs.js')
    const result = registerCronJobs({ trackInterval })
    expect(result).toEqual({ registered: 17, skipped: false })
    expect(trackInterval).toHaveBeenCalledTimes(17)
  })
})

describe('shouldRegisterCrons', () => {
  it('returns false for test environment', async () => {
    const { shouldRegisterCrons } = await import('./register-cron-jobs.js')
    expect(shouldRegisterCrons('test')).toBe(false)
    expect(shouldRegisterCrons('development')).toBe(true)
  })
})
