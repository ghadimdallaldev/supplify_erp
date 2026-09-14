import { describe, expect, it } from 'vitest'
import { createDriverLocationProvider } from './driverLocationPlatform'
import { WebDriverLocationProvider } from './webDriverLocationProvider'

describe('driver location platform', () => {
  it('uses the browser provider', () => {
    expect(createDriverLocationProvider()).toBeInstanceOf(WebDriverLocationProvider)
  })
})
