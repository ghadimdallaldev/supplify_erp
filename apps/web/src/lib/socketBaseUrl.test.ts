import { describe, expect, it, vi } from 'vitest'

describe('getSocketBaseUrl', () => {
  it('uses VITE_API_URL when set', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/')
    vi.resetModules()
    const { getSocketBaseUrl } = await import('./socketBaseUrl')
    expect(getSocketBaseUrl()).toBe('http://localhost:4000')
    vi.unstubAllEnvs()
  })

  it('uses window origin in dev when VITE_API_URL is unset (Vite /socket.io proxy)', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
    vi.resetModules()
    const { getSocketBaseUrl } = await import('./socketBaseUrl')
    expect(getSocketBaseUrl()).toBe('http://localhost:5173')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
