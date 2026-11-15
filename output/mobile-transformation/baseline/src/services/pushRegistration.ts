import { ApiError, apiRequest } from './api/client'
import {
  clearStoredExpoPushToken,
  getPushPlatform,
  getPushUnavailableReason,
  getStoredExpoPushToken,
  isPushAvailable,
  registerForPushNotificationsAsync,
  unregisterNativePushToken,
} from './push'

export class PushSetupError extends Error {
  code: 'UNAVAILABLE' | 'DENIED' | 'API_ERROR'
  retryable: boolean

  constructor(code: PushSetupError['code'], message: string, retryable = false) {
    super(message)
    this.code = code
    this.retryable = retryable
    this.name = 'PushSetupError'
  }
}

export async function syncPushDevice(): Promise<string> {
  const unavailableReason = getPushUnavailableReason()
  if (unavailableReason || !isPushAvailable()) {
    throw new PushSetupError(
      'UNAVAILABLE',
      unavailableReason ||
        'Remote push requires an installed Supplify EAS build on a supported device.'
    )
  }

  const token = await registerForPushNotificationsAsync()
  if (!token) {
    throw new PushSetupError(
      'DENIED',
      'Notification permission is disabled. Enable notifications for Supplify in device settings.'
    )
  }

  try {
    await apiRequest('/api/push/devices', {
      method: 'POST',
      body: { token, platform: getPushPlatform() },
      timeoutMs: 20_000,
    })
  } catch (error) {
    const retryable = !(error instanceof ApiError && error.status >= 400 && error.status < 500)
    throw new PushSetupError(
      'API_ERROR',
      error instanceof Error ? error.message : 'The server could not register this device.',
      retryable
    )
  }

  return token
}

export async function unregisterStoredPushDevice(): Promise<void> {
  const token = await getStoredExpoPushToken()
  if (!token) return

  let unregisterError: unknown
  try {
    await apiRequest('/api/push/devices', {
      method: 'DELETE',
      body: { token, platform: getPushPlatform() },
      timeoutMs: 10_000,
    })
  } catch (error) {
    unregisterError = error
  } finally {
    await unregisterNativePushToken()
    await clearStoredExpoPushToken()
  }
  if (unregisterError) throw unregisterError
}
