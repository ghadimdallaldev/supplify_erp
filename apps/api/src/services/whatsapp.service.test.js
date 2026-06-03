import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const isTwilioWhatsAppConfigured = vi.fn()
const getTwilioClient = vi.fn()
const formatWhatsAppAddress = vi.fn((phone) => `whatsapp:+${String(phone).replace(/\D/g, '')}`)
const getTwilioWhatsAppFrom = vi.fn(() => 'whatsapp:+14155238886')

vi.mock('../lib/twilio-client.js', () => ({
  isTwilioWhatsAppConfigured,
  getTwilioClient,
  formatWhatsAppAddress,
  getTwilioWhatsAppFrom,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

describe('whatsapp.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTwilioWhatsAppConfigured.mockReturnValue(false)
    getTwilioClient.mockReturnValue({ messages: { create: mockCreate } })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns sent:false with reason NO_PHONE when no phone provided', async () => {
    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({ to: '', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_PHONE')
  })

  it('returns sent:false with reason NOT_CONFIGURED when Twilio is not set up', async () => {
    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('sends via Twilio when configured', async () => {
    isTwilioWhatsAppConfigured.mockReturnValue(true)
    mockCreate.mockResolvedValue({ sid: 'SM123', status: 'queued' })

    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({
      to: '+971501234567',
      message: 'Your order shipped',
    })

    expect(result.sent).toBe(true)
    expect(result.sid).toBe('SM123')
    expect(mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+971501234567',
      body: 'Your order shipped',
    })
  })

  it('returns SEND_FAILED when Twilio throws', async () => {
    isTwilioWhatsAppConfigured.mockReturnValue(true)
    mockCreate.mockRejectedValue(new Error('21608'))

    const { sendWhatsAppMessage } = await import('./whatsapp.service.js')
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hi' })

    expect(result.sent).toBe(false)
    expect(result.reason).toBe('SEND_FAILED')
  })
})
