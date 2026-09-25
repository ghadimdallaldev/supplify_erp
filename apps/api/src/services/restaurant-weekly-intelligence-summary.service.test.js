import { describe, expect, it, vi } from 'vitest'
import { getWeeklyIntelligenceSummary } from './restaurant-weekly-intelligence-summary.service.js'

describe('restaurant-weekly-intelligence-summary.service', () => {
  it('aggregates only existing factual signals and keeps their evidence windows explicit', async () => {
    const sources = {
      getWasteIntelligence: vi.fn().mockResolvedValue({
        windowDays: 7,
        summary: { current: { incidents: 3 } },
        hotspots: [
          { productId: 'w1' },
          { productId: 'w2' },
          { productId: 'w3' },
          { productId: 'w4' },
        ],
      }),
      listSupplierReliability: vi.fn().mockResolvedValue({
        windowDays: 28,
        suppliers: [
          { supplierId: 's1', signals: ['late_delivery'] },
          { supplierId: 's2', signals: [] },
        ],
      }),
      listOverOrderingIntelligence: vi.fn().mockResolvedValue({
        windowDays: 90,
        summary: { flaggedProducts: 2 },
        products: [{ productId: 'o1' }, { productId: 'o2' }],
      }),
      listInvoiceAnomalies: vi.fn().mockResolvedValue({
        windowDays: 7,
        duplicateLinkedInvoiceProtection: 'enforced_by_unique_order_supplier_index',
        summary: { invoicesWithAnomalies: 1 },
        invoices: [{ invoiceId: 'i1' }],
      }),
      getCachedForecasts: vi.fn().mockResolvedValue([
        { productId: 'f1', urgency: 'URGENT' },
        { productId: 'f2', urgency: 'HIGH' },
        { productId: 'f3', urgency: 'MEDIUM' },
      ]),
    }

    const result = await getWeeklyIntelligenceSummary(
      'restaurant-1',
      { now: new Date('2026-09-23T12:00:00.000Z') },
      sources
    )

    expect(sources.getWasteIntelligence).toHaveBeenCalledWith('restaurant-1', { days: 7, limit: 3 })
    expect(sources.listSupplierReliability).toHaveBeenCalledWith('restaurant-1', { days: 28 })
    expect(sources.listOverOrderingIntelligence).toHaveBeenCalledWith('restaurant-1', {
      days: 90,
      limit: 3,
    })
    expect(sources.listInvoiceAnomalies).toHaveBeenCalledWith('restaurant-1', { days: 7, limit: 3 })
    expect(result).toMatchObject({
      generatedAt: '2026-09-23T12:00:00.000Z',
      evidenceWindows: {
        wasteDays: 7,
        supplierReliabilityDays: 28,
        overOrderingDays: 90,
        invoiceAnomaliesDays: 7,
        stockoutForecasts: 'current_non_stale',
      },
      summary: {
        wasteHotspots: 4,
        supplierExceptions: 1,
        overOrderedProducts: 2,
        invoicesWithAnomalies: 1,
        stockoutRisks: 2,
      },
    })
    expect(result.sections.waste.hotspots).toHaveLength(3)
    expect(result.sections.stockout.forecasts).toEqual([
      { productId: 'f1', urgency: 'URGENT' },
      { productId: 'f2', urgency: 'HIGH' },
    ])
    expect(result).not.toHaveProperty('score')
  })

  it('clamps a client period but preserves longer evidence windows where required', async () => {
    const empty = vi.fn().mockResolvedValue({
      windowDays: 90,
      summary: { flaggedProducts: 0, invoicesWithAnomalies: 0 },
      hotspots: [],
      suppliers: [],
      products: [],
      invoices: [],
    })
    const sources = {
      getWasteIntelligence: empty,
      listSupplierReliability: empty,
      listOverOrderingIntelligence: empty,
      listInvoiceAnomalies: empty,
      getCachedForecasts: vi.fn().mockResolvedValue([]),
    }

    const result = await getWeeklyIntelligenceSummary('restaurant-1', { days: 999 }, sources)

    expect(result.periodDays).toBe(31)
    expect(sources.getWasteIntelligence).toHaveBeenCalledWith('restaurant-1', {
      days: 31,
      limit: 3,
    })
    expect(sources.listSupplierReliability).toHaveBeenCalledWith('restaurant-1', { days: 31 })
    expect(sources.listOverOrderingIntelligence).toHaveBeenCalledWith('restaurant-1', {
      days: 90,
      limit: 3,
    })
  })
})
