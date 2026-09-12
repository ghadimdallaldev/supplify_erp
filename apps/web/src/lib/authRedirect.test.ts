import { describe, expect, it, vi } from 'vitest'

describe('getOAuthStartUrl', () => {
  it('uses the API origin in dev when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubEnv('DEV', 'true')
    vi.resetModules()
    const { getOAuthStartUrl } = await import('./authRedirect')
    expect(getOAuthStartUrl('login')).toBe('http://localhost:4000/auth/login')
    vi.unstubAllEnvs()
  })

  it('uses VITE_API_URL when configured', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000')
    vi.stubEnv('DEV', 'true')
    vi.resetModules()
    const { getOAuthStartUrl } = await import('./authRedirect')
    expect(getOAuthStartUrl('register')).toBe('http://localhost:4000/auth/register')
    vi.unstubAllEnvs()
  })
})
