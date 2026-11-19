import { describe, expect, it } from 'vitest'
import type { Entitlements } from '../types'
import { isDefaultOnFeatureEnabled, NAV_HREF_DEFAULT_ON_FEATURE } from './planFeatureGates'

function ent(features: Record<string, unknown>): Entitlements {
  return { features } as unknown as Entitlements
}

describe('isDefaultOnFeatureEnabled', () => {
  it('is on while entitlements are loading or the key is absent', () => {
    expect(isDefaultOnFeatureEnabled(undefined, 'reservations')).toBe(true)
    expect(isDefaultOnFeatureEnabled(ent({}), 'reservations')).toBe(true)
  })

  it('follows the resolved value when present', () => {
    expect(isDefaultOnFeatureEnabled(ent({ reservations: true }), 'reservations')).toBe(true)
    expect(isDefaultOnFeatureEnabled(ent({ reservations: false }), 'reservations')).toBe(false)
  })

  it('maps nav hrefs to default-on keys', () => {
    expect(NAV_HREF_DEFAULT_ON_FEATURE['/app/reservations']).toBe('reservations')
    expect(NAV_HREF_DEFAULT_ON_FEATURE['/app/quote-requests/supplier']).toBe('quote_requests')
  })
})
