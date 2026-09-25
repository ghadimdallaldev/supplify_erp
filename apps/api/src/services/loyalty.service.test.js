import { describe, expect, it } from 'vitest'
import {
  computeEarnPoints,
  consumerLoyaltyEarnBasis,
  quoteConsumerLoyaltyRedeem,
  reverseConsumerLoyaltyOnOrderCancel,
  suggestConsumerRedeemPoints,
} from './loyalty.service.js'

function scriptedClient(steps) {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params })
      const next = steps.shift()
      return next || { rows: [] }
    },
  }
}

describe('consumer loyalty earn basis', () => {
  it('earns on the bill after a rewards discount', () => {
    const program = {
      enabled: true,
      earn_points_per_currency: 1,
      rules_json: { fulfillment_multipliers: { TAKEAWAY: 1 } },
    }
    const basis = consumerLoyaltyEarnBasis(40, 10)
    expect(basis).toBe(30)
    expect(computeEarnPoints(program, basis, { fulfillmentType: 'TAKEAWAY' })).toBe(30)
  })
})

describe('consumer loyalty redeem quote', () => {
  const program = {
    enabled: true,
    redeem_currency_per_point: 0.1,
    min_redeem_points: 10,
    max_redeem_percent: 50,
  }

  it('refuses points when there is no food to discount', () => {
    expect(() => quoteConsumerLoyaltyRedeem(program, 10, 0)).toThrow(/food order/)
  })

  it('suggests only a point amount whose discount fits the cap', () => {
    const suggestion = suggestConsumerRedeemPoints(program, 500, 10)
    expect(suggestion.discount).toBeLessThanOrEqual(5)
    expect(suggestion.discount).toBeGreaterThan(0)
    expect(quoteConsumerLoyaltyRedeem(program, suggestion.points, 10)).toBe(suggestion.discount)
  })
})

describe('reverseConsumerLoyaltyOnOrderCancel', () => {
  it('returns redeemed points and claws back points earned on the order', async () => {
    const client = scriptedClient([
      { rows: [] },
      {
        rows: [
          { entry_type: 'REDEEM', points_delta: -40 },
          { entry_type: 'EARN', points_delta: 15 },
        ],
      },
      { rows: [{ loyalty_points: 10, lifetime_earned: 15, lifetime_redeemed: 40 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ])

    const result = await reverseConsumerLoyaltyOnOrderCancel(client, {
      restaurantId: 'r1',
      memberId: 'm1',
      consumerOrderId: 'o1',
    })

    expect(result.balanceAfter).toBe(35)
    const memberUpdate = client.calls.find((call) => call.sql.includes('UPDATE consumer_member'))
    expect(memberUpdate.params).toEqual([35, 0, 0, 'm1', 'r1'])
    const reversals = client.calls.filter((call) =>
      call.sql.includes('INSERT INTO consumer_loyalty_ledger')
    )
    expect(reversals).toHaveLength(2)
    expect(reversals[0].params[3]).toBe(40)
    expect(reversals[1].params[3]).toBe(-15)
  })

  it('does not erase lifetime points that were already spent on another order', async () => {
    const client = scriptedClient([
      { rows: [] },
      { rows: [{ entry_type: 'EARN', points_delta: 15 }] },
      { rows: [{ loyalty_points: 4, lifetime_earned: 15, lifetime_redeemed: 11 }] },
      { rows: [] },
      { rows: [] },
    ])

    const result = await reverseConsumerLoyaltyOnOrderCancel(client, {
      restaurantId: 'r1',
      memberId: 'm1',
      consumerOrderId: 'o1',
    })

    expect(result.balanceAfter).toBe(0)
    const memberUpdate = client.calls.find((call) => call.sql.includes('UPDATE consumer_member'))
    expect(memberUpdate.params).toEqual([0, 11, 11, 'm1', 'r1'])
  })

  it('does nothing when the order was already reversed', async () => {
    const client = scriptedClient([
      { rows: [{ metadata: { reverses: 'EARN' } }, { metadata: { reverses: 'REDEEM' } }] },
      {
        rows: [
          { entry_type: 'REDEEM', points_delta: -40 },
          { entry_type: 'EARN', points_delta: 15 },
        ],
      },
    ])

    const result = await reverseConsumerLoyaltyOnOrderCancel(client, {
      restaurantId: 'r1',
      memberId: 'm1',
      consumerOrderId: 'o1',
    })

    expect(result).toBeNull()
    expect(client.calls.some((call) => call.sql.includes('UPDATE consumer_member'))).toBe(false)
  })
})
