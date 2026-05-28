import { describe, expect, it } from 'vitest'
import { matchesRestaurantTargeting, matchesPromotionAudience } from './deal-promotions.service.js'

describe('deal-promotions.service targeting', () => {
  const restaurant = {
    business_type: 'fine_dining',
    city: 'Beirut',
    state: 'Mount Lebanon',
    country: 'Lebanon',
    address: 'Hamra Street',
  }

  describe('matchesRestaurantTargeting', () => {
    it('allows when no type or area filters (RST-75)', () => {
      expect(matchesRestaurantTargeting({}, restaurant)).toBe(true)
    })

    it('filters by restaurant business type', () => {
      const deal = { target_restaurant_types: ['fine_dining'] }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
      expect(
        matchesRestaurantTargeting({ target_restaurant_types: ['fast_food'] }, restaurant)
      ).toBe(false)
    })

    it('filters by geographic areas', () => {
      const deal = { target_areas: ['Beirut'] }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
      expect(matchesRestaurantTargeting({ target_areas: ['Dubai'] }, restaurant)).toBe(false)
    })

    it('parses JSON string targets from DB rows', () => {
      const deal = {
        target_restaurant_types: '["fine_dining"]',
        target_areas: '["Beirut"]',
      }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
    })
  })

  describe('matchesPromotionAudience', () => {
    it('matches all audiences when audience.all is true (RST-76 sponsored)', () => {
      expect(matchesPromotionAudience({ all: true }, restaurant)).toBe(true)
      expect(matchesPromotionAudience(null, restaurant)).toBe(true)
    })

    it('filters boost audience by restaurant type and area', () => {
      expect(
        matchesPromotionAudience(
          { restaurantTypes: ['fine_dining'], areas: ['Beirut'] },
          restaurant
        )
      ).toBe(true)
      expect(
        matchesPromotionAudience({ restaurantTypes: ['cafe'], areas: ['Beirut'] }, restaurant)
      ).toBe(false)
    })
  })
})
