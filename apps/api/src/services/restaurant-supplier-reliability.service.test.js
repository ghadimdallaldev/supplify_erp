import { describe, expect, it, vi } from 'vitest'

import { listSupplierReliability } from './restaurant-supplier-reliability.service.js'

describe('listSupplierReliability', () => {
  const supplierRow = {
    supplier_id: 'supplier-1',
    supplier_name: 'Fresh Co',
    orders_placed: '10',
    completed_orders: '8',
    receiving_reports: '6',
    quality_scored_reports: '5',
    total_items_ordered: '100',
    total_items_received: '92',
    average_quality_score: '4.2',
    timed_deliveries: '4',
    on_time_deliveries: '3',
    late_deliveries: '1',
    deliveries_without_schedule: '2',
    disputed_orders: '2',
    unresolved_disputed_orders: '1',
  }

  it('composes observed completion, receiving, timing, and dispute facts', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [supplierRow] }))
    const result = await listSupplierReliability('restaurant-1', {}, dbQuery)

    expect(result.windowDays).toBe(90)
    expect(result.suppliers[0]).toEqual({
      supplierId: 'supplier-1',
      supplierName: 'Fresh Co',
      orders: { placed: 10, completed: 8, completionRatePct: 80 },
      receiving: { reports: 6, fillRatePct: 92, averageQualityScore: 4.2, qualityScoredReports: 5 },
      delivery: {
        timedDeliveries: 4,
        onTimeDeliveries: 3,
        lateDeliveries: 1,
        deliveriesWithoutSchedule: 2,
        onTimeRatePct: 75,
      },
      disputes: { disputedOrders: 2, unresolvedDisputedOrders: 1 },
      signals: ['short_receipt', 'late_delivery', 'open_dispute'],
    })
  })

  it('omits rates when their data prerequisite is absent', async () => {
    const dbQuery = vi.fn(async () => ({
      rows: [
        {
          ...supplierRow,
          orders_placed: null,
          completed_orders: null,
          total_items_ordered: null,
          total_items_received: null,
          average_quality_score: null,
          timed_deliveries: '0',
          on_time_deliveries: '0',
          late_deliveries: '0',
          unresolved_disputed_orders: '0',
        },
      ],
    }))
    const result = await listSupplierReliability('restaurant-1', {}, dbQuery)
    const supplier = result.suppliers[0]

    expect(supplier.orders.completionRatePct).toBeNull()
    expect(supplier.receiving.fillRatePct).toBeNull()
    expect(supplier.receiving.averageQualityScore).toBeNull()
    expect(supplier.delivery.onTimeRatePct).toBeNull()
    expect(supplier.signals).toEqual([])
  })

  it('uses only explicit, objective exceptions as signals', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listSupplierReliability('restaurant-1', {}, dbQuery)

    const [sql, params] = dbQuery.mock.calls[0]
    expect(params).toEqual(['restaurant-1', 90])
    expect(sql).toContain("co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')")
    expect(sql).toContain("da.status = 'delivered'")
    expect(sql).toContain("d.status IN ('open', 'under_review', 'escalated')")
  })

  it('clamps the requested window and requires tenant scope', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))
    await listSupplierReliability('restaurant-1', { days: 99999 }, dbQuery)
    expect(dbQuery.mock.calls[0][1]).toEqual(['restaurant-1', 730])

    await expect(listSupplierReliability(null, {}, dbQuery)).rejects.toThrow(/required/)
  })
})
