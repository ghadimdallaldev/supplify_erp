import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockGetEffectiveFeatures = vi.fn()
const mockRefreshIfStale = vi.fn()
const mockGetCachedForecasts = vi.fn()
const mockGetReorderAssistance = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('../lib/feature-flags.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getEffectiveFeaturesForTenant: (...args) => mockGetEffectiveFeatures(...args),
  }
})

vi.mock('./reorder-forecast-cache.service.js', () => ({
  refreshIfStale: (...args) => mockRefreshIfStale(...args),
  getCachedForecasts: (...args) => mockGetCachedForecasts(...args),
}))

vi.mock('./restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: (...args) => mockGetReorderAssistance(...args),
}))

describe('quick-list-ai.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEffectiveFeatures.mockResolvedValue({
      features: { quick_lists: 'ai_smart_automation', smart_reorder: 'ai_forecast_seasonality' },
    })
    mockRefreshIfStale.mockResolvedValue(undefined)
    mockGetCachedForecasts.mockResolvedValue([])
    mockGetReorderAssistance.mockResolvedValue({ suggestions: [] })
  })

  it('applySmartQuantitiesToItems skips when capability is disabled', async () => {
    const { applySmartQuantitiesToItems } = await import('./quick-list-ai.service.js')
    const items = [{ product_id: 'p1', quantity: 5, product_name: 'Tomatoes' }]
    const result = await applySmartQuantitiesToItems('r1', { use_ai_quantities: true }, items, {
      quickListsFeatureValue: 'full_schedule',
    })
    expect(result.skipped).toBe('capability_disabled')
    expect(result.items).toEqual(items)
  })

  it('applySmartQuantitiesToItems skips when list flag is off', async () => {
    const { applySmartQuantitiesToItems } = await import('./quick-list-ai.service.js')
    const items = [{ product_id: 'p1', quantity: 5, product_name: 'Tomatoes' }]
    const result = await applySmartQuantitiesToItems('r1', { use_ai_quantities: false }, items, {
      quickListsFeatureValue: 'ai_smart_automation',
    })
    expect(result.skipped).toBe('flag_off')
    expect(result.items).toEqual(items)
  })

  it('suggestQuickListItems proposes add and update actions', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM quick_list WHERE')) {
        return { rows: [{ id: 'ql1', restaurant_id: 'r1', supplier_id: 's1', branch_id: null }] }
      }
      if (String(sql).includes('FROM quick_list_item')) {
        return { rows: [{ product_id: 'p-existing', quantity: 2 }] }
      }
      return { rows: [] }
    })
    mockGetReorderAssistance.mockResolvedValue({
      suggestions: [
        {
          productId: 'p-new',
          supplierId: 's1',
          suggestedQty: 4,
          reasonCode: 'forecast',
          reasonLabel: 'Forecast reorder',
        },
        {
          productId: 'p-existing',
          supplierId: 's1',
          suggestedQty: 6,
          reasonCode: 'low_stock',
          reasonLabel: 'Low stock',
        },
      ],
    })

    const { suggestQuickListItems } = await import('./quick-list-ai.service.js')
    const result = await suggestQuickListItems('r1', 'ql1')

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'add', productId: 'p-new', quantity: 4 }),
        expect.objectContaining({
          action: 'update',
          productId: 'p-existing',
          quantity: 6,
          previousQuantity: 2,
        }),
      ])
    )
  })
})
