import { DEV_API_ORIGIN, getApiBase, isDevEnv } from './env'

/**
 * Socket.IO base URL.
 * Dev without VITE_API_URL uses the page origin (Vite /socket.io proxy).
 * Preprod/prod require VITE_API_URL (enforced via resolveApiBase in env.ts).
 */
export function getSocketBaseUrl(): string {
  const base = getApiBase()
  if (base) return base
  if (typeof window !== 'undefined' && isDevEnv()) {
    return window.location.origin
  }
  if (isDevEnv()) return DEV_API_ORIGIN
  return base
}
