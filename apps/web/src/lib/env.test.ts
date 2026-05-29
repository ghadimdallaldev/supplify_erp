import { afterEach, describe, expect, it, vi } from 'vitest'

describe('hosted web config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('requires VITE_API_URL when VITE_APP_ENV is prod', async () => {
    vi.stubEnv('VITE_APP_ENV', 'prod')
    vi.stubEnv('DEV', '')
    vi.stubEnv('VITE_API_URL', '')
    const { resolveApiBase } = await import('./env')
    expect(() => resolveApiBase()).toThrow(/VITE_API_URL/)
  })

  it('allows empty API base in dev with Vite proxy', async () => {
    vi.stubEnv('VITE_APP_ENV', 'dev')
    vi.stubEnv('DEV', 'true')
    vi.stubEnv('VITE_API_URL', '')
    const { resolveApiBase } = await import('./env')
    expect(resolveApiBase()).toBe('')
  })

  it('uses configured VITE_API_URL in preprod', async () => {
    vi.stubEnv('VITE_APP_ENV', 'preprod')
    vi.stubEnv('DEV', '')
    vi.stubEnv('VITE_API_URL', 'https://api.preprod.example.com')
    const { resolveApiBase } = await import('./env')
    expect(resolveApiBase()).toBe('https://api.preprod.example.com')
  })
})
