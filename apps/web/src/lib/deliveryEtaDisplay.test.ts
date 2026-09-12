import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import {
  formatDistanceKm,
  formatEtaRange,
  formatSupplierDistanceKm,
  getEtaUnavailableMessage,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
  shouldShowEtaConfidence,
} from './deliveryEtaDisplay'
import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types'

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'fulfillment', ...options })

const restaurantBase: RestaurantOrderTrackingResponse = {
  orderId: 'o1',
  orderReference: 'ORD-o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: true,
  delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
}

const supplierBase: SupplierOrderTrackingResponse = {
  orderId: 'o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: true,
  assignment: { id: 'a1', status: 'out_for_delivery' },
}

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['fulfillment'],
    resources: { en: { fulfillment: enFulfillment } },
    interpolation: { escapeValue: false },
  })
})

describe('deliveryEtaDisplay', () => {
  it('formats ETA range and distance', () => {
    expect(formatEtaRange(12, 18)).toBe(t('tracking.eta.minRange', { min: 12, max: 18 }))
    expect(formatDistanceKm(4.2)).toBe(t('tracking.eta.distanceKm', { km: '4.2' }))
    expect(formatSupplierDistanceKm(7.8)).toBe(t('tracking.eta.supplierDistance', { km: '7.8' }))
  })

  it('shows restaurant primary ETA text when available', () => {
    expect(
      getRestaurantEtaPrimaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 12,
        etaMinutesMax: 18,
      })
    ).toBe(
      t('tracking.eta.restaurant.arrivingIn', {
        range: t('tracking.eta.minutesRange', { min: 12, max: 18 }),
      })
    )
  })

  it('shows supplier primary ETA text when available', () => {
    expect(
      getSupplierEtaPrimaryText({
        ...supplierBase,
        etaAvailable: true,
        etaMinutesMin: 12,
        etaMinutesMax: 18,
      })
    ).toBe(
      t('tracking.eta.supplier.eta', {
        range: t('tracking.eta.minRange', { min: 12, max: 18 }),
      })
    )
    expect(
      getSupplierEtaSecondaryText({
        ...supplierBase,
        etaAvailable: true,
        distanceKm: 7.8,
      })
    ).toBe(t('tracking.eta.supplierDistance', { km: '7.8' }))
  })

  it('shows missing destination warning', () => {
    expect(
      getEtaUnavailableMessage({
        ...restaurantBase,
        destinationCoordinatesAvailable: false,
      })
    ).toBe(t('tracking.eta.unavailable.destinationMissing'))
  })

  it('shows start delivery message for assigned status', () => {
    expect(
      getEtaUnavailableMessage({
        ...restaurantBase,
        delivery: { status: 'assigned', label: 'Assigned' },
      })
    ).toBe(t('tracking.eta.unavailable.startDelivery'))
  })

  it('shows restaurant copy when delivery is later on route', () => {
    expect(
      getRestaurantEtaPrimaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 35,
        etaMinutesMax: 50,
        nextStop: false,
        stopsBefore: 2,
      })
    ).toBe(t('tracking.eta.restaurant.plannedAfterStops', { count: 2 }))
    expect(
      getRestaurantEtaSecondaryText({
        ...restaurantBase,
        etaAvailable: true,
        etaMinutesMin: 35,
        etaMinutesMax: 50,
        nextStop: false,
        stopsBefore: 2,
      })
    ).toBe(
      t('tracking.eta.restaurant.estimatedArrival', {
        range: t('tracking.eta.minutesRange', { min: 35, max: 50 }),
      })
    )
  })

  it('shows supplier route position hints', () => {
    expect(
      getSupplierEtaSecondaryText({
        ...supplierBase,
        etaAvailable: true,
        distanceKm: 7.8,
        stopsBefore: 2,
        routePosition: 3,
        routePositionTotal: 10,
      })
    ).toBe(
      [
        t('tracking.eta.supplier.stopsBefore', { count: 2 }),
        t('tracking.eta.supplier.routePosition', { position: 3, total: 10 }),
        t('tracking.eta.supplierDistance', { km: '7.8' }),
      ].join(' · ')
    )
  })

  it('shows low confidence badge hint for supplier', () => {
    expect(
      shouldShowEtaConfidence({
        ...supplierBase,
        etaAvailable: true,
        confidence: 'LOW',
        etaMinutesMin: 10,
        etaMinutesMax: 15,
      })
    ).toBe(true)
  })
})
