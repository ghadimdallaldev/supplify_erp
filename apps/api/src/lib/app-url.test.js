import { describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: { WEB_ORIGIN: 'https://app.supplify.test' },
}))

describe('buildAppUrl', () => {
  it('prefixes relative paths with WEB_ORIGIN', async () => {
    const { buildAppUrl } = await import('./app-url.js')
    expect(buildAppUrl('/app/orders')).toBe('https://app.supplify.test/app/orders')
    expect(buildAppUrl('app/orders')).toBe('https://app.supplify.test/app/orders')
  })

  it('leaves absolute URLs unchanged', async () => {
    const { buildAppUrl } = await import('./app-url.js')
    expect(buildAppUrl('https://other.test/path')).toBe('https://other.test/path')
  })

  it('returns null for empty input', async () => {
    const { buildAppUrl } = await import('./app-url.js')
    expect(buildAppUrl('')).toBeNull()
    expect(buildAppUrl(null)).toBeNull()
  })
})
