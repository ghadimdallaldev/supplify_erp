import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

// Delivery logging is best-effort audit only — stub it out so tests never touch the DB.
vi.mock('./whatsapp/whatsapp-delivery-log.js', () => ({
  logWhatsAppDelivery: vi.fn().mockResolvedValue(undefined),
}))

const ORIGINAL_ENV = { ...process.env }

async function loadService(env = {}) {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...env }
  return import('./whatsapp.service.js')
}

describe('whatsapp.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('returns NO_PHONE when no phone provided', async () => {
    const { sendWhatsAppMessage } = await loadService({ WHATSAPP_ENABLED: 'true' })
    const result = await sendWhatsAppMessage({ to: '', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_PHONE')
  })

  it('returns NO_MESSAGE when message is empty', async () => {
    const { sendWhatsAppMessage } = await loadService({ WHATSAPP_ENABLED: 'true' })
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: '  ' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_MESSAGE')
  })

  it('is DISABLED by default (WHATSAPP_ENABLED unset)', async () => {
    const { sendWhatsAppMessage } = await loadService({ WHATSAPP_ENABLED: 'false' })
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hi' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('DISABLED')
  })

  it('returns NOT_CONFIGURED when enabled without credentials', async () => {
    const { sendWhatsAppMessage } = await loadService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_LOG_ONLY: 'false',
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
    })
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Order shipped' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
  })

  it('counts as sent in log-only mode without calling the network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sendWhatsAppMessage } = await loadService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_LOG_ONLY: 'true',
    })
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hi there' })
    expect(result.sent).toBe(true)
    expect(result.logOnly).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends via Meta Cloud API when fully configured', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.TEST123' }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { sendWhatsAppMessage } = await loadService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_LOG_ONLY: 'false',
      WHATSAPP_ACCESS_TOKEN: 'token-123',
      WHATSAPP_PHONE_NUMBER_ID: '100000000000000',
      WHATSAPP_API_VERSION: 'v21.0',
    })

    const result = await sendWhatsAppMessage({
      to: '+961 76 911 906',
      message: 'Your order shipped',
    })

    expect(result.sent).toBe(true)
    expect(result.messageId).toBe('wamid.TEST123')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v21.0/100000000000000/messages')
    expect(options.headers.Authorization).toBe('Bearer token-123')
    const body = JSON.parse(options.body)
    expect(body.messaging_product).toBe('whatsapp')
    // Normalized to digits without the leading '+'.
    expect(body.to).toBe('96176911906')
    expect(body.text.body).toBe('Your order shipped')
  })

  it('returns PROVIDER_ERROR on a non-OK API response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { sendWhatsAppMessage } = await loadService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_LOG_ONLY: 'false',
      WHATSAPP_ACCESS_TOKEN: 'bad-token',
      WHATSAPP_PHONE_NUMBER_ID: '100000000000000',
    })

    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hi' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('PROVIDER_ERROR')
    expect(result.error).toContain('Invalid OAuth')
  })

  it('returns PROVIDER_ERROR when fetch throws', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchSpy)

    const { sendWhatsAppMessage } = await loadService({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_LOG_ONLY: 'false',
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '100000000000000',
    })

    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hi' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('PROVIDER_ERROR')
    expect(result.error).toContain('network down')
  })
})
