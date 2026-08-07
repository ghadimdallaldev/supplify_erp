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
