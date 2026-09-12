import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendNotificationMock = vi.fn()
const setVapidDetailsMock = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args) => setVapidDetailsMock(...args),
    sendNotification: (...args) => sendNotificationMock(...args),
  },
}))

const expoSendPushNotificationsMock = vi.fn()
const expoGetPushReceiptsMock = vi.fn()
const expoChunkMessagesMock = vi.fn((messages) => [messages])
const expoChunkReceiptIdsMock = vi.fn((ids) => [ids])

vi.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(token) {
      return typeof token === 'string' && /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token)
    }

    chunkPushNotifications(messages) {
      return expoChunkMessagesMock(messages)
    }

    chunkPushNotificationReceiptIds(ids) {
      return expoChunkReceiptIdsMock(ids)
    }

    sendPushNotificationsAsync(messages) {
      return expoSendPushNotificationsMock(messages)
    }

    getPushNotificationReceiptsAsync(ids) {
      return expoGetPushReceiptsMock(ids)
    }
  }

  return { Expo }
})

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../config/env.js', () => ({
  config: {
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    VAPID_EMAIL: 'push@example.com',
  },
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('Push Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    sendNotificationMock.mockReset()
    expoSendPushNotificationsMock.mockReset()
    expoGetPushReceiptsMock.mockReset()
    expoChunkMessagesMock.mockImplementation((messages) => [messages])
    expoChunkReceiptIdsMock.mockImplementation((ids) => [ids])
    vi.resetModules()
  })

  it('buildPushPayload includes title, body, and url', async () => {
    const { buildPushPayload } = await import('./push.service.js')
    const payload = JSON.parse(
      buildPushPayload({
        title: 'New order',
        message: 'Order #abc',
        url: '/app/orders/abc',
        referenceId: 'abc',
        referenceType: 'ORDER',
      })
    )
    expect(payload.title).toBe('New order')
    expect(payload.body).toBe('Order #abc')
    expect(payload.url).toBe('/app/orders/abc')
  })

  it('deletes stale subscription on 410 response', async () => {
    sendNotificationMock.mockRejectedValue({ statusCode: 410, message: 'Gone' })
    queryMock.mockResolvedValue({ rowCount: 1 })

    const { sendPushToSubscription } = await import('./push.service.js')
    const result = await sendPushToSubscription(
      {
        id: 'sub-1',
        endpoint: 'https://push.example/1',
        p256dh: 'key',
        auth: 'auth',
      },
      '{"title":"Hi"}'
    )

    expect(result.sent).toBe(false)
    expect(result.reason).toBe('STALE')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['sub-1']
    )
  })

  it('savePushSubscription upserts subscription row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
    const { savePushSubscription } = await import('./push.service.js')
    const row = await savePushSubscription('user-1', {
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'k', auth: 'a' },
    })
    expect(row.id).toBe('sub-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_subscriptions'),
      expect.arrayContaining(['user-1', 'https://push.example/1'])
    )
    const [sql] = queryMock.mock.calls[0]
    expect(sql).toContain('ON CONFLICT (endpoint)')
    expect(sql).toContain('user_id = EXCLUDED.user_id')
  })

  it('removePushSubscription deletes by user and endpoint', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 })
    const { removePushSubscription } = await import('./push.service.js')
    const removed = await removePushSubscription('user-1', 'https://push.example/1')
    expect(removed).toBe(true)
  })

  it('saveExpoPushDevice stores expo token in push_subscriptions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
    const { saveExpoPushDevice } = await import('./push.service.js')
    const row = await saveExpoPushDevice('user-1', {
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
    })
    expect(row.id).toBe('device-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_subscriptions'),
      ['user-1', 'expo:ExponentPushToken[abc]', 'expo', 'ios', null]
    )
    const [sql] = queryMock.mock.calls[0]
    expect(sql).toContain('ON CONFLICT (endpoint)')
    expect(sql).toContain('user_id = EXCLUDED.user_id')
  })

  it('removeExpoPushDevice deletes by expo endpoint', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 })
    const { removeExpoPushDevice } = await import('./push.service.js')
    const removed = await removeExpoPushDevice('user-1', 'ExponentPushToken[abc]')
    expect(removed).toBe(true)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['user-1', 'expo:ExponentPushToken[abc]']
    )
  })

  it('sendWebPushToUser skips expo device subscriptions', async () => {
    sendNotificationMock.mockResolvedValue(undefined)
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 'expo-1', endpoint: 'expo:ExponentPushToken[abc]', p256dh: 'expo', auth: 'ios' },
        { id: 'web-1', endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' },
      ],
    })
    const { sendWebPushToUser } = await import('./push.service.js')
    const result = await sendWebPushToUser({
      userId: 'user-1',
      title: 'Hi',
      message: 'There',
    })
    expect(result.sent).toBe(1)
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('buildExpoPushMessage only emits Expo-supported fields', async () => {
    const { buildExpoPushMessage } = await import('./push.service.js')
    const message = buildExpoPushMessage({
      token: 'ExponentPushToken[abc]',
      title: 'New message',
      body: 'A restaurant sent you a message',
      data: { notification_type: 'MESSAGE' },
      url: '/app/chat',
    })

    expect(message).toEqual(
      expect.objectContaining({
        to: 'ExponentPushToken[abc]',
        title: 'New message',
        sound: 'default',
        priority: 'high',
        channelId: 'supplify-alerts',
        badge: 1,
      })
    )
    expect(message.data).toEqual({
      notification_type: 'MESSAGE',
      url: '/app/chat',
    })
    expect(message).not.toHaveProperty('_subscriptionId')
  })

  it('sends valid Expo messages and maps accepted tickets to receipts', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'expo-sub-1',
          endpoint: 'expo:ExponentPushToken[abc]',
          platform: 'android',
        },
      ],
    })
    expoSendPushNotificationsMock.mockResolvedValueOnce([{ status: 'ok', id: 'ticket-1' }])

    const { sendExpoPushToUser } = await import('./push.service.js')
    const result = await sendExpoPushToUser('user-1', {
      title: 'New message',
      body: 'Hello',
      data: { reference_type: 'CONVERSATION', reference_id: 'conv-1' },
      url: '/app/chat',
      notificationId: 'notif-1',
    })

    expect(result).toEqual({ sent: 1, failed: 0, total: 1 })
    expect(expoSendPushNotificationsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[abc]',
        data: expect.objectContaining({ reference_id: 'conv-1' }),
      }),
    ])
  })

  it('marks successful Expo receipts and removes stale devices', async () => {
    expoGetPushReceiptsMock.mockResolvedValueOnce({
      'ticket-ok': { status: 'ok' },
      'ticket-stale': {
        status: 'error',
        message: 'No longer registered',
        details: { error: 'DeviceNotRegistered' },
      },
    })
    queryMock.mockResolvedValue({ rowCount: 1 })

    const { reconcileExpoPushReceipts } = await import('./push.service.js')
    const result = await reconcileExpoPushReceipts([
      {
        ticketId: 'ticket-ok',
        subscriptionId: 'sub-ok',
        notificationId: 'notif-1',
      },
      {
        ticketId: 'ticket-stale',
        subscriptionId: 'sub-stale',
        notificationId: 'notif-2',
      },
    ])

    expect(result).toEqual({ delivered: 1, failed: 1, pending: [] })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      [['sub-stale']]
    )
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notification_log SET push_sent = true'),
      [['notif-1']]
    )
  })

  it('rejects malformed Expo push tokens before writing', async () => {
    const { saveExpoPushDevice } = await import('./push.service.js')
    await expect(
      saveExpoPushDevice('user-1', { token: 'not-a-token', platform: 'android' })
    ).rejects.toThrow('Invalid expo push device payload')
    expect(queryMock).not.toHaveBeenCalled()
  })
  it('treats CHANGE_ME placeholders as not configured', async () => {
    vi.doMock('../config/env.js', () => ({
      config: {
        VAPID_PUBLIC_KEY: 'CHANGE_ME',
        VAPID_PRIVATE_KEY: 'CHANGE_ME',
        VAPID_EMAIL: 'notifications@supplify.local',
      },
    }))
    const { getVapidPublicKey, isPushConfigured } = await import('./push.service.js')
    expect(getVapidPublicKey()).toBeNull()
    expect(isPushConfigured()).toBe(false)
  })
})
