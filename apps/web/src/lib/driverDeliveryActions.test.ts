import { describe, expect, it } from 'vitest'
import { getAvailableDriverDeliveryStatuses } from './driverDeliveryActions'

describe('getAvailableDriverDeliveryStatuses', () => {
  it('allows out for delivery from assigned or pending', () => {
    expect(getAvailableDriverDeliveryStatuses('assigned')).toEqual([
      'out_for_delivery',
      'failed',
      'rescheduled',
    ])
    expect(getAvailableDriverDeliveryStatuses('pending')).toContain('out_for_delivery')
  })

  it('does not repeat out for delivery when already en route', () => {
    expect(getAvailableDriverDeliveryStatuses('out_for_delivery')).toEqual([
      'delivered',
      'failed',
      'rescheduled',
    ])
  })

  it('returns no actions for terminal statuses', () => {
    expect(getAvailableDriverDeliveryStatuses('delivered')).toEqual([])
    expect(getAvailableDriverDeliveryStatuses('failed')).toEqual([])
  })
})
