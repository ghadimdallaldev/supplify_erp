import { describe, expect, it } from 'vitest'
import { buildBoostStatus, isBoostPricingRow } from './deal-boost.helpers.js'

describe('deal-boost.helpers', () => {
  describe('buildBoostStatus', () => {
    it('returns none when no campaign', () => {
      expect(buildBoostStatus(null)).toEqual({ state: 'none' })
    })

    it('returns active with days remaining', () => {
      const endsAt = new Date(Date.now() + 3 * 86400000).toISOString()
      const status = buildBoostStatus(
        {
          starts_at: new Date(Date.now() - 86400000).toISOString(),
          ends_at: endsAt,
          package_display_name: 'Weekly Boost',
          price_paid: 39,
          pricing_key: 'boost_7_day',
          duration_days: 7,
        },
        { display_name: 'Weekly Boost', pricing_key: 'boost_7_day', duration_days: 7 }
      )
      expect(status.state).toBe('active')
      expect(status.packageName).toBe('Weekly Boost')
      expect(status.pricePaid).toBe(39)
      expect(status.daysRemaining).toBeGreaterThanOrEqual(2)
    })

    it('returns expired when end date passed', () => {
      const status = buildBoostStatus({
        starts_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        ends_at: new Date(Date.now() - 86400000).toISOString(),
        package_display_name: 'Starter Boost',
        price_paid: 9,
      })
      expect(status.state).toBe('expired')
      expect(status.packageName).toBe('Starter Boost')
    })
  })

  describe('isBoostPricingRow', () => {
    it('identifies boost packages', () => {
      expect(isBoostPricingRow({ package_type: 'boost', pricing_key: 'boost_flat' })).toBe(true)
      expect(
        isBoostPricingRow({ package_type: 'activation', pricing_key: 'deal_activation' })
      ).toBe(false)
    })
  })
})
