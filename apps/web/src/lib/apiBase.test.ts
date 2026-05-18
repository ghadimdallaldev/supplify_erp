import { describe, expect, it, vi } from 'vitest'

describe('apiUrl', () => {
  it('returns relative path when API_BASE is empty', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.resetModules()
    const { apiUrl } = await import('./apiBase')
    const params = new URLSearchParams({ period: '30' })
    expect(apiUrl('/api/orders/calendar', params)).toBe('/api/orders/calendar?period=30')
    vi.unstubAllEnvs()
  })

  it('builds absolute URL when API_BASE is set', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000')
    vi.resetModules()
    const { apiUrl } = await import('./apiBase')
    expect(apiUrl('/api/billing/status')).toBe('http://localhost:4000/api/billing/status')
    vi.unstubAllEnvs()
  })
})
