import { describe, it, expect } from 'vitest'
import { resolveBrandingCapabilities, hasBrandingCapability } from './branding-tier.js'

describe('branding-tier', () => {
  it('returns off when disabled', () => {
    const caps = resolveBrandingCapabilities(false)
    expect(caps.enabled).toBe(false)
    expect(caps.capabilities.customDomain).toBe(false)
  })

  it('logo_colors enables branding without custom domain', () => {
    const caps = resolveBrandingCapabilities('logo_colors')
    expect(caps.capabilities.logoAndColors).toBe(true)
    expect(caps.capabilities.customDomain).toBe(false)
  })

  it('white_label_domain enables custom domain', () => {
    expect(hasBrandingCapability('white_label_domain', 'customDomain')).toBe(true)
    expect(hasBrandingCapability('logo_colors', 'customDomain')).toBe(false)
  })
})
