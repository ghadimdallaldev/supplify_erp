import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supplier-reorder-assistance.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('merges intelligence and cadence at-risk suggestions', async () => {
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => ({
        graceDays: 7,
        customersAtRisk: [
          {
            restaurantId: 'r1',
            restaurantName: 'Bistro A',
            orderCount: 5,
            lastOrderAt: '2026-05-01',
            avgDaysBetween: 10,
            daysSinceLastOrder: 12,
            suggestedFollowUp: 'Usually orders every ~10 days. Last order was 18 days ago.',
            suggestedProducts: [],
            riskLevel: 'medium',
          },
        ],
      })),
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listSupplierAtRisk: vi.fn(async () => [
        {
          cadenceId: 'c1',
          restaurantId: 'r2',
          restaurantName: 'Cafe B',
          label: 'Chicken',
          dayName: 'Monday',
        },
      ]),
    }))

    const { getSupplierReorderAssistance } = await import(
      './supplier-reorder-assistance.service.js'
    )
    const result = await getSupplierReorderAssistance('s1')
    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions.find((s) => s.restaurantId === 'r1')?.reasonCode).toBe(
      'missed_pattern'
    )
    expect(result.suggestions.find((s) => s.restaurantId === 'r1')).toMatchObject({
      orderCount: 5,
      dataQuality: 'fair',
      evidence: [
        expect.objectContaining({
          source: 'intelligence',
          orderCount: 5,
          avgDaysBetween: 10,
          lookbackDays: 180,
        }),
      ],
    })
    expect(result.suggestions.find((s) => s.restaurantId === 'r2')?.reasonCode).toBe(
      'cadence_missed'
    )
  })

  it('retains the compatibility reason code without claiming predicted churn', async () => {
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => ({
        graceDays: 7,
        customersAtRisk: [
          {
            restaurantId: 'r1',
            restaurantName: 'Bistro A',
            avgDaysBetween: 10,
            daysSinceLastOrder: 20,
            suggestedFollowUp: 'test',
            suggestedProducts: [],
            riskLevel: 'high',
          },
        ],
      })),
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listSupplierAtRisk: vi.fn(async () => []),
    }))

    const { getSupplierReorderAssistance } = await import(
      './supplier-reorder-assistance.service.js'
    )
    const result = await getSupplierReorderAssistance('s1')
    expect(result.suggestions[0].reasonCode).toBe('churn_risk')
    expect(result.suggestions[0].reasonLabel).toBe('Longer than usual since the last order')
    expect(result.suggestions[0].dataQuality).toBe('poor')
  })

  it('deduplicates customers and source labels while preserving distinct cadence evidence', async () => {
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => ({ graceDays: 7, customersAtRisk: [] })),
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listSupplierAtRisk: vi.fn(async () => [
        {
          restaurantId: 'r1',
          restaurantName: 'Bistro',
          cadenceId: 'c1',
          label: 'Milk',
          dayName: 'Monday',
        },
        {
          restaurantId: 'r1',
          restaurantName: 'Bistro',
          cadenceId: 'c1',
          label: 'Milk',
          dayName: 'Monday',
        },
        {
          restaurantId: 'r1',
          restaurantName: 'Bistro',
          cadenceId: 'c2',
          label: 'Eggs',
          dayName: 'Monday',
        },
      ]),
    }))
    const { getSupplierReorderAssistance } = await import(
      './supplier-reorder-assistance.service.js'
    )
    const result = await getSupplierReorderAssistance('s1')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].sources).toEqual(['cadence'])
    expect(result.suggestions[0].evidence).toHaveLength(2)
  })
})
