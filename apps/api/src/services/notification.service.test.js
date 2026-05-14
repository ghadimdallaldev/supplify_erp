import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendNotification,
  notifyGuestReservationConfirmation,
  sendWhatsAppMessage,
} from './notification.service.js'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('./mailer.service.js', () => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
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
      const { sendMail } = await import('./mailer.service.js')

      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs }] })
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', email: 'owner@test.com', phone: '+96170000000' }] })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: '+96170000000' }] })
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
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@test.com',
          subject: 'New Order Received',
        }),
      )
    })

    it('skips notification when preference is disabled', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs, notify_order_new: false }] })
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', email: 'owner@test.com', phone: null }] })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: null }] })

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
      queryMock
        .mockResolvedValueOnce({ rows: [{ ...basePrefs }] })
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', email: 'owner@test.com', phone: '+96176911906' }] })
        .mockResolvedValueOnce({ rows: [{ email: 'owner@test.com', phone: '+96176911906' }] })
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
        String(call[0]).includes('UPDATE notification_log SET metadata'),
      )
      expect(metadataUpdate).toBeTruthy()
      const payload = JSON.parse(metadataUpdate[1][0])
      expect(payload.whatsappUrl).toContain('https://wa.me/96176911906')
    })
  })

  describe('notifyGuestReservationConfirmation', () => {
    it('emails guest when email is provided', async () => {
      const { sendMail } = await import('./mailer.service.js')

      const result = await notifyGuestReservationConfirmation(
        {
          customer_name: 'Sam',
          customer_email: 'sam@example.com',
          party_size: 2,
          scheduled_at: '2026-05-20T18:00:00.000Z',
          status: 'CONFIRMED',
        },
        'Golden Fork',
      )

      expect(sendMail).toHaveBeenCalled()
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
        'Golden Fork',
      )

      expect(result.whatsapp).toBe(true)
      expect(result.whatsappUrl).toContain('https://wa.me/96176911906')
    })
  })

  describe('sendWhatsAppMessage', () => {
    it('returns a wa.me URL instead of sending server-side', async () => {
      const url = await sendWhatsAppMessage('+96176911906', 'Hello')
      expect(url).toBe('https://wa.me/96176911906?text=Hello')
    })
  })
})
