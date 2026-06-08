import { describe, expect, it } from 'vitest'
import {
  getDriverActionsForStatus,
  getDriverStatusTone,
  isActiveDriverDeliveryStatus,
  routeStopIsComplete,
} from './driverDeliveryUi'

describe('driverDeliveryUi', () => {
  it('marks assigned as active with on-the-way as primary action', () => {
    expect(isActiveDriverDeliveryStatus('assigned')).toBe(true)
    expect(getDriverStatusTone('assigned')).toBe('neutral')
    expect(getDriverActionsForStatus('assigned')[0]?.value).toBe('out_for_delivery')
    expect(getDriverActionsForStatus('assigned')[0]?.label).toBe("I'm on the way")
  })

  it('prioritizes delivered for out_for_delivery', () => {
    expect(getDriverActionsForStatus('out_for_delivery')[0]?.value).toBe('delivered')
  })

  it('treats route stops as complete when delivered or failed', () => {
    expect(routeStopIsComplete('DELIVERED')).toBe(true)
    expect(routeStopIsComplete('FAILED')).toBe(true)
    expect(routeStopIsComplete('PLANNED')).toBe(false)
  })
})
