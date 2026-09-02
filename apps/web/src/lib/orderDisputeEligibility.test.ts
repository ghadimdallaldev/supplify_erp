import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enDisputes from '../i18n/locales/en/disputes.json'
import {
  DISPUTE_ELIGIBLE_ORDER_STATUSES,
  disputeEligibilityMessage,
  isOrderEligibleForDispute,
} from './orderDisputeEligibility'

const t = (key: string) => i18n.t(key, { ns: 'disputes' })

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['disputes'],
    resources: { en: { disputes: enDisputes } },
    interpolation: { escapeValue: false },
  })
})

describe('orderDisputeEligibility', () => {
  it('returns true for eligible delivered/received statuses', () => {
    for (const status of DISPUTE_ELIGIBLE_ORDER_STATUSES) {
      expect(isOrderEligibleForDispute(status)).toBe(true)
    }
  })

  it('returns false for in-flight order statuses', () => {
    expect(isOrderEligibleForDispute('SHIPPED')).toBe(false)
    expect(isOrderEligibleForDispute('PLACED')).toBe(false)
    expect(isOrderEligibleForDispute(undefined)).toBe(false)
  })

  it('returns localized message when not eligible', () => {
    expect(disputeEligibilityMessage('SHIPPED')).toBe(t('eligibility.notEligible'))
    expect(disputeEligibilityMessage('DELIVERED')).toBe('')
  })
})
