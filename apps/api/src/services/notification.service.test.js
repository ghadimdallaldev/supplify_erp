import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendNotification,
  notifyGuestReservationConfirmation,
  sendWhatsAppMessage,
  listTenantUserIds,
  notifyTenantUsers,
  getUserNotifications,
  getUnreadNotificationCount,
} from './notification.service.js'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./email/email.service.js', () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue({ sent: true, provider: 'smtp' }),
}))

vi.mock('../lib/subscription.js', () => ({
  getEntitlements: vi.fn(),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('./whatsapp.service.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ sent: false, reason: 'NOT_CONFIGURED' }),
}))

vi.mock('../lib/socket.js', () => ({
  emitNotificationNew: vi.fn(),
}))

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
  })

  const basePrefs = {
    email_enabled: true,
    whatsapp_enabled: true,
    in_app_enabled: true,
    notify_order_new: true,
  }

  describe('sendNotification', () => {
    it('creates a notification and sends email when enabled', async () => {
      const { sendTemplateEmail } = await import('./email/email.service.js')
      const { emitNotificationNew } = await import('../lib/socket.js')
      const { getEntitlements } = await import('../lib/subscription.js')
      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })

      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs }] })
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: '+96170000000' }],
        })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: '+96170000000' }] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'notif-1', title: 'New Order Received', message: 'Order placed' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })

      const notification = await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New Order Received',
        message: 'Order placed',
      })

      expect(notification).toBeDefined()
      expect(sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@test.com',
          subject: 'New Order Received',
        })
      )
      expect(emitNotificationNew).toHaveBeenCalled()
    })

    it('skips notification when preference is disabled', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs, notify_order_new: false }] })
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }],
        })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: null }] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })

      const result = await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New Order Received',
        message: 'Order placed',
      })

      expect(result).toBeNull()
    })

    it('stores WhatsApp deep link in metadata when whatsapp is enabled', async () => {
      const { getEntitlements } = await import('../lib/subscription.js')
      getEntitlements.mockResolvedValue({ features: { notifications: 'email_and_whatsapp' } })

      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs }] })
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: '+96176911906' }],
        })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: '+96176911906' }] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'notif-1', title: 'Low stock', message: 'Restock soon' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })

      await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'INVENTORY',
        notificationCategory: 'low_stock',
        title: 'Low stock',
        message: 'Restock soon',
      })

      const metadataUpdate = queryMock.mock.calls.find((call) =>
        String(call[0]).includes('UPDATE notification_log SET metadata')
      )
      expect(metadataUpdate).toBeTruthy()
      const payload = JSON.parse(metadataUpdate[1][0])
      expect(payload.whatsappUrl).toContain('https://wa.me/96176911906')
    })

    it('does NOT send email when tenant is on Free plan', async () => {
      const { sendTemplateEmail } = await import('./email/email.service.js')
      const { getEntitlements } = await import('../lib/subscription.js')

      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_only' } })

      queryMock
        .mockResolvedValueOnce({
          rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }],
        }) // prefs
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }],
        }) // getUserContactInfo tenant
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] }) // contact_info table
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] }) // getTenantIdForUser
        .mockResolvedValueOnce({
          rows: [{ id: 'notif-1', title: 'New Order Received', message: 'Order placed' }],
        }) // INSERT notification_log
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE notification_log

      await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New Order',
        message: 'Order placed',
      })

      expect(sendTemplateEmail).not.toHaveBeenCalled()
    })

    it('sends email when tenant is on Silver plan', async () => {
      const { sendTemplateEmail } = await import('./email/email.service.js')
      const { getEntitlements } = await import('../lib/subscription.js')

      sendTemplateEmail.mockResolvedValue({ sent: true })
      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_and_email' } })

      queryMock
        .mockResolvedValueOnce({
          rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }],
        })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'notif-1', title: 'New Order' }] })
        .mockResolvedValueOnce({ rowCount: 1 })

      await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New Order',
        message: 'Order placed',
      })

      expect(sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@test.com' })
      )
    })

    it('defaults to in_app_only when entitlements fetch fails', async () => {
      const { sendTemplateEmail } = await import('./email/email.service.js')
      const { getEntitlements } = await import('../lib/subscription.js')

      getEntitlements.mockRejectedValue(new Error('DB error'))

      queryMock
        .mockResolvedValueOnce({
          rows: [{ email_enabled: true, in_app_enabled: true, notify_order_new: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1', email: 'owner@test.com', phone: null }],
        })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'notif-1', title: 'New Order' }] })
        .mockResolvedValueOnce({ rowCount: 1 })

      await sendNotification({
        userId: 'user-1',
        userType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New Order',
        message: 'Order placed',
      })

      expect(sendTemplateEmail).not.toHaveBeenCalled()
    })
  })

  describe('notifyGuestReservationConfirmation', () => {
    it('emails guest when email is provided', async () => {
      const { sendTemplateEmail } = await import('./email/email.service.js')

      const result = await notifyGuestReservationConfirmation(
        {
          customer_name: 'Sam',
          customer_email: 'sam@example.com',
          party_size: 2,
          scheduled_at: '2026-05-20T18:00:00.000Z',
          status: 'CONFIRMED',
        },
        'Golden Fork'
      )

      expect(sendTemplateEmail).toHaveBeenCalled()
      expect(result.email).toBe(true)
    })

    it('returns wa.me link for guest phone', async () => {
      const result = await notifyGuestReservationConfirmation(
        {
          customer_name: 'Sam',
          customer_phone: '+96176911906',
          party_size: 2,
          scheduled_at: '2026-05-20T18:00:00.000Z',
          status: 'CONFIRMED',
        },
        'Golden Fork'
      )

      expect(result.whatsapp).toBe(true)
      expect(result.whatsappUrl).toContain('https://wa.me/96176911906')
    })
  })

  describe('listTenantUserIds', () => {
    it('returns distinct user ids for tenant roles and contact email', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      })

      const ids = await listTenantUserIds('rest-1', 'RESTAURANT')
      expect(ids).toEqual(['user-1', 'user-2'])
      expect(String(queryMock.mock.calls[0][0])).toContain('tenant_user_roles')
    })
  })

  describe('notifyTenantUsers', () => {
    it('fans out to every tenant user', async () => {
      const { getEntitlements } = await import('../lib/subscription.js')
      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_only' } })

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'user-a' }, { id: 'user-b' }] })
        .mockResolvedValue({
          rows: [{ ...basePrefs, in_app_enabled: true, notify_order_new: true }],
        })

      const sent = await notifyTenantUsers({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New order',
        message: 'Order placed',
        referenceId: 'order-1',
        referenceType: 'ORDER',
      })

      expect(sent.length).toBeGreaterThan(0)
      expect(sent.recipientCount).toBe(2)
      expect(sent.failedCount).toBe(0)
      expect(typeof sent.durationMs).toBe('number')
    })

    it('isolates per-user failures and reports failedCount', async () => {
      queryMock.mockImplementation(async (sql, params) => {
        if (String(sql).includes('tenant_user_roles')) {
          return { rows: [{ id: 'user-a' }, { id: 'user-b' }, { id: 'user-c' }] }
        }
        if (params?.[0] === 'user-b' && String(sql).includes('notification_preferences')) {
          throw new Error('prefs unavailable')
        }
        if (String(sql).includes('INSERT INTO notification_log')) {
          return { rows: [{ id: `notif-${params[0]}`, user_id: params[0] }] }
        }
        if (String(sql).includes('FROM restaurant')) {
          return { rows: [{ tenant_id: 'rest-1', email: 'owner@test.com', phone: null }] }
        }
        if (String(sql).includes('restaurant_contact_info')) {
          return { rows: [{ email: 'owner@test.com', phone: null }] }
        }
        if (String(sql).includes('tenant_id')) {
          return { rows: [{ tenant_id: 'rest-1' }] }
        }
        return { rows: [{ ...basePrefs }] }
      })

      const { getEntitlements } = await import('../lib/subscription.js')
      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_only' } })

      const sent = await notifyTenantUsers({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New order',
        message: 'Order placed',
        referenceId: 'order-1',
        referenceType: 'ORDER',
      })

      expect(sent.recipientCount).toBe(3)
      expect(sent.failedCount).toBe(1)
      expect(sent.length).toBe(2)
    })

    it('keeps array return shape for callers using sent[0]', async () => {
      const { getEntitlements } = await import('../lib/subscription.js')
      getEntitlements.mockResolvedValue({ features: { notifications: 'in_app_only' } })

      queryMock.mockResolvedValueOnce({ rows: [{ id: 'user-a' }] }).mockResolvedValue({
        rows: [{ ...basePrefs, in_app_enabled: true, notify_order_new: true }],
      })

      const sent = await notifyTenantUsers({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New order',
        message: 'Order placed',
        referenceId: 'order-1',
        referenceType: 'ORDER',
      })

      expect(Array.isArray(sent)).toBe(true)
      expect(sent[0]).toBeDefined()
      expect(sent.length).toBe(1)
      expect(sent.recipientCount).toBe(1)
    })

    it('uses configured concurrency limit for fan-out', async () => {
      const concurrency = await import('../lib/concurrency.js')
      const mapSpy = vi.spyOn(concurrency, 'mapWithConcurrency')

      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'user-a' }, { id: 'user-b' }],
      })

      mapSpy.mockResolvedValueOnce([
        { ok: true, row: { id: 'n1' } },
        { ok: true, row: { id: 'n2' } },
      ])

      const sent = await notifyTenantUsers({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'New order',
        message: 'Order placed',
      })

      expect(mapSpy).toHaveBeenCalledWith(['user-a', 'user-b'], 5, expect.any(Function))
      expect(sent.length).toBe(2)
      mapSpy.mockRestore()
    })
  })

  describe('sendWhatsAppMessage', () => {
    it('returns a wa.me URL instead of sending server-side', async () => {
      const url = await sendWhatsAppMessage('+96176911906', 'Hello')
      expect(url).toBe('https://wa.me/96176911906?text=Hello')
    })
  })

  describe('getUserNotifications', () => {
    it('fetches list and unread count in parallel and caches the payload', async () => {
      const { getCache, setCache } = await import('../lib/cache.js')
      vi.mocked(getCache).mockResolvedValue(null)

      queryMock.mockImplementation((sql) => {
        if (String(sql).includes('COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: 1 }] })
        }
        return Promise.resolve({
          rows: [{ id: 'n1', title: 'Hi', is_read: false, created_at: new Date().toISOString() }],
        })
      })

      const first = await getUserNotifications('user-1', 'RESTAURANT', { limit: 25, offset: 0 })
      expect(first.notifications).toHaveLength(1)
      expect(first.unreadCount).toBe(1)
      expect(queryMock).toHaveBeenCalledTimes(2)
      expect(setCache).toHaveBeenCalled()

      vi.mocked(getCache).mockResolvedValue(first)
      queryMock.mockClear()
      const second = await getUserNotifications('user-1', 'RESTAURANT', { limit: 25, offset: 0 })
      expect(second).toEqual(first)
      expect(queryMock).not.toHaveBeenCalled()
    })
  })

  describe('getUnreadNotificationCount', () => {
    it('returns cached unread count without hitting the database', async () => {
      const { getCache, setCache } = await import('../lib/cache.js')
      vi.mocked(getCache).mockResolvedValue({ unreadCount: 4 })

      const result = await getUnreadNotificationCount('user-1', 'RESTAURANT')
      expect(result.unreadCount).toBe(4)
      expect(queryMock).not.toHaveBeenCalled()
      expect(setCache).not.toHaveBeenCalled()
    })

    it('queries count on cache miss and stores result', async () => {
      const { getCache, setCache } = await import('../lib/cache.js')
      const { resetSingleflightForTests } = await import('../lib/singleflight.js')
      resetSingleflightForTests()
      vi.mocked(getCache).mockResolvedValue(null)
      queryMock.mockResolvedValueOnce({ rows: [{ count: 2 }] })

      const result = await getUnreadNotificationCount('user-1', 'RESTAURANT')
      expect(result.unreadCount).toBe(2)
      expect(queryMock).toHaveBeenCalledTimes(1)
      expect(setCache).toHaveBeenCalled()
    })
  })
})
