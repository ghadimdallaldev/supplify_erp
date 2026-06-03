import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'test-token',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
  },
}))

describe('twilio-client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    const mod = await import('./twilio-client.js')
    mod.__resetTwilioClientForTests()
  })

  it('formatE164 adds plus prefix', async () => {
    const { formatE164 } = await import('./twilio-client.js')
    expect(formatE164('+961 76 911 906')).toBe('+96176911906')
  })

  it('formatWhatsAppAddress prefixes whatsapp:', async () => {
    const { formatWhatsAppAddress } = await import('./twilio-client.js')
    expect(formatWhatsAppAddress('96176911906')).toBe('whatsapp:+96176911906')
  })

  it('getTwilioWhatsAppFrom normalizes bare E.164', async () => {
    vi.doMock('../config/env.js', () => ({
      config: {
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_WHATSAPP_FROM: '+14155238886',
      },
    }))
    const { getTwilioWhatsAppFrom } = await import('./twilio-client.js')
    expect(getTwilioWhatsAppFrom()).toBe('whatsapp:+14155238886')
  })
})
