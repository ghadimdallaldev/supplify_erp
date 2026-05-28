import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('registerServiceWorker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('registers sw.js once on window load without throwing', async () => {
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

  it('no-ops when service workers are unavailable', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() })
    vi.stubGlobal('navigator', {})

    const { registerServiceWorker } = await import('./registerServiceWorker')
    expect(() => registerServiceWorker()).not.toThrow()
  })
})
