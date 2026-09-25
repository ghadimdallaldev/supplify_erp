import { describe, expect, it, vi } from 'vitest'

import { getWasteIntelligence } from './restaurant-waste-intelligence.service.js'

const queryResult = {
  current_summary: {
    incidents: '5',
    costed_incidents: '4',
    uncosted_incidents: '1',
    affected_products: '2',
    waste_cost: '125.50',
  },
  previous_summary: {
    incidents: '3',
    costed_incidents: '3',
    uncosted_incidents: '0',
    affected_products: '2',
    waste_cost: '100.00',
  },
  hotspots: [
    {
      product_id: 'p1',
      product_name: 'Tomatoes',
      product_unit: 'kg',
      supplier_name: 'Fresh Co',
      current_incidents: '2',
      previous_incidents: '1',
      costed_incidents: '1',
      uncosted_incidents: '1',
      current_waste_qty: '12.5',
      current_waste_cost: '75.00',
      previous_waste_cost: '50.00',
    },
  ],
}

describe('getWasteIntelligence', () => {
  it('compares only logged waste and retains missing-cost coverage', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [queryResult] }))
    const result = await getWasteIntelligence('restaurant-1', {}, dbQuery)

    expect(result.summary.current).toEqual({
      incidents: 5,
      affectedProducts: 2,
      wasteCost: 125.5,
      costCoverage: { costedIncidents: 4, uncostedIncidents: 1 },
    })
    expect(result.summary.costChangePct).toBeCloseTo(25.5, 5)
    expect(result.hotspots[0]).toMatchObject({
      productId: 'p1',
      currentWasteCost: 75,
      previousWasteCost: 50,
      costChangePct: 50,
      signals: ['repeated_waste', 'rising_waste_cost'],
    })
  })

  it('does not invent a percentage when the preceding cost is absent or zero', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        {
          current_summary: { incidents: '1', waste_cost: '20' },
          previous_summary: { incidents: '0', waste_cost: null },
          hotspots: [],
        },
      ],
    }))
    const result = await getWasteIntelligence('restaurant-1', {}, dbQuery)

    expect(result.summary.costChangePct).toBeNull()
    expect(result.summary.current.costCoverage).toEqual({
      costedIncidents: 0,
      uncostedIncidents: 0,
    })
  })

  it('requires repeat incidents or an observed cost increase for a hotspot', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [{ ...queryResult, hotspots: [] }] }))
    await getWasteIntelligence('restaurant-1', {}, dbQuery)

    const [sql] = dbQuery.mock.calls[0]
    expect(sql).toContain('current_incidents >= 2')
    expect(sql).toContain('current_waste_cost > previous_waste_cost')
    expect(sql).toContain("ia.adjustment_type IN ('WASTAGE', 'SPOILAGE')")
  })

  it('clamps client input and scopes the query to its restaurant', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await getWasteIntelligence('restaurant-1', { days: 9999, limit: 9999 }, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params).toEqual(['restaurant-1', 365, 100])
  })

  it('requires restaurant scope', async () => {
    const dbQuery = vi.fn()
    await expect(getWasteIntelligence(null, {}, dbQuery)).rejects.toThrow(/required/)
    expect(dbQuery).not.toHaveBeenCalled()
  })
})
