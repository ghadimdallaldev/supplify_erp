import { describe, expect, it } from 'vitest'
import {
  getAvailableDriverDeliveryStatuses,
  driverStatusNeedsProofOfDelivery,
} from './driverDeliveryActions'

describe('getAvailableDriverDeliveryStatuses', () => {
  it('allows out for delivery from assigned', () => {
    expect(getAvailableDriverDeliveryStatuses('assigned')).toEqual([
      'out_for_delivery',
      'failed',
      'rescheduled',
    ])
  })

  // A dispatcher-set picked_up must not skip the departure step — offering
  // "Delivered" there let a single tap deliver an order the driver had not started,
  // and meant GPS tracking never began.
  it('still requires the departure step when the load is only picked up', () => {
    expect(getAvailableDriverDeliveryStatuses('picked_up')[0]).toBe('out_for_delivery')
  })

  it('does not repeat out for delivery when already en route', () => {
    expect(getAvailableDriverDeliveryStatuses('out_for_delivery')).toEqual([
      'delivered',
      'failed',
      'rescheduled',
    ])
  })

  // No driver assignment exists for a pending order, so every status call 400s.
  it('offers no actions for an unassigned delivery', () => {
    expect(getAvailableDriverDeliveryStatuses('pending')).toEqual([])
  })

  it('returns no actions for terminal statuses', () => {
    expect(getAvailableDriverDeliveryStatuses('delivered')).toEqual([])
    expect(getAvailableDriverDeliveryStatuses('failed')).toEqual([])
  })

  it('returns no actions for a rescheduled delivery pending re-dispatch', () => {
    expect(getAvailableDriverDeliveryStatuses('rescheduled')).toEqual([])
  })
})

describe('driverStatusNeedsProofOfDelivery', () => {
  // Marking delivered is irreversible and the API rejects it outright when the
  // supplier requires proof, so it must route through capture rather than fire.
  it('requires proof capture for delivered only', () => {
    expect(driverStatusNeedsProofOfDelivery('delivered')).toBe(true)
    expect(driverStatusNeedsProofOfDelivery('out_for_delivery')).toBe(false)
    expect(driverStatusNeedsProofOfDelivery('failed')).toBe(false)
    expect(driverStatusNeedsProofOfDelivery('rescheduled')).toBe(false)
  })
})
