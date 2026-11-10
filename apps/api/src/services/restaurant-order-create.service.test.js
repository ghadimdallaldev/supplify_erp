import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/subscription.js', () => ({
  incrementDailyUsageMeterInTransaction: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('./order-create.service.js', () => ({
  insertOrderItemsBatch: vi.fn().mockResolvedValue([
    {
      id: 'line-1',
      product_id: 'product-1',
      line_total: 20,
      quantity: 2,
    },
  ]),
}))

vi.mock('./supplier-order-stock.service.js', () => ({
  reserveStockForPlacedOrder: vi.fn().mockResolvedValue({
    mode: 'warehouse',
    fulfillment: { mode: 'single', assignments: [] },
  }),
}))

describe('restaurant-order-create.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns transaction sub-timing fields and query count', async () => {
    const { createRestaurantOrdersInTransaction } = await import(
      './restaurant-order-create.service.js'
    )
    const { incrementDailyUsageMeterInTransaction } = await import('../lib/subscription.js')
    const { reserveStockForPlacedOrder } = await import('./supplier-order-stock.service.js')

    const supplierId = '660e8400-e29b-41d4-a716-446655440001'
    const items = [
      {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 2,
        unitPrice: 10,
        product: { sku: 'SKU1', category_id: null },
      },
    ]
    const supplierGroups = new Map([[supplierId, items]])
    const supplierProfiles = new Map([
      [
        supplierId,
        {
          id: supplierId,
          default_warehouse_id: 'wh-1',
          fulfillment_mode: 'single',
          multi_warehouse_enabled: false,
        },
      ],
    ])

    let queryCount = 0
    const client = {
      query: vi.fn(async (sql) => {
        queryCount += 1
        if (sql.includes('INSERT INTO customer_order')) {
          return {
            rows: [{ id: 'order-1', restaurant_id: 'rest-1', status: 'PLACED', total_amount: 0 }],
          }
        }
        if (sql.includes('UPDATE customer_order')) {
          return { rows: [] }
        }
        return { rows: [] }
      }),
    }

    const result = await createRestaurantOrdersInTransaction({
      client,
      restaurantId: 'rest-1',
      orderStatus: 'PLACED',
      supplierGroups,
      supplierProfiles,
      supplierPromoEligibility: new Map([[supplierId, false]]),
      supplierMultiWarehouse: new Map([[supplierId, false]]),
      dailyMeterEnforcement: {
        subscription: { plan_id: 'plan-1' },
        resolved: { isUnlimited: true },
      },
      orderData: { items: [{ productId: items[0].productId, quantity: 2 }] },
      promotionHandlers: null,
    })

    expect(incrementDailyUsageMeterInTransaction).toHaveBeenCalled()
    expect(reserveStockForPlacedOrder).toHaveBeenCalled()
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].stockMode).toBe('warehouse')
    expect(result.lineCount).toBe(1)
    expect(result.supplierCount).toBe(1)
    expect(result.totalTransactionMs).toBeGreaterThanOrEqual(0)
    expect(result.transactionQueryCount).toBeGreaterThan(0)
    expect(result.timings).toMatchObject({
      usageMeterMs: expect.any(Number),
      orderHeaderInsertMs: expect.any(Number),
      stockLockAndReserveMs: expect.any(Number),
      orderItemsInsertMs: expect.any(Number),
      orderTotalsUpdateMs: expect.any(Number),
      warehouseRoutingMs: expect.any(Number),
    })
    expect(queryCount).toBe(result.transactionQueryCount)
  })

  it('propagates a lost promotion claim so the caller transaction rolls back and no order is returned', async () => {
    const { createRestaurantOrdersInTransaction } = await import(
      './restaurant-order-create.service.js'
    )
    const { promotionNoLongerAvailableError } = await import('./promotions.service.js')

    const supplierId = '660e8400-e29b-41d4-a716-446655440001'
    const items = [
      {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 2,
        unitPrice: 10,
        product: { sku: 'SKU1', category_id: null },
      },
    ]
    const client = {
      query: vi.fn(async (sql) =>
        sql.includes('INSERT INTO customer_order')
          ? {
              rows: [{ id: 'order-1', restaurant_id: 'rest-1', status: 'PLACED', total_amount: 0 }],
            }
          : { rows: [] }
      ),
    }
    const applyPromotions = vi
      .fn()
      .mockRejectedValue(promotionNoLongerAvailableError('Summer Deal'))

    const err = await createRestaurantOrdersInTransaction({
      client,
      restaurantId: 'rest-1',
      orderStatus: 'PLACED',
      supplierGroups: new Map([[supplierId, items]]),
      supplierProfiles: new Map([
        [supplierId, { id: supplierId, default_warehouse_id: 'wh-1', fulfillment_mode: 'single' }],
      ]),
      supplierPromoEligibility: new Map([[supplierId, true]]),
      supplierMultiWarehouse: new Map([[supplierId, false]]),
      dailyMeterEnforcement: {
        subscription: { plan_id: 'plan-1' },
        resolved: { isUnlimited: true },
      },
      orderData: {
        items: [{ productId: items[0].productId, quantity: 2 }],
        promotionId: 'promo-1',
      },
      promotionHandlers: { applyPromotions },
    }).then(
      () => null,
      (e) => e
    )

    // The throw escapes (no orders returned, no COMMIT issued here); route-level
    // withTransaction() ROLLBACKs the header/items/stock writes made above.
    expect(err?.code).toBe('PROMOTION_NO_LONGER_AVAILABLE')
    expect(err?.name).toBe('ConflictError')
    expect(applyPromotions).toHaveBeenCalledTimes(1)
    expect(client.query.mock.calls.some(([sql]) => /COMMIT/i.test(sql))).toBe(false)
  })
})
