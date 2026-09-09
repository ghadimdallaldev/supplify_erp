import { describe, expect, it } from 'vitest'
import {
  businessTypeMatches,
  buildBoostTargetAudienceFromDeal,
  buildLocationHaystack,
  locationMatchesAreas,
  normalizeBusinessType,
  restaurantRowForTargeting,
} from './restaurant-targeting.js'

describe('restaurant-targeting', () => {
  it('normalizes legacy restaurant → casual_dining', () => {
    expect(normalizeBusinessType('restaurant')).toBe('casual_dining')
    expect(normalizeBusinessType('Fine Dining')).toBe('fine_dining')
  })

  it('matches business types with aliases', () => {
    expect(businessTypeMatches(['casual_dining'], 'restaurant')).toBe(true)
    expect(businessTypeMatches(['fine_dining'], 'restaurant')).toBe(false)
    expect(businessTypeMatches([], 'cafe')).toBe(true)
  })

  it('matches areas using city, area, and region', () => {
    const restaurant = restaurantRowForTargeting({
      id: 'r1',
      business_type: 'cafe',
      address_json: {
        street: 'Hamra St',
        city: 'Beirut',
        area: 'Hamra',
        region: 'Beirut Governorate',
        country: 'Lebanon',
      },
      delivery_location_label: 'Door B',
    })
    expect(locationMatchesAreas(['Hamra'], restaurant)).toBe(true)
    expect(locationMatchesAreas(['Beirut'], restaurant)).toBe(true)
    expect(locationMatchesAreas(['Dubai'], restaurant)).toBe(false)
    expect(buildLocationHaystack(restaurant)).toContain('hamra')
  })

  it('builds boost audience from deal targeting columns', () => {
    expect(buildBoostTargetAudienceFromDeal({})).toEqual({ all: true })
    expect(
      buildBoostTargetAudienceFromDeal({
        target_restaurant_types: ['cafe'],
        target_areas: ['Beirut'],
      })
    ).toEqual({
      all: false,
      restaurantTypes: ['cafe'],
      areas: ['Beirut'],
    })
  })
})
