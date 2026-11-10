import { describe, expect, it } from 'vitest'
import { resolveNotificationUrl } from './notificationAlerts'

describe('resolveNotificationUrl', () => {
  it('uses metadata.ctaUrl for billing trial notifications', () => {
    expect(
      resolveNotificationUrl({
        id: 'n1',
        reference_type: 'SUBSCRIPTION',
        reference_id: null,
        metadata: { ctaUrl: '/app/settings?tab=subscription' },
      })
    ).toBe('/app/settings?tab=subscription')
  })

  it('prefers metadata.link over ctaUrl when both are present', () => {
    expect(
      resolveNotificationUrl({
        id: 'n2',
        reference_type: 'SUBSCRIPTION',
        metadata: {
          link: '/app/settings?tab=plan',
          ctaUrl: '/app/settings?tab=subscription',
        },
      })
    ).toBe('/app/settings?tab=plan')
  })

  it('routes SUBSCRIPTION notifications to settings billing when no metadata link', () => {
    expect(
      resolveNotificationUrl({
        id: 'n3',
        reference_type: 'SUBSCRIPTION',
        metadata: {},
      })
    ).toBe('/app/settings?tab=subscription')
  })

  it('does not send billing notifications to a dead /app/billing path', () => {
    const url = resolveNotificationUrl({
      id: 'n4',
      reference_type: 'SUBSCRIPTION',
      metadata: { ctaUrl: '/app/billing' },
    })
    expect(url).not.toBe('/app/billing')
    expect(url.startsWith('/app/settings')).toBe(true)
  })

  it('parses string metadata JSON for ctaUrl', () => {
    expect(
      resolveNotificationUrl({
        id: 'n5',
        reference_type: 'SUBSCRIPTION',
        metadata: JSON.stringify({ ctaUrl: '/app/settings?tab=plan' }),
      })
    ).toBe('/app/settings?tab=plan')
  })
})

describe('resolveNotificationUrl tenant routing', () => {
  const sub = { id: 's1', reference_type: 'SUBSCRIPTION', metadata: {} }

  it('sends suppliers to the plan tab and restaurants to the subscription tab', () => {
    expect(resolveNotificationUrl(sub, { tenantType: 'SUPPLIER' })).toBe('/app/settings?tab=plan')
    expect(resolveNotificationUrl(sub, { tenantType: 'RESTAURANT' })).toBe(
      '/app/settings?tab=subscription'
    )
  })

  it('rewrites a server link that names the other tenant settings tab', () => {
    const withLink = (link: string) => ({ id: 's2', metadata: { link } })
    expect(
      resolveNotificationUrl(withLink('/app/settings?tab=subscription'), {
        tenantType: 'SUPPLIER',
      })
    ).toBe('/app/settings?tab=plan')
    expect(
      resolveNotificationUrl(withLink('/app/settings?tab=plan'), { tenantType: 'RESTAURANT' })
    ).toBe('/app/settings?tab=subscription')
  })

  it('routes restaurant expiry alerts to restaurant inventory', () => {
    const expiry = { id: 'e1', reference_type: 'INVENTORY_EXPIRY' }
    expect(resolveNotificationUrl(expiry, { tenantType: 'RESTAURANT' })).toBe(
      '/app/restaurant-inventory'
    )
    expect(resolveNotificationUrl(expiry, { tenantType: 'SUPPLIER' })).toBe(
      '/app/inventory?tab=expiry'
    )
  })

  it('rejects protocol-relative links', () => {
    expect(resolveNotificationUrl({ id: 'x', metadata: { link: '//evil.example/x' } })).toBe('/app')
    expect(resolveNotificationUrl({ id: 'x', metadata: { ctaUrl: '/\\evil.example' } })).toBe(
      '/app'
    )
  })
})
