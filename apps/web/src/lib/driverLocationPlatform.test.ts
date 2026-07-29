import { describe, expect, it, vi } from 'vitest'
import { createDriverLocationProvider, isNativeAndroidRuntime } from './driverLocationPlatform'

describe('driver location platform', () => {
  it('uses the browser provider by default', () => {
    expect(isNativeAndroidRuntime()).toBe(false)
    expect(createDriverLocationProvider()).toBeTruthy()
  })

  it('does not select native tracking from a browser flag alone', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false, getPlatform: () => 'web' })
    expect(isNativeAndroidRuntime()).toBe(false)
  })
})
