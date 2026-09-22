import { describe, expect, it, vi } from 'vitest'

import {
  getProductPriceHistory,
  listCheaperBuyOptions,
  listPriceChangeAlerts,
} from './restaurant-price-intelligence.service.js'

/** Newest first, matching the service's ORDER BY detected_at DESC. */
const historyRows = [
  {
    id: 'e3',
    product_id: 'p1',
    product_name: 'Olive oil 5L',
    supplier_id: 's1',
    supplier_name: 'Grove Co',
    old_price: '22.00',
    new_price: '26.40',
    change_pct: '20.0000',
    source: 'RECEIVING',
    detected_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'e2',
    product_id: 'p1',
    product_name: 'Olive oil 5L',
    supplier_id: 's1',
    supplier_name: 'Grove Co',
    old_price: '20.00',
    new_price: '22.00',
    change_pct: '10.0000',
    source: 'INVOICE',
    detected_at: '2026-08-20T00:00:00Z',
  },
  {
    id: 'e1',
    product_id: 'p1',
    product_name: 'Olive oil 5L',
    supplier_id: 's1',
    supplier_name: 'Grove Co',
    old_price: null,
    new_price: '20.00',
    change_pct: null,
    source: 'CATALOG',
    detected_at: '2026-07-20T00:00:00Z',
  },
]

describe('getProductPriceHistory', () => {
  it('summarises the window from the observed events', async () => {
    const dbQuery = vi.fn(async () => ({ rows: historyRows }))
    const result = await getProductPriceHistory('r1', 'p1', {}, dbQuery)

    expect(result.summary.observations).toBe(3)
    expect(result.summary.currentPrice).toBe(26.4)
    expect(result.summary.lowestPrice).toBe(20)
    expect(result.summary.highestPrice).toBe(26.4)
    // Oldest row has no old_price, so its new_price is the window baseline.
    expect(result.summary.firstObservedPrice).toBe(20)
    expect(result.summary.changePct).toBeCloseTo(32, 5)
    expect(result.summary.direction).toBe('up')
    expect(result.summary.lastChangedAt).toBe('2026-09-20T00:00:00Z')
  })

  it('recomputes changePct rather than trusting a null stored column', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [{ ...historyRows[0], change_pct: null }],
    }))
    const result = await getProductPriceHistory('r1', 'p1', {}, dbQuery)
    expect(result.events[0].changePct).toBeCloseTo(20, 5)
  })

  it('reports unknown direction and null stats with no observations', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    const result = await getProductPriceHistory('r1', 'p1', {}, dbQuery)

    expect(result.summary.observations).toBe(0)
    expect(result.summary.currentPrice).toBeNull()
    expect(result.summary.changePct).toBeNull()
    expect(result.summary.direction).toBe('unknown')
  })

  it('clamps the window and page size instead of trusting client input', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await getProductPriceHistory('r1', 'p1', { days: 99999, limit: 100000 }, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params[2]).toBe(730)
    expect(params[3]).toBe(200)
  })

  it('falls back to defaults for junk pagination values', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await getProductPriceHistory('r1', 'p1', { days: 'abc', limit: null }, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params[2]).toBe(180)
    expect(params[3]).toBe(100)
  })

  it('requires both tenant and product scope', async () => {
    const dbQuery = vi.fn()
    await expect(getProductPriceHistory(null, 'p1', {}, dbQuery)).rejects.toThrow(/required/)
    await expect(getProductPriceHistory('r1', null, {}, dbQuery)).rejects.toThrow(/required/)
    expect(dbQuery).not.toHaveBeenCalled()
  })

  it('always scopes the query to the calling restaurant', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await getProductPriceHistory('r1', 'p1', {}, dbQuery)

    const [sql, params] = dbQuery.mock.calls[0]
    expect(sql).toContain('spe.restaurant_id = $1')
    expect(params[0]).toBe('r1')
  })
})

