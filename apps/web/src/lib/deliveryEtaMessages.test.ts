import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import { getEtaUnavailableMessage } from './deliveryEtaMessages'
import type { RestaurantOrderTrackingResponse } from '../types'

const t = (key: string) => i18n.t(key, { ns: 'fulfillment' })

const base: RestaurantOrderTrackingResponse = {
  orderId: 'o1',
  orderReference: 'ORD-o1',
  trackingEnabled: true,
  etaAvailable: false,
  destinationCoordinatesAvailable: false,
  delivery: { status: 'out_for_delivery', label: 'Out for delivery' },
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

describe('deliveryEtaMessages', () => {
  it('shows missing destination warning', () => {
    expect(getEtaUnavailableMessage(base)).toBe(t('tracking.eta.unavailable.destinationMissing'))
  })

  it('shows start delivery message when destination exists but ETA not ready', () => {
    expect(
      getEtaUnavailableMessage({
        ...base,
        destinationCoordinatesAvailable: true,
      })
    ).toBe(t('tracking.eta.unavailable.startDelivery'))
  })

  it('returns null when ETA is ready', () => {
    expect(
      getEtaUnavailableMessage({
        ...base,
        destinationCoordinatesAvailable: true,
        etaAvailable: true,
      })
    ).toBeNull()
  })
})
