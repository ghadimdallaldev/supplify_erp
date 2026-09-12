import { describe, expect, it } from 'vitest'
import {
  isPlannedRouteEligibleStatus,
  isDispatchEligibleStatus,
  plannedRouteIneligibleReason,
} from './delivery-route-order-statuses.js'

describe('delivery-route-order-statuses', () => {
  it('allows early planning statuses', () => {
    expect(isPlannedRouteEligibleStatus('PLACED')).toBe(true)
    expect(isPlannedRouteEligibleStatus('ACKNOWLEDGED')).toBe(true)
    expect(isPlannedRouteEligibleStatus('PROCESSING')).toBe(true)
    expect(isPlannedRouteEligibleStatus('SHIPPED')).toBe(true)
  })

  it('blocks cancelled and completed orders from planning', () => {
    expect(plannedRouteIneligibleReason('CANCELLED')).toMatch(/cancelled/i)
    expect(plannedRouteIneligibleReason('DELIVERED')).toMatch(/completed/i)
  })

  it('allows dispatch activation for ready statuses only', () => {
    expect(isDispatchEligibleStatus('SHIPPED')).toBe(true)
    expect(isDispatchEligibleStatus('PROCESSING')).toBe(true)
    expect(isDispatchEligibleStatus('PLACED')).toBe(false)
  })
})
