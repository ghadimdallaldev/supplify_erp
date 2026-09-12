import { describe, it, expect } from 'vitest'
import { resolveAllowedChannels } from './templates.js'

describe('resolveAllowedChannels', () => {
  it('in_app_only → in-app only', () => {
    expect([...resolveAllowedChannels('in_app_only')]).toEqual(['in_app'])
  })

  it('in_app_and_email → in-app + email', () => {
    expect([...resolveAllowedChannels('in_app_and_email')].sort()).toEqual(['email', 'in_app'])
  })

  it('email_and_whatsapp → in-app + email + whatsapp (no webhook)', () => {
    const channels = resolveAllowedChannels('email_and_whatsapp')
    expect(channels.has('whatsapp')).toBe(true)
    expect(channels.has('webhook')).toBe(false)
  })

  it('email_whatsapp_webhook → adds the webhook channel', () => {
    const channels = resolveAllowedChannels('email_whatsapp_webhook')
    expect(channels.has('email')).toBe(true)
    expect(channels.has('whatsapp')).toBe(true)
    expect(channels.has('webhook')).toBe(true)
  })

  it('unknown/undefined → safe default of in-app only', () => {
    expect([...resolveAllowedChannels(undefined)]).toEqual(['in_app'])
    expect([...resolveAllowedChannels('bogus')]).toEqual(['in_app'])
  })
})
