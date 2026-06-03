import { describe, expect, it } from 'vitest'
import {
  buildLegalAcceptancePayload,
  LEGAL_PACK_VERSION,
  requiredInviteSlugs,
  requiredRegistrationSlugs,
} from './legalDocuments'

describe('legalDocuments', () => {
  it('lists restaurant registration documents', () => {
    const slugs = requiredRegistrationSlugs('RESTAURANT')
    expect(slugs).toContain('restaurant_agreement')
    expect(slugs).toContain('mobile_app_terms')
    expect(slugs).toHaveLength(7)
  })

  it('lists invite documents without role or mobile terms', () => {
    const slugs = requiredInviteSlugs()
    expect(slugs).not.toContain('restaurant_agreement')
    expect(slugs).not.toContain('mobile_app_terms')
    expect(slugs).toHaveLength(5)
  })

  it('builds acceptance payload with pack version', () => {
    const payload = buildLegalAcceptancePayload(new Set(requiredInviteSlugs()))
    expect(payload.packVersion).toBe(LEGAL_PACK_VERSION)
    expect(payload.electronicSignatureAttestation).toBe(true)
    expect(payload.acceptedDocuments).toHaveLength(5)
  })
})
