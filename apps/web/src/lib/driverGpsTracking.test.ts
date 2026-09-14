import { describe, expect, it } from 'vitest'
import { isTrackableDeliveryStatus } from './driverGpsTracking'

describe('isTrackableDeliveryStatus', () => {
  it('tracks assigned and active delivery statuses', () => {
    expect(isTrackableDeliveryStatus('assigned')).toBe(true)
    expect(isTrackableDeliveryStatus('picked_up')).toBe(true)
    expect(isTrackableDeliveryStatus('out_for_delivery')).toBe(true)
  })

  // The board reports COALESCE(da.status, 'pending'), so `pending` means there is no
  // driver assignment at all and the location endpoint rejects it. Pings were sent
  // for those orders and each rejection failed the whole batch, so no location was
  // ever stored.
  it('does not track a delivery with no driver assignment', () => {
    expect(isTrackableDeliveryStatus('pending')).toBe(false)
    expect(isTrackableDeliveryStatus(null)).toBe(false)
    expect(isTrackableDeliveryStatus(undefined)).toBe(false)
  })

  it('does not track completed or failed deliveries', () => {
    expect(isTrackableDeliveryStatus('delivered')).toBe(false)
    expect(isTrackableDeliveryStatus('failed')).toBe(false)
    expect(isTrackableDeliveryStatus('rescheduled')).toBe(false)
  })
})
