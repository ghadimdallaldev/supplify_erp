import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock('../config/env.js', () => ({
  config: {
    EMAIL_ENABLED: true,
    EMAIL_LOG_ONLY: false,
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'user',
    SMTP_PASS: 'secret',
    GPS_TRACKING_ENABLED: true,
    GPS_ALLOW_RESTAURANT_LIVE_TRACKING: true,
    GPS_RESTAURANT_SHOW_DRIVER_NAME: true,
    GPS_RESTAURANT_SHOW_DRIVER_PHONE: false,
    GPS_STALE_AFTER_SECONDS: 300,
  },
}))
vi.mock('./billing/billing-service.js', () => ({
  getBillingStatus: vi.fn().mockResolvedValue({ access: { isLocked: false } }),
}))
vi.mock('./feature-flags.js', () => ({
  getEffectiveFeaturesForTenant: vi.fn().mockResolvedValue({ quick_lists: true }),
}))
vi.mock('./org-billing-tenant.js', () => ({
  resolveActiveBillingSubscription: vi.fn().mockResolvedValue({
    billingTenantId: 't1',
    subscription: { status: 'ACTIVE', plan_code: 'gold', plan_name: 'Gold' },
  }),
}))

import { query } from './db.js'
import {
  classifyGpsDeliveryState,
  summarizeGpsDeliveryRows,
  getEmailConfigSummary,
  buildAdminOperationalSummary,
  listAdminEmailDeliveryLogs,
  buildTenantOperationalSnapshot,
} from './admin-operational-metrics.js'
import { buildTrackingPayload } from './delivery-tracking-payload.js'

describe('admin-operational-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('classifyGpsDeliveryState', () => {
    it('returns off when tracking disabled', () => {
      expect(classifyGpsDeliveryState(buildTrackingPayload({ enabled: false }))).toBe('off')
    })
    it('returns noGps without location', () => {
      expect(classifyGpsDeliveryState(buildTrackingPayload({ enabled: true }))).toBe('noGps')
    })
  })

  describe('summarizeGpsDeliveryRows', () => {
    it('counts live deliveries', () => {
      const summary = summarizeGpsDeliveryRows([
        {
          order_id: 'o1',
          latitude: 1,
          longitude: 2,
          recorded_at: new Date(),
          loc_order_id: 'o1',
        },
      ])
      expect(summary.active).toBe(1)
      expect(summary.live).toBe(1)
    })
  })

  describe('getEmailConfigSummary', () => {
    it('does not expose secrets', () => {
      const cfg = getEmailConfigSummary()
      expect(cfg).not.toHaveProperty('SMTP_PASS')
      expect(cfg).not.toHaveProperty('EMAIL_API_KEY')
      expect(cfg.providerConfigured).toBe(true)
    })
  })

  describe('listAdminEmailDeliveryLogs', () => {
    it('redacts recipient emails', async () => {
      query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            tenant_id: null,
            event_type: 'order.placed',
            status: 'failed',
            subject: 'Hi',
            sent_at: null,
            created_at: new Date(),
            recipient: 'secret@example.com',
            error_message: 'timeout',
            tenant_name: null,
          },
        ],
      })
      const result = await listAdminEmailDeliveryLogs({ limit: 10, offset: 0 })
      expect(result.logs[0].recipientRedacted).not.toContain('secret@')
      expect(JSON.stringify(result)).not.toContain('secret@example.com')
    })
  })

  describe('buildTenantOperationalSnapshot', () => {
    it('supplier snapshot has no coordinate history', async () => {
      query.mockImplementation(async (sql) => {
        if (typeof sql === 'string' && sql.includes('FROM drivers')) {
          return { rows: [{ count: 2 }] }
        }
        if (typeof sql === 'string' && sql.includes('driver_assignments')) {
          return { rows: [] }
        }
        if (typeof sql === 'string' && sql.includes('order_fulfillment_issue')) {
          return { rows: [{ count: 0 }] }
        }
        if (typeof sql === 'string' && sql.includes('promotions')) {
          return { rows: [{ count: 0 }] }
        }
        if (typeof sql === 'string' && sql.includes('email_delivery_log')) {
          return { rows: [] }
        }
        return { rows: [] }
      })
      const snap = await buildTenantOperationalSnapshot('sup-1', 'SUPPLIER')
      expect(snap.supplier.driverCount).toBe(2)
      expect(JSON.stringify(snap)).not.toMatch(/"latitude":\s*\[/)
      expect(snap).not.toHaveProperty('pings')
    })
  })

  describe('buildAdminOperationalSummary', () => {
    it('returns warnings array', async () => {
      query.mockResolvedValue({ rows: [{}] })
      const summary = await buildAdminOperationalSummary()
      expect(Array.isArray(summary.warnings)).toBe(true)
      expect(summary.email).toBeDefined()
      expect(summary.gps).toBeDefined()
    })
  })
})
