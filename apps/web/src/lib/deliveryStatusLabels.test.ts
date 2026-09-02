import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import { formatDeliveryStatus } from './deliveryStatusLabels'

const t = (key: string) => i18n.t(key, { ns: 'fulfillment' })

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['fulfillment'],
    resources: { en: { fulfillment: enFulfillment } },
    interpolation: { escapeValue: false },
  })
})

describe('deliveryStatusLabels', () => {
  it('formats known delivery statuses', () => {
    expect(formatDeliveryStatus('picked_up')).toBe(t('tracking.deliveryStatus.picked_up'))
    expect(formatDeliveryStatus('out_for_delivery')).toBe(
      t('tracking.deliveryStatus.out_for_delivery')
    )
    expect(formatDeliveryStatus('delivered')).toBe(t('tracking.deliveryStatus.delivered'))
  })

  it('falls back to humanized unknown status', () => {
    expect(formatDeliveryStatus('custom_status')).toBe('custom status')
  })
})
