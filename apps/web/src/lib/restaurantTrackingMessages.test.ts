import { describe, it, expect } from 'vitest'
import {
  getRestaurantTrackingMessage,
  shouldPollRestaurantTracking,
  canShowRestaurantReceiveCta,
} from './restaurantTrackingMessages'
import type { RestaurantOrderTrackingResponse } from '../types'

const base: RestaurantOrderTrackingResponse = {
  orderId: 'o1',
  trackingEnabled: true,
  etaAvailable: false,
  delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
  tracking: {
    enabled: true,
    hasLocation: true,
    lastSeenAt: '2026-06-03T10:00:00Z',
    isStale: false,
    latestLocation: {
      latitude: 33.89,
      longitude: 35.5,
      recordedAt: '2026-06-03T10:00:00Z',
    },
    lastUpdatedLabel: '1 minute ago',
  },
}

describe('restaurantTrackingMessages', () => {
  it('returns no driver message when pending', () => {
    expect(
      getRestaurantTrackingMessage({
        ...base,
        delivery: null,
      })
    ).toContain('assigns a driver')
  })

  it('returns live message', () => {
    expect(getRestaurantTrackingMessage(base)).toContain('on the way')
  })

  it('returns stale message', () => {
    expect(
      getRestaurantTrackingMessage({
        ...base,
        tracking: { ...base.tracking!, isStale: true },
      })
    ).toContain('not updated recently')
  })

  it('polls only for active delivery', () => {
    expect(shouldPollRestaurantTracking(base, 'SHIPPED')).toBe(true)
    expect(
      shouldPollRestaurantTracking(
        { ...base, delivery: { status: 'delivered', label: 'Delivered' } },
        'DELIVERED'
      )
    ).toBe(false)
  })

  it('returns failed delivery message', () => {
    expect(
      getRestaurantTrackingMessage({
        ...base,
        delivery: { status: 'failed', label: 'Failed' },
      })
    ).toContain('could not be completed')
  })

  it('does not poll when delivery failed', () => {
    expect(
      shouldPollRestaurantTracking(
        { ...base, delivery: { status: 'failed', label: 'Failed' } },
        'SHIPPED'
      )
    ).toBe(false)
  })

  it('shows receive CTA when delivered', () => {
    expect(
      canShowRestaurantReceiveCta(
        { ...base, delivery: { status: 'delivered', label: 'Delivered' } },
        'DELIVERED'
      )
    ).toBe(true)
  })
})
