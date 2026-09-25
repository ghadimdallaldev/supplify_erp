import { describe, expect, it } from 'vitest'
import { normalizeZoneCoverage } from './delivery-zone-input.js'

describe('normalizeZoneCoverage', () => {
  it('leaves coverage unchanged when the request only renames the zone', () => {
    expect(normalizeZoneCoverage({ name: 'Downtown' })).toBeNull()
  })

  it('clears radius fields when the zone matches postal codes', () => {
    expect(
      normalizeZoneCoverage({
        zone_type: 'postal_codes',
        postal_codes: '1100, 1200',
        radius_km: 12,
        center_lat: 33.9,
        center_lng: 35.5,
      })
    ).toEqual({
      zone_type: 'postal_codes',
      postal_codes: ['1100', '1200'],
      radius_km: null,
      center_lat: null,
      center_lng: null,
      geometry: null,
      coverage_area_json: null,
    })
  })

  it('clears postal codes when the zone is a radius', () => {
    expect(
      normalizeZoneCoverage({
        zone_type: 'radius',
        postal_codes: ['1100'],
        radius_km: 5,
        center_lat: 33.9,
        center_lng: 35.5,
      })
    ).toMatchObject({
      zone_type: 'radius',
      postal_codes: null,
      radius_km: 5,
      center_lat: 33.9,
      center_lng: 35.5,
    })
  })

  it('rejects a radius zone without a center', () => {
    expect(() => normalizeZoneCoverage({ zone_type: 'radius', radius_km: 5 })).toThrow(
      /center latitude/
    )
  })

  it('rejects a postal zone without codes', () => {
    expect(() => normalizeZoneCoverage({ zone_type: 'postal_codes', postal_codes: [] })).toThrow(
      /postal code/
    )
  })
})
