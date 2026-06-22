import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enOrders from '../i18n/locales/en/orders.json'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import {
  getRestaurantTrackingMessage,
  shouldPollRestaurantTracking,
  canShowRestaurantReceiveCta,
} from './restaurantTrackingMessages'
import type { RestaurantOrderTrackingResponse } from '../types'

const ot = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'orders', ...options })

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

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['orders', 'fulfillment'],
    resources: {
      en: { orders: enOrders, fulfillment: enFulfillment },
    },
    interpolation: { escapeValue: false },
  })
})

describe('restaurantTrackingMessages', () => {
  it('returns no driver message when pending', () => {
    expect(
      getRestaurantTrackingMessage({
        ...base,
        delivery: null,
      })
    ).toBe(ot('tracking.messages.pendingDriver'))
  })

  it('returns live message', () => {
    expect(getRestaurantTrackingMessage(base)).toBe(
      ot('tracking.messages.liveWithTime', { time: '1 minute ago' })
    )
  })

  it('returns stale message', () => {
    expect(
      getRestaurantTrackingMessage({
        ...base,
        tracking: { ...base.tracking!, isStale: true },
      })
    ).toBe(ot('tracking.messages.staleWithTime', { time: '1 minute ago' }))
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
    ).toBe(ot('tracking.messages.failed'))
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
