import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

describe('whatsapp.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns sent:false with reason NO_PHONE when no phone provided', async () => {
    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({ to: '', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_PHONE')
  })

  it('returns sent:false with reason NO_MESSAGE when message is empty', async () => {
    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: '  ' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_MESSAGE')
  })

  it('returns sent:false with reason NOT_CONFIGURED until Meta API is wired', async () => {
    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({
      to: '+971501234567',
      message: 'Your order shipped',
    })

    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
  })
})
