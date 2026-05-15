import { describe, it, expect } from 'vitest'
import { sendWhatsAppMessage } from './whatsapp.service.js'

describe('whatsapp.service', () => {
  it('returns sent:false with reason NOT_CONFIGURED', async () => {
    const result = await sendWhatsAppMessage({ to: '+971501234567', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NOT_CONFIGURED')
  })

  it('returns sent:false with reason NO_PHONE when no phone provided', async () => {
    const result = await sendWhatsAppMessage({ to: '', message: 'Hello' })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('NO_PHONE')
  })
})
