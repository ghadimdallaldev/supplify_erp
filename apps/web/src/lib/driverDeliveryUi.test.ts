import { beforeAll, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import enFulfillment from '../i18n/locales/en/fulfillment.json'
import {
  getDriverActionsForStatus,
  getDriverStatusTone,
  isActiveDriverDeliveryStatus,
  routeStopIsComplete,
} from './driverDeliveryUi'

const t = (key: string, options?: Record<string, unknown>) =>
  i18n.t(key, { ns: 'fulfillment', ...options })

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['fulfillment'],
    resources: { en: { fulfillment: enFulfillment } },
    interpolation: { escapeValue: false },
  })
})

describe('driverDeliveryUi', () => {
  it('marks assigned as active with on-the-way as primary action', () => {
    expect(isActiveDriverDeliveryStatus('assigned')).toBe(true)
    expect(getDriverStatusTone('assigned')).toBe('neutral')
    expect(getDriverActionsForStatus('assigned')[0]?.value).toBe('out_for_delivery')
    expect(getDriverActionsForStatus('assigned')[0]?.label).toBe(t('driverDeliveries.onTheWay'))
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
