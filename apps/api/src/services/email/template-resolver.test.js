import { describe, expect, it } from 'vitest'
import { resolveNotificationTemplate } from './template-resolver.js'

describe('template-resolver', () => {
  it('maps order and auth categories to dedicated templates', () => {
    expect(resolveNotificationTemplate('placed', 'ORDER')).toBe('order.placed')
    expect(resolveNotificationTemplate('welcome', 'SYSTEM')).toBe('auth.welcome')
    expect(resolveNotificationTemplate('admin_new_tenant', 'SYSTEM')).toBe('admin.new_tenant')
  })

  it('maps growth events by category or notification type', () => {
    expect(resolveNotificationTemplate('supplier_connection_request', null)).toBe(
      'supplier.access_request'
    )
    expect(resolveNotificationTemplate(null, 'referral_reward_earned')).toBe(
      'growth.referral_reward'
    )
    expect(resolveNotificationTemplate(null, 'sponsorship_gift_received')).toBe(
      'growth.sponsorship_gift'
    )
  })

  it('falls back to notification.generic for unknown categories', () => {
    expect(resolveNotificationTemplate('unknown_category', 'FOO')).toBe('notification.generic')
  })
})
