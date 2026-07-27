import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('selectAiRecommendCandidates / AI recommend orchestration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('selects top URGENT/HIGH/MEDIUM product suggestions up to limit', async () => {
    vi.doMock('../lib/db.js', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }))
    vi.doMock('../lib/cache.js', () => ({
      getCache: vi.fn(),
      setCache: vi.fn(),
      deleteCacheByPrefix: vi.fn(),
    }))
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn().mockResolvedValue([]),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn().mockResolvedValue({ lots: [] }),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      getCachedForecasts: vi.fn().mockResolvedValue([]),
      refreshIfStale: vi.fn(),
    }))

    const { selectAiRecommendCandidates } = await import(
      './restaurant-reorder-assistance.service.js'
    )
    const selected = selectAiRecommendCandidates(
      [
        { id: '1', productId: 'p1', urgency: 'URGENT' },
        { id: '2', productId: 'p2', urgency: 'LOW' },
        { id: '3', productId: null, urgency: 'HIGH' },
        { id: '4', productId: 'p4', urgency: 'MEDIUM' },
        { id: '5', productId: 'p5', urgency: 'HIGH' },
      ],
      { limit: 2 }
    )
    expect(selected.map((s) => s.productId)).toEqual(['p1', 'p4'])
  })

  it('cache hit skips LLM provider', async () => {
    const getCache = vi.fn().mockResolvedValue({
      recommendations: [{ productId: 'p1', source: 'ai', recommendedQuantity: 10 }],
      usedLlm: true,
      cached: false,
    })
    const setCache = vi.fn()
    const generate = vi.fn()

    vi.doMock('../lib/db.js', () => ({
      query: vi.fn(async (sql) => {
        const s = String(sql)
        if (s.includes('reorder_suggestion_suppression')) return { rows: [] }
        if (s.includes('restaurant_inventory ri')) {
          return {
            rows: [
              {
                product_id: 'p1',
                product_name: 'Tomatoes',
                product_unit: 'kg',
                supplier_id: 's1',
                supplier_name: 'Fresh',
                current_qty: 1,
                low_stock_threshold: 5,
                avg_daily_usage_30day: 2,
                last_order_qty: 10,
                days_since_last_order: 1,
                lead_time_days: 7,
                moq: 1,
                order_multiple: 1,
                urgency_level: 'HIGH',
              },
            ],
          }
        }
        if (s.includes('quick_list ql')) return { rows: [] }
        return { rows: [] }
      }),
    }))
    vi.doMock('../lib/cache.js', () => ({
      getCache,
      setCache,
      deleteCacheByPrefix: vi.fn(),
    }))
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }))
    vi.doMock('../lib/ai-platform.js', () => ({
      resolveReorderAiCapabilities: vi.fn().mockResolvedValue({
        envEnabled: true,
        platformEnabled: true,
        canExplainLlm: true,
        canAskLlm: false,
      }),
      canUseReorderAiExplain: vi.fn().mockResolvedValue(true),
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn().mockResolvedValue([]),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn().mockResolvedValue({ lots: [] }),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      getCachedForecasts: vi.fn().mockResolvedValue([
        {
          productId: 'p1',
          forecastReorderQty: 10,
          confidence: 0.8,
          computedAt: '2026-07-15T00:00:00.000Z',
          modelVersion: 'v1',
        },
      ]),
      refreshIfStale: vi.fn(),
    }))
    vi.doMock('./reorder-ai.service.js', () => ({
      generateReorderRecommendations: generate,
    }))
    vi.doMock('./reorder-ai-context.service.js', () => ({
      buildReorderAiContexts: vi.fn(),
    }))

    const { getReorderAiRecommendations } = await import(
      './restaurant-reorder-assistance.service.js'
    )
    const result = await getReorderAiRecommendations('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
      productIds: ['p1'],
      limit: 8,
    })

    expect(result.cached).toBe(true)
    expect(result.recommendations[0].source).toBe('ai')
    expect(generate).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
  })

  it('falls back to forecast when tenant is not LLM-eligible', async () => {
    const getCache = vi.fn().mockResolvedValue(null)
    const setCache = vi.fn()
    const generate = vi.fn()

    vi.doMock('../lib/db.js', () => ({
      query: vi.fn(async (sql) => {
        const s = String(sql)
        if (s.includes('reorder_suggestion_suppression')) return { rows: [] }
        if (s.includes('restaurant_inventory ri')) {
          return {
            rows: [
              {
                product_id: 'p1',
                product_name: 'Tomatoes',
                product_unit: 'kg',
                supplier_id: 's1',
                supplier_name: 'Fresh',
                current_qty: 1,
                low_stock_threshold: 5,
                avg_daily_usage_30day: 2,
                last_order_qty: 10,
                days_since_last_order: 1,
                lead_time_days: 7,
                moq: 1,
                order_multiple: 1,
                urgency_level: 'HIGH',
              },
            ],
          }
        }
        if (s.includes('quick_list ql')) return { rows: [] }
        return { rows: [] }
      }),
    }))
    vi.doMock('../lib/cache.js', () => ({
      getCache,
      setCache,
      deleteCacheByPrefix: vi.fn(),
    }))
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }))
    vi.doMock('../lib/ai-platform.js', () => ({
      resolveReorderAiCapabilities: vi.fn().mockResolvedValue({
        envEnabled: false,
        platformEnabled: false,
        canExplainLlm: false,
        canAskLlm: false,
      }),
      canUseReorderAiExplain: vi.fn().mockResolvedValue(false),
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn().mockResolvedValue([]),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn().mockResolvedValue({ lots: [] }),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      getCachedForecasts: vi.fn().mockResolvedValue([
        {
          productId: 'p1',
          forecastReorderQty: 10,
          confidence: 0.8,
          computedAt: '2026-07-15T00:00:00.000Z',
          modelVersion: 'v1',
        },
      ]),
      refreshIfStale: vi.fn(),
    }))
    vi.doMock('./reorder-ai.service.js', () => ({
      generateReorderRecommendations: generate,
    }))
    vi.doMock('./reorder-ai-context.service.js', () => ({
      buildReorderAiContexts: vi.fn().mockResolvedValue([
        {
          productId: 'p1',
          suggestionId: 'stock-p1',
          baseSuggestedQuantity: 10,
          defaultSupplierId: 's1',
          supplierOptions: [{ supplierId: 's1', supplierName: 'Fresh' }],
          productUnit: 'kg',
          moq: 1,
          orderMultiple: 1,
          leadTimeDays: 7,
          urgency: 'HIGH',
          forecast: { confidence: 0.8, explanation: 'Coverage' },
          reasonLabel: 'Low stock',
          eligibility: { skipLlm: false },
        },
      ]),
    }))

    const { getReorderAiRecommendations } = await import(
      './restaurant-reorder-assistance.service.js'
    )
    const result = await getReorderAiRecommendations('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
      productIds: ['p1'],
    })

    expect(result.usedLlm).toBe(false)
    expect(result.recommendations[0].source).not.toBe('ai')
    expect(result.recommendations[0].aiMetadata.fallbackReason).toBe('not_eligible_for_llm')
    expect(generate).not.toHaveBeenCalled()
    expect(setCache).toHaveBeenCalled()
  })

  it('invalidates AI recommend cache prefix for a restaurant', async () => {
    const deleteCacheByPrefix = vi.fn()
    vi.doMock('../lib/db.js', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }))
    vi.doMock('../lib/cache.js', () => ({
      getCache: vi.fn(),
      setCache: vi.fn(),
      deleteCacheByPrefix,
    }))
    vi.doMock('../lib/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn().mockResolvedValue([]),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn().mockResolvedValue({ lots: [] }),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      getCachedForecasts: vi.fn().mockResolvedValue([]),
      refreshIfStale: vi.fn(),
    }))

    const { invalidateReorderAiRecommendCache, reorderAiRecommendCachePrefix } = await import(
      './restaurant-reorder-assistance.service.js'
    )

    await invalidateReorderAiRecommendCache('rest-99')
    expect(deleteCacheByPrefix).toHaveBeenCalledWith(reorderAiRecommendCachePrefix('rest-99'))
  })
})
