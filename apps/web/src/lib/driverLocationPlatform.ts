import type { DriverLocationProvider } from './driverLocationProvider'
import { NativeAndroidDriverLocationProvider } from './nativeAndroidDriverLocationProvider'
import { WebDriverLocationProvider } from './webDriverLocationProvider'

export function isNativeAndroidRuntime(): boolean {
  const capacitor = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }
  ).Capacitor
  return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === 'android'
}

export function shouldUseNativeDriverLocation(): boolean {
  const raw = import.meta.env.VITE_GPS_NATIVE_TRACKING_ENABLED
  return raw !== 'false' && raw !== '0' && isNativeAndroidRuntime()
}

export function createDriverLocationProvider(): DriverLocationProvider {
  return shouldUseNativeDriverLocation()
    ? new NativeAndroidDriverLocationProvider()
    : new WebDriverLocationProvider()
}
