import { describe, expect, it } from 'vitest'
import { isTrackableDeliveryStatus } from './driverGpsTracking'

describe('isTrackableDeliveryStatus', () => {
  it('tracks assigned and active delivery statuses', () => {
    expect(isTrackableDeliveryStatus('assigned')).toBe(true)
    expect(isTrackableDeliveryStatus('picked_up')).toBe(true)
    expect(isTrackableDeliveryStatus('out_for_delivery')).toBe(true)
  })

  it('tracks pending board status (assigned driver, not yet out)', () => {
    expect(isTrackableDeliveryStatus('pending')).toBe(true)
  })

  it('does not track completed or failed deliveries', () => {
    expect(isTrackableDeliveryStatus('delivered')).toBe(false)
    expect(isTrackableDeliveryStatus('failed')).toBe(false)
    expect(isTrackableDeliveryStatus('rescheduled')).toBe(false)
  })
})
