import { describe, expect, it } from 'vitest'
import { t } from './index.js'

describe('api i18n t()', () => {
  it('resolves English notification keys', () => {
    expect(t('notifications.order.placed.title', 'en')).toBe('New Order Received')
  })

  it('resolves Arabic notification keys', () => {
    expect(t('notifications.order.placed.title', 'ar')).toBe('طلب جديد مستلم')
  })

  it('interpolates params', () => {
    expect(t('consumer.ordering.live', 'en', { end: '10:00 PM' })).toBe(
      'Open for orders until 10:00 PM.'
    )
  })

  it('falls back to English for unknown locale', () => {
    expect(t('consumer.order.placed', 'fr')).toBe('Order placed successfully')
  })

  it('returns the key when missing', () => {
    expect(t('notifications.missing.key', 'en')).toBe('notifications.missing.key')
  })
})