describe('listPriceChangeAlerts', () => {
  it('defaults to meaningful increases only', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    const result = await listPriceChangeAlerts('r1', {}, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params[2]).toBe(5)
    expect(params[3]).toBe('up')
    expect(result.minChangePct).toBe(5)
  })

  it('rejects an unsupported direction rather than injecting it', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listPriceChangeAlerts('r1', { direction: "'; DROP TABLE product; --" }, dbQuery)

    const [, params] = dbQuery.mock.calls[0]
    expect(params[3]).toBe('up')
  })

  it('escalates severity at double the threshold', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        { ...historyRows[0], old_price: '10.00', new_price: '13.00' },
        { ...historyRows[1], id: 'e9', old_price: '10.00', new_price: '10.60' },
      ],
    }))
    const { alerts } = await listPriceChangeAlerts('r1', { minChangePct: 5 }, dbQuery)

    expect(alerts[0].changePct).toBeCloseTo(30, 5)
    expect(alerts[0].severity).toBe('high')
    expect(alerts[1].severity).toBe('medium')
  })

  it('treats a negative threshold as a magnitude', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listPriceChangeAlerts('r1', { minChangePct: -12 }, dbQuery)
    expect(dbQuery.mock.calls[0][1][2]).toBe(12)
  })
})

describe('listCheaperBuyOptions', () => {
  const risenRow = {
    product_id: 'p1',
    product_name: 'Olive oil 5L',
    supplier_id: 's1',
    supplier_name: 'Grove Co',
    old_price: '20.00',
    new_price: '26.40',
    detected_at: '2026-09-20T00:00:00Z',
    contract_price: null,
    substitute_product_id: null,
    substitute_product_name: null,
    substitute_price: null,
  }

  it('surfaces an active contract price below what was last paid', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [{ ...risenRow, contract_price: '21.00' }] }))
    const { options } = await listCheaperBuyOptions('r1', {}, dbQuery)

    expect(options).toHaveLength(1)
    expect(options[0].alternatives).toHaveLength(1)
    expect(options[0].alternatives[0].kind).toBe('contract_price')
    expect(options[0].alternatives[0].savingPerUnit).toBeCloseTo(5.4, 5)
  })

  it('surfaces a supplier-declared substitute that is cheaper', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        {
          ...risenRow,
          substitute_product_id: 'p2',
          substitute_product_name: 'Olive oil 5L (house)',
          substitute_price: '19.00',
        },
      ],
    }))
    const { options } = await listCheaperBuyOptions('r1', {}, dbQuery)

    expect(options[0].alternatives[0].kind).toBe('supplier_substitute')
    expect(options[0].alternatives[0].productId).toBe('p2')
  })

  it('never invents an alternative when nothing authorised is cheaper', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [{ ...risenRow, contract_price: '30.00', substitute_price: '28.00' }],
    }))
    const { options } = await listCheaperBuyOptions('r1', {}, dbQuery)
    expect(options).toEqual([])
  })

  it('drops a substitute row that has no sellable price', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [{ ...risenRow, substitute_product_id: 'p2', substitute_price: null }],
    }))
    const { options } = await listCheaperBuyOptions('r1', {}, dbQuery)
    expect(options).toEqual([])
  })

  it('orders alternatives by the largest genuine saving', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        {
          ...risenRow,
          contract_price: '25.00',
          substitute_product_id: 'p2',
          substitute_product_name: 'House blend',
          substitute_price: '18.00',
        },
      ],
    }))
    const { options } = await listCheaperBuyOptions('r1', {}, dbQuery)

    expect(options[0].alternatives.map((a) => a.kind)).toEqual([
      'supplier_substitute',
      'contract_price',
    ])
  })

  it('scopes every lookup to the calling restaurant', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listCheaperBuyOptions('r1', {}, dbQuery)

    const [sql, params] = dbQuery.mock.calls[0]
    expect(params[0]).toBe('r1')
    expect(sql).toContain('spe.restaurant_id = $1')
    expect(sql).toContain('rp.restaurant_id = $1')
  })
})
