import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
const mockConfig = vi.hoisted(() => ({
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
  AI_ENABLED: false,
  AI_PROVIDER: 'openai',
  AI_MODEL: 'gpt-4o-mini',
  OPENAI_API_KEY: '',
}))

vi.mock('../config/env.js', () => ({
  config: mockConfig,
}))

vi.mock('./ai-platform.js', () => ({
  isAiEnvEnabled: vi.fn(() => mockConfig.AI_ENABLED && Boolean(mockConfig.OPENAI_API_KEY)),
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
  getAiPlatformConfigSummary,
  getAiReorderMetrics,
  buildAdminOperationalSummary,
  listAdminEmailDeliveryLogs,
  buildTenantOperationalSnapshot,
} from './admin-operational-metrics.js'
import { buildTrackingPayload } from './delivery-tracking-payload.js'

describe('admin-operational-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.AI_ENABLED = false
    mockConfig.OPENAI_API_KEY = ''
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

  describe('getAiPlatformConfigSummary', () => {
    it('does not expose API keys', () => {
      mockConfig.OPENAI_API_KEY = 'sk-secret'
      const cfg = getAiPlatformConfigSummary()
      expect(cfg).not.toHaveProperty('OPENAI_API_KEY')
      expect(JSON.stringify(cfg)).not.toContain('sk-secret')
      expect(cfg).toMatchObject({
        enabled: false,
        provider: 'openai',
        model: 'gpt-4o-mini',
        envReady: false,
      })
    })

    it('reports envReady when AI is enabled with provider key', () => {
      mockConfig.AI_ENABLED = true
      mockConfig.OPENAI_API_KEY = 'sk-test'
      const cfg = getAiPlatformConfigSummary()
      expect(cfg.envReady).toBe(true)
      expect(cfg.enabled).toBe(true)
    })
  })

  describe('getAiReorderMetrics', () => {
    it('returns zeroed metrics when log table is empty', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ total: 0, success_count: 0, failed_count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
      const metrics = await getAiReorderMetrics()
      expect(metrics).toEqual({
        totalRequests: 0,
        successRate: null,
        failedCount: 0,
        topRestaurants: [],
      })
    })

    it('returns zeroed metrics when reorder_ai_request_log is missing (42P01)', async () => {
      const err = new Error('relation does not exist')
      err.code = '42P01'
      query.mockRejectedValue(err)
      const metrics = await getAiReorderMetrics()
      expect(metrics.totalRequests).toBe(0)
      expect(metrics.failedCount).toBe(0)
      expect(metrics.successRate).toBeNull()
      expect(metrics.topRestaurants).toEqual([])
    })

    it('computes success rate and top restaurants', async () => {
      query
        .mockResolvedValueOnce({
          rows: [{ total: 10, success_count: 8, failed_count: 2 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              restaurant_id: 'r1',
              restaurant_name: 'Cafe One',
              request_count: 6,
            },
            {
              restaurant_id: 'r2',
              restaurant_name: 'Bistro Two',
              request_count: 4,
            },
          ],
        })

      const metrics = await getAiReorderMetrics()

      expect(metrics.totalRequests).toBe(10)
      expect(metrics.failedCount).toBe(2)
      expect(metrics.successRate).toBe(0.8)
      expect(metrics.topRestaurants).toEqual([
        { restaurantId: 'r1', restaurantName: 'Cafe One', requestCount: 6 },
        { restaurantId: 'r2', restaurantName: 'Bistro Two', requestCount: 4 },
      ])
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
    it('returns warnings array and AI sections', async () => {
      query.mockResolvedValue({ rows: [{}] })
      const summary = await buildAdminOperationalSummary()
      expect(Array.isArray(summary.warnings)).toBe(true)
      expect(summary.email).toBeDefined()
      expect(summary.gps).toBeDefined()
      expect(summary.aiPlatform).toMatchObject({
        enabled: false,
        provider: 'openai',
      })
      expect(summary.aiReorder).toMatchObject({
        totalRequests: expect.any(Number),
        failedCount: expect.any(Number),
        topRestaurants: expect.any(Array),
      })
    })
  })
})
