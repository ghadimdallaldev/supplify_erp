import { useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { PushSetupError, syncPushDevice } from '../../services/pushRegistration'

export type PushRegistrationStatus =
  | { state: 'idle'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'ready'; message: string }
  | { state: 'unavailable' | 'denied' | 'error'; message: string }

let registrationStatus: PushRegistrationStatus = {
  state: 'idle',
  message: 'Push setup has not been checked yet.',
}
const statusListeners = new Set<() => void>()

function publishStatus(status: PushRegistrationStatus) {
  registrationStatus = status
  statusListeners.forEach((listener) => listener())
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function usePushRegistrationStatus() {
  return useSyncExternalStore(
    subscribeStatus,
    () => registrationStatus,
    () => registrationStatus
  )
}

export async function retryPushRegistration(): Promise<string> {
  publishStatus({ state: 'checking', message: 'Registering this device for push…' })
  try {
    const token = await syncPushDevice()
    publishStatus({ state: 'ready', message: 'This device is registered for push notifications.' })
    return token
  } catch (error) {
    const state =
      error instanceof PushSetupError && error.code === 'UNAVAILABLE'
        ? 'unavailable'
        : error instanceof PushSetupError && error.code === 'DENIED'
          ? 'denied'
          : 'error'
    publishStatus({
      state,
      message: error instanceof Error ? error.message : 'Push registration failed.',
    })
    throw error
  }
}

function shouldRetry(error: unknown): boolean {
  return error instanceof PushSetupError ? error.retryable : true
}

const RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000]

export function usePushRegistration() {
  const { user, isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return

    let cancelled = false
    let inFlight = false
    let retryAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const run = async (resetRetries = false) => {
      if (cancelled || inFlight) return
      if (resetRetries) retryAttempt = 0
      inFlight = true
      try {
        await retryPushRegistration()
        retryAttempt = 0
      } catch (error) {
        console.warn('[push] Device registration failed', error)
        if (!cancelled && shouldRetry(error) && retryAttempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[retryAttempt]
          retryAttempt += 1
          retryTimer = setTimeout(() => {
            void run()
          }, delay)
        }
      } finally {
        inFlight = false
      }
    }

    void run(true)
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run(true)
    })

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      appStateSubscription.remove()
    }
  }, [isAuthenticated, isLoading, user?.id, user?.workspace?.tenantId])
}
