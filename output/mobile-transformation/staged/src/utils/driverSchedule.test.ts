import { deliveryBucket, effectiveDeliveryDate, sortDriverDeliveries } from './driverSchedule'

describe('driver schedule helpers', () => {
  it('uses the effective scheduled date before older fallbacks', () => {
    expect(effectiveDeliveryDate({ scheduledDeliveryDate: '2026-09-18', scheduledAt: '2026-09-20' })).toBe('2026-09-18')
    expect(effectiveDeliveryDate({ scheduledAt: '2026-09-20' })).toBe('2026-09-20')
  })

  it('keeps failed and rescheduled deliveries out of completed buckets', () => {
    expect(deliveryBucket({ deliveryStatus: 'failed', scheduledDeliveryDate: '2026-09-01' })).toBe('failed')
    expect(deliveryBucket({ deliveryStatus: 'rescheduled', scheduledDeliveryDate: '2026-09-01' })).toBe('rescheduled')
    expect(deliveryBucket({ deliveryStatus: 'delivered', scheduledDeliveryDate: '2026-09-01' })).toBe('delivered')
  })

  it('sorts by bucket, effective date, and stable identifiers', () => {
    const rows = [
      { orderId: 'b', deliveryStatus: 'failed', scheduledDeliveryDate: '2026-09-20' },
      { orderId: 'a', deliveryStatus: 'failed', scheduledDeliveryDate: '2026-09-20' },
      { orderId: 'c', deliveryStatus: 'delivered', scheduledDeliveryDate: '2026-09-20' },
    ]
    expect(sortDriverDeliveries(rows).map((row) => row.orderId)).toEqual(['c', 'a', 'b'])
  })
})