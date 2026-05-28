import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('registerServiceWorker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers sw.js once on window load in production', async () => {
    vi.stubEnv('MODE', 'production')

    const register = vi.fn().mockResolvedValue(undefined)
    const addEventListener = vi.fn()

    vi.stubGlobal('window', {
      addEventListener,
    })
    vi.stubGlobal('navigator', {
      serviceWorker: { register },
    })

    const { registerServiceWorker } = await import('./registerServiceWorker')
    registerServiceWorker()
    registerServiceWorker()

    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener.mock.calls[0][0]).toBe('load')

    const onLoad = addEventListener.mock.calls[0][1] as () => void
    onLoad()
    expect(register).toHaveBeenCalledWith('/sw.js')
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('clears service workers and skips registration in dev', async () => {
    vi.stubEnv('MODE', 'development')

    const unregister = vi.fn().mockResolvedValue(true)
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }])
    const addEventListener = vi.fn()
    const cacheDelete = vi.fn().mockResolvedValue(true)
    const cacheKeys = vi.fn().mockResolvedValue(['supplify-static-v1'])

    vi.stubGlobal('window', {
      addEventListener,
      caches: { keys: cacheKeys, delete: cacheDelete },
    })
    vi.stubGlobal('navigator', {
      serviceWorker: { register: vi.fn(), getRegistrations },
    })

    const { registerServiceWorker } = await import('./registerServiceWorker')
    registerServiceWorker()

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getRegistrations).toHaveBeenCalled()
    expect(unregister).toHaveBeenCalled()
    expect(cacheKeys).toHaveBeenCalled()
    expect(cacheDelete).toHaveBeenCalledWith('supplify-static-v1')
    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('no-ops when service workers are unavailable', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubGlobal('window', { addEventListener: vi.fn() })
    vi.stubGlobal('navigator', {})

    const { registerServiceWorker } = await import('./registerServiceWorker')
    expect(() => registerServiceWorker()).not.toThrow()
  })
})
