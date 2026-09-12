import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendNotificationMock = vi.fn()
const setVapidDetailsMock = vi.fn()

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args) => setVapidDetailsMock(...args),
    sendNotification: (...args) => sendNotificationMock(...args),
  },
}))

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
