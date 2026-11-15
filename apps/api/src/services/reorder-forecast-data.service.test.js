import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
import { query } from '../lib/db.js'
import { loadConsumptionHistory } from './reorder-forecast-data.service.js'
import { loadIncomingSupply } from './reorder-supply.service.js'
vi.mock('../lib/logger.js', () => ({ logger: { warn: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
})
describe('consumption data boundaries', () => {
  it('does not turn received supply into consumption', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            product_id: 'p1',
            quantity: 100,
            line_unit: 'kg',
            product_unit: 'kg',
            usage_date: '2026-11-01',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
    expect(await loadConsumptionHistory('r1', { timeZone: 'Asia/Beirut' })).toEqual([])
  })
  it('aggregates branches and does not add order fallback to measured consumption', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            product_id: 'p1',
            branch_id: 'a',
            type: 'SUBTRACT',
            quantity: 2,
            usage_date: '2026-11-01',
          },
          {
            product_id: 'p1',
            branch_id: 'b',
            type: 'SUBTRACT',
            quantity: 3,
            usage_date: '2026-11-01',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ product_id: 'p1', quantity: 100, product_unit: 'kg', usage_date: '2026-11-01' }],
      })
    const rows = await loadConsumptionHistory('r1', { timeZone: 'Asia/Beirut' })
    expect(rows).toHaveLength(1)
    expect(rows[0].dailyUsage).toEqual([{ date: '2026-11-01', quantity: 5 }])
    expect(rows[0].sources).toEqual(['movement'])
    expect(query.mock.calls[0][1]).toEqual(['r1', 90, 'Asia/Beirut'])
    expect(query.mock.calls[0][0]).toContain('AT TIME ZONE $3')
  })
})
describe('incoming supply', () => {
  it('keeps overdue and uncertain amounts separate and scopes branch queries', async () => {
    query.mockResolvedValue({
      rows: [
        { product_id: 'p1', quantity: 4, delivery_date: '2026-11-20', dependable: true },
        { product_id: 'p1', quantity: 7, overdue: true, dependable: true },
        { product_id: 'p1', quantity: 2, dependable: false },
      ],
    })
    const result = await loadIncomingSupply('r1', ['p1'], { branchId: 'b1' })
    expect(result.products.get('p1')).toMatchObject({ confirmed: 4, uncertain: 2, overdue: 7 })
    expect(query.mock.calls[0][1]).toEqual(['r1', ['p1'], 'b1'])
    expect(query.mock.calls[0][0]).toContain('oi.quantity - COALESCE(receipts.received, 0)')
    expect(query.mock.calls[0][0]).toContain('rli.order_item_id = oi.id')
  })
  it('reports a failed lookup explicitly', async () => {
    query.mockRejectedValue(new Error('database unavailable'))
    expect((await loadIncomingSupply('r1', ['p1'])).known).toBe(false)
  })
})
