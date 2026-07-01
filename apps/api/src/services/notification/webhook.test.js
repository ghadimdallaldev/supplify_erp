import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const queryMock = vi.fn()
vi.mock('../../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

describe('notification/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockResolvedValue({ rows: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('buildWebhookRequest signs the body with HMAC when a secret is set', async () => {
    const { buildWebhookRequest } = await import('./webhook.js')
    const { headers, body } = buildWebhookRequest({ hello: 'world' }, 'shhh')
    expect(body).toBe(JSON.stringify({ hello: 'world' }))
    expect(headers['X-Supplify-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('buildWebhookRequest omits the signature header without a secret', async () => {
    const { buildWebhookRequest } = await import('./webhook.js')
    const { headers } = buildWebhookRequest({ hello: 'world' }, null)
    expect(headers['X-Supplify-Signature']).toBeUndefined()
  })

  it('dispatch returns NOT_CONFIGURED when no webhook is configured', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }) // getTenantWebhook
    const { dispatchNotificationWebhook } = await import('./webhook.js')
    const result = await dispatchNotificationWebhook({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      notification: { id: 'n1' },
    })
    expect(result.delivered).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
  })

  it('dispatch skips a disabled webhook', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ url: 'https://hook.test/x', enabled: false, secret: null }],
    })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { dispatchNotificationWebhook } = await import('./webhook.js')
    const result = await dispatchNotificationWebhook({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      notification: { id: 'n1' },
    })
    expect(result.delivered).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('dispatch posts a signed payload and records success', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT') && String(sql).includes('notification_webhook')) {
        return { rows: [{ url: 'https://hook.test/x', enabled: true, secret: 'sec' }] }
      }
      return { rows: [] }
    })
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchSpy)

    const { dispatchNotificationWebhook } = await import('./webhook.js')
    const result = await dispatchNotificationWebhook({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      notification: { id: 'n1', title: 'Hi', message: 'Body', notification_category: 'PLACED' },
    })

    expect(result.delivered).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hook.test/x')
    expect(options.headers['X-Supplify-Signature']).toMatch(/^sha256=/)
    const payload = JSON.parse(options.body)
    expect(payload.type).toBe('notification')
    expect(payload.notification.id).toBe('n1')
    expect(payload.category).toBe('PLACED')
  })

  it('dispatch reports HTTP errors without throwing', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT') && String(sql).includes('notification_webhook')) {
        return { rows: [{ url: 'https://hook.test/x', enabled: true, secret: null }] }
      }
      return { rows: [] }
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const { dispatchNotificationWebhook } = await import('./webhook.js')
    const result = await dispatchNotificationWebhook({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      notification: { id: 'n1' },
    })
    expect(result.delivered).toBe(false)
    expect(result.httpStatus).toBe(500)
  })
})
