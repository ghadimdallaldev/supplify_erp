import type { DriverLocationProvider } from './driverLocationProvider'
import { WebDriverLocationProvider } from './webDriverLocationProvider'

export function createDriverLocationProvider(): DriverLocationProvider {
  return new WebDriverLocationProvider()
}
